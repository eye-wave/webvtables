use crate::ffi;
use crate::graph::{BUFFER_LEN, Buffer, Param, ZERO_BUFFER, consts::MAX_PARAMS};

pub const PI64: f64 = core::f64::consts::PI;
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
pub fn param_bool(params: &[Option<Param>; MAX_PARAMS], idx: usize, default: bool) -> bool {
    param(params, idx, if default { 1.0 } else { 0.0 }) as u8 == 1
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
