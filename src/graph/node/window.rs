use super::NodeLogic;
use super::helpers;
use crate::ffi;
use crate::graph::BUFFER_LEN_F32;
use crate::graph::node::helpers::PI32;
use crate::graph::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeState, Param};

pub struct WindowNode;

impl NodeLogic for WindowNode {
    fn title(&self) -> &'static str {
        "Window"
    }

    fn category(&self) -> super::NodeCategory {
        super::NodeCategory::Effect
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        crate::params![
            Param::new_linear("Size", 0.0, 50.0)
                .with_unit("%")
                .with_default_denormf(15.0),
            Param::new_enum(
                "Type",
                &[
                    "Hann", "Hamming", "Blackman", "BH", "Bartlett", "Welch", "Sine"
                ],
            ),
        ]
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut NodeState,
        out: &mut Buffer,
    ) {
        let win_size = helpers::param(params, 0, 15.0) as f32 / 100.0;
        let win_type = helpers::param(params, 1, 0.0) as u8;

        let src = helpers::input(inputs, 0);
        let taper_len = (win_size * BUFFER_LEN_F32) as usize;

        macro_rules! loop_over {
            ($win_fn:expr) => {
                for i in 0..BUFFER_LEN {
                    let w = edge_gain(i, taper_len, BUFFER_LEN, $win_fn);
                    out[i] = src[i] * w;
                }
            };
        }

        match win_type {
            0 => loop_over!(hann),
            1 => loop_over!(hamming),
            2 => loop_over!(blackman),
            3 => loop_over!(blackman_harris),
            4 => loop_over!(bartlett),
            5 => loop_over!(welch),
            6 => loop_over!(sine),
            _ => helpers::pass(inputs, out),
        }
    }
}

fn edge_gain(i: usize, taper_len: usize, len: usize, win_fn: fn(f32) -> f32) -> f32 {
    if taper_len == 0 {
        return 1.0;
    }
    if i < taper_len {
        win_fn(i as f32 / taper_len as f32)
    } else if i >= len - taper_len {
        win_fn((len - 1 - i) as f32 / taper_len as f32)
    } else {
        1.0
    }
}

#[inline]
fn hann(x: f32) -> f32 {
    0.5 * (1.0 - ffi::cosf(x * PI32))
}

#[inline]
fn hamming(x: f32) -> f32 {
    0.54 - 0.46 * ffi::cosf(x * PI32)
}

#[inline]
fn blackman(x: f32) -> f32 {
    0.42 - 0.5 * ffi::cosf(x * PI32) + 0.08 * ffi::cosf(2.0 * PI32 * x)
}

#[inline]
fn blackman_harris(x: f32) -> f32 {
    0.35875 - 0.48829 * ffi::cosf(PI32 * x) + 0.14128 * ffi::cosf(2.0 * PI32 * x)
        - 0.01168 * ffi::cosf(3.0 * PI32 * x)
}

#[inline]
fn bartlett(x: f32) -> f32 {
    x
}

#[inline]
fn welch(x: f32) -> f32 {
    1.0 - (1.0 - x) * (1.0 - x)
}

#[inline]
fn sine(x: f32) -> f32 {
    ffi::sinf(0.5 * PI32 * x)
}
