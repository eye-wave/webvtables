use alloc::{boxed::Box, vec};
use microfft::Complex32;

use super::{BUFFER_LEN, Buffer, MAX_PARAMS, Param, ZERO_BUFFER};
use crate::ffi;

pub const PI32: f32 = core::f32::consts::PI;
pub const TAU32: f32 = core::f32::consts::TAU;

pub fn sine_table() -> &'static Buffer {
    static mut T: Buffer = [0.0; BUFFER_LEN];
    static mut READY: bool = false;
    unsafe {
        if !READY {
            for (i, t) in T.iter_mut().enumerate() {
                *t = ffi::sin(core::f64::consts::TAU * i as f64 / BUFFER_LEN as f64) as f32;
            }
            READY = true;
        }
        &T
    }
}

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

#[inline]
pub fn map1(inputs: &[&Buffer], out: &mut Buffer, f: impl Fn(f32) -> f32) {
    let src = input(inputs, 0);
    for i in 0..BUFFER_LEN {
        out[i] = f(src[i]);
    }
}

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

pub fn boxed<T: Clone, const M: usize>(v: T) -> Box<[T; M]> {
    match vec![v; M].into_boxed_slice().try_into() {
        Ok(b) => b,
        Err(_) => unreachable!(),
    }
}

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

fn twiddles() -> &'static [Complex32; BUFFER_LEN / 2] {
    static mut T: [Complex32; BUFFER_LEN / 2] = [Complex32::new(0.0, 0.0); BUFFER_LEN / 2];
    static mut READY: bool = false;
    unsafe {
        if !READY {
            for (k, t) in T.iter_mut().enumerate() {
                let a = TAU32 * k as f32 / BUFFER_LEN as f32;
                *t = Complex32::new(ffi::cosf(a), ffi::sinf(a));
            }
            READY = true;
        }
        &T
    }
}

pub fn irfft_2048(spec: &[Complex32; BUFFER_LEN / 2], out: &mut Buffer) {
    const M: usize = BUFFER_LEN / 2;
    let tw = twiddles();
    let mut z: Box<[Complex32; M]> = boxed(Complex32::new(0.0, 0.0));

    for k in 0..M {
        let (xk, xm) = if k == 0 {
            (
                Complex32::new(spec[0].re, 0.0),
                Complex32::new(spec[0].im, 0.0),
            )
        } else {
            (spec[k], spec[M - k])
        };
        let xm = xm.conj();
        let e = (xk + xm) * 0.5;
        let o = (xk - xm) * 0.5 * tw[k];
        z[k] = e + Complex32::new(-o.im, o.re);
    }

    let z = microfft::inverse::ifft_1024(&mut z);
    for (m, v) in z.iter().enumerate() {
        out[2 * m] = v.re;
        out[2 * m + 1] = v.im;
    }
}

pub fn fft_combine(
    a: &Buffer,
    b: &Buffer,
    out: &mut Buffer,
    f: impl Fn(f32, f32, f32, f32) -> (f32, f32),
) {
    let mut sa = copy_of(a);
    let mut sb = copy_of(b);
    let fa = microfft::real::rfft_2048(&mut sa);
    let fb = microfft::real::rfft_2048(&mut sb);
    let (dc, ny) = (
        f(fa[0].re, 0.0, fb[0].re, 0.0).0,
        f(fa[0].im, 0.0, fb[0].im, 0.0).0,
    );
    for (x, y) in fa.iter_mut().zip(fb.iter()) {
        let (re, im) = f(x.re, x.im, y.re, y.im);
        x.re = re;
        x.im = im;
    }
    fa[0].re = dc;
    fa[0].im = ny;
    irfft_2048(fa, out);
}

pub fn sample_linear(src: &Buffer, p: f32) -> f32 {
    let x = p * BUFFER_LEN as f32;
    let i = x as usize;
    let f = x - i as f32;

    let (a, b) = (src[i % BUFFER_LEN], src[(i + 1) % BUFFER_LEN]);
    a + f * (b - a)
}
