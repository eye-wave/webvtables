use crate::ffi;
use crate::graph::node::helpers::PI32;
use crate::graph::{BUFFER_LEN, Buffer, Param, consts::*, node_colors};

use super::helpers;
use super::{NodeLogic, NodeState};

pub struct SaturationNode;

impl NodeLogic for SaturationNode {
    fn title(&self) -> &'static str {
        "Saturation"
    }

    fn category(&self) -> super::NodeCategory {
        super::NodeCategory::Distortion
    }

    fn header_color(&self) -> [u8; 3] {
        node_colors::EFFECT
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        let mut p = [None; MAX_PARAMS];

        p[0] = Some(Param::new_enum(
            "Shape",
            &["Soft clip", "Hard clip", "Lin warp", "Sin warp"],
        ));
        p[1] = Some(
            Param::new_linear("In", -40.0, 60.0)
                .with_unit("dB")
                .with_default_denormf(0.0),
        );
        p[2] = Some(
            Param::new_linear("Out", -40.0, 10.0)
                .with_unit("dB")
                .with_default_denormf(0.0),
        );
        p[3] = Some(
            Param::new_linear("Mix", 0.0, 100.0)
                .with_unit("%")
                .with_default_norm(1.0),
        );

        p
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut NodeState,
        out: &mut Buffer,
    ) {
        let shape = helpers::param(params, 0, 0.0) as u8;
        let gain_in = helpers::param_db(params, 1, 0.0) as f32;
        let gain_out = helpers::param_db(params, 2, 0.0) as f32;
        let mix = helpers::param(params, 3, 100.0) as f32 / 100.0;

        let src = helpers::input(inputs, 0);

        macro_rules! loop_over {
            ($clip_fn:expr) => {
                for i in 0..BUFFER_LEN {
                    let dry = src[i];
                    let driven = dry * gain_in;
                    let wet = $clip_fn(driven) * gain_out;

                    out[i] = dry + (wet - dry) * mix;
                }
            };
        }

        match shape {
            0 => loop_over!(soft_clip),
            1 => loop_over!(hard_clip),
            2 => loop_over!(lin_warp),
            3 => loop_over!(sin_warp),
            _ => {
                helpers::pass(inputs, out);
            }
        }
    }
}

#[inline]
fn soft_clip(sample: f32) -> f32 {
    ffi::tanhf(sample)
}

#[inline]
fn hard_clip(sample: f32) -> f32 {
    sample.clamp(-1.0, 1.0)
}

#[inline]
fn lin_warp(sample: f32) -> f32 {
    let t = rem_euclid(sample + 1.0, 4.0) - 1.0;
    if t <= 1.0 { t } else { 2.0 - t }
}

#[inline]
fn sin_warp(sample: f32) -> f32 {
    const HALF_PI: f32 = PI32 / 2.0;
    ffi::sinf(sample * HALF_PI)
}

#[inline]
fn rem_euclid(a: f32, n: f32) -> f32 {
    ((a % n) + n) % n
}
