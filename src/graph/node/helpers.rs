use alloc::{boxed::Box, vec};
use microfft::Complex32;

use super::{BUFFER_LEN, Buffer, MAX_PARAMS, Param, ZERO_BUFFER};
use crate::ffi;

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
pub fn normalize_buffer(out: &mut Buffer) {
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
    inputs.get(idx).copied().unwrap_or(&ZERO_BUFFER)
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

/// Log-frequency response curve for filter widgets. `ratio(bin)` is the filter's linear gain at
/// that FFT bin; `out` gets dB scaled so +-30 dB is full height. Returns the point count.
pub fn response_curve(out: &mut Buffer, mix: f32, ratio: impl Fn(f32) -> f32) -> usize {
    const POINTS: usize = 256;
    const DB_RANGE: f32 = 30.0;
    let bins = (BUFFER_LEN / 2) as f32;
    for (i, o) in out[..POINTS].iter_mut().enumerate() {
        let bin = ffi::powf(bins, i as f32 / (POINTS - 1) as f32).clamp(1.0, bins - 1.0);
        let mixed = (1.0 - mix) + mix * ratio(bin);
        *o = 20.0 * ffi::log10f(mixed.max(1e-6)) / DB_RANGE;
    }
    POINTS
}

/// Heap array filled with `v`; the vec -> boxed slice -> array route never puts `[T; M]` on the stack.
pub fn boxed<T: Clone, const M: usize>(v: T) -> Box<[T; M]> {
    match vec![v; M].into_boxed_slice().try_into() {
        Ok(b) => b,
        Err(_) => unreachable!(),
    }
}

/// Heap copy of a buffer (FFTs run in place, so they need an owned scratch).
pub fn copy_of(src: &Buffer) -> Box<Buffer> {
    let mut b = boxed(0.0);
    b.copy_from_slice(src);
    b
}

pub fn unpack_real_fft(spectrum: &[Complex32; BUFFER_LEN / 2]) -> Box<[Complex32; BUFFER_LEN]> {
    let mut full: Box<[Complex32; BUFFER_LEN]> = boxed(Complex32::new(0.0, 0.0));

    full[0] = Complex32::new(spectrum[0].re, 0.0);
    full[BUFFER_LEN / 2] = Complex32::new(spectrum[0].im, 0.0);

    for k in 1..BUFFER_LEN / 2 {
        full[k] = spectrum[k];
        full[BUFFER_LEN - k] = spectrum[k].conj();
    }

    full
}
