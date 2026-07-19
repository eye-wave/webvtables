use microfft::Complex32;

use crate::ffi;
use crate::graph::{BUFFER_LEN, Buffer, Param, ZERO_BUFFER, consts::MAX_PARAMS};

pub const PI32: f32 = core::f32::consts::PI;
pub const TAU32: f32 = core::f32::consts::TAU;

/// Denormalized value of `params[idx]`, or `default` if that slot is empty.
#[inline]
pub fn param(params: &[Option<Param>; MAX_PARAMS], idx: usize, default: f64) -> f64 {
    params
        .get(idx)
        .and_then(|p| p.as_ref())
        .map(|p| p.denorm())
        .unwrap_or(default)
}

#[inline]
pub fn normalize_buffer(out: &mut crate::graph::Buffer) {
    let peak = out.iter().fold(0.0f32, |max, &x| max.max(x.abs()));

    if peak > 0.0 {
        let gain = 1.0 / peak;

        for x in out.iter_mut() {
            *x *= gain;
        }
    }
}

#[inline]
pub fn param_db(params: &[Option<Param>; MAX_PARAMS], idx: usize, default: f64) -> f64 {
    let v = param(params, idx, default);
    db_to_value(v)
}

#[inline]
pub fn input<'a>(inputs: &[&'a Buffer], idx: usize) -> &'a Buffer {
    inputs.get(idx).unwrap_or(&&ZERO_BUFFER)
}

#[inline]
pub fn pass(inputs: &[&Buffer], out: &mut Buffer) {
    let src = input(inputs, 0);
    out[..BUFFER_LEN].copy_from_slice(&src[..BUFFER_LEN])
}

#[inline]
pub fn db_to_value(db: f64) -> f64 {
    ffi::exp(db * core::f64::consts::LN_10 / 20.0)
}

/// Per-sample transform of input 0 into `out`. Covers every 1-in effect node.
#[inline]
pub fn map1(inputs: &[&Buffer], out: &mut Buffer, f: impl Fn(f32) -> f32) {
    let src = input(inputs, 0);
    for i in 0..BUFFER_LEN {
        out[i] = f(src[i]);
    }
}

/// Per-sample transform of inputs 0 and 1 into `out`. Covers every 2-in combine node.
#[inline]
pub fn map2(inputs: &[&Buffer], out: &mut Buffer, f: impl Fn(f32, f32) -> f32) {
    let a = input(inputs, 0);
    let b = input(inputs, 1);
    for i in 0..BUFFER_LEN {
        out[i] = f(a[i], b[i]);
    }
}

/// Builds a `[Option<Param>; MAX_PARAMS]`, skipping the `[None; N]; p[i] = Some(..); p` dance.
/// `params![a, b, c]` -> slots 0, 1, 2 filled, rest `None`.
#[macro_export]
macro_rules! params {
    ($($p:expr),* $(,)?) => {{
        let mut p = [None; $crate::graph::consts::MAX_PARAMS];
        let set: [Option<$crate::graph::Param>; _] = [$(Some($p)),*];
        p[..set.len()].copy_from_slice(&set);
        p
    }};
}

#[inline(always)]
pub fn magnitude(c: &Complex32) -> f32 {
    ffi::sqrtf(c.re * c.re + c.im * c.im)
}

#[inline(always)]
pub fn phase(c: &Complex32) -> f32 {
    ffi::atan2f(c.im, c.re)
}

#[inline(always)]
pub fn mag_phase(c: &Complex32) -> (f32, f32) {
    let mag2 = c.re * c.re + c.im * c.im;
    let mag = ffi::sqrtf(mag2);
    let phase = ffi::atan2f(c.im, c.re);
    (mag, phase)
}

#[inline(always)]
pub fn from_mag_phase(mag: f32, phase: f32) -> Complex32 {
    Complex32 {
        re: mag * ffi::cosf(phase),
        im: mag * ffi::sinf(phase),
    }
}

#[inline(always)]
pub fn unpack_real_fft(spectrum: &[Complex32; BUFFER_LEN / 2]) -> [Complex32; BUFFER_LEN] {
    let mut full = [Complex32::new(0.0, 0.0); BUFFER_LEN];

    full[0] = Complex32::new(spectrum[0].re, 0.0);
    full[BUFFER_LEN / 2] = Complex32::new(spectrum[0].im, 0.0);

    for k in 1..BUFFER_LEN / 2 {
        full[k] = spectrum[k];
        full[BUFFER_LEN - k] = spectrum[k].conj();
    }

    full
}
