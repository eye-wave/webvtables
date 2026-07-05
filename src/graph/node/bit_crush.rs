use crate::ffi;
use crate::graph::{BUFFER_LEN, Buffer, Param, consts::*, node_colors};

use super::helpers;
use super::{NodeLogic, NodeState};

pub struct BitCrushNode;

impl NodeLogic for BitCrushNode {
    fn title(&self) -> &'static str {
        "Bit crusher"
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

        p[0] = Some(Param::new_enum("Type", &["Bit crush", "Downsample"]));
        p[1] = Some(Param::new_linear("Strength", 0.0, 1.0));
        p[2] = Some(Param::new_linear("Shift", 0.0, 1.0));
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
        let strength = helpers::param(params, 1, 0.0) as f32;
        let shift = helpers::param(params, 2, 0.0) as f32;
        let mix = helpers::param(params, 3, 100.0) as f32 / 100.0;

        let src = helpers::input(inputs, 0);

        match shape {
            0 => {
                for i in 0..BUFFER_LEN {
                    let dry = src[i];
                    let wet = bit_crush(dry, strength);

                    out[i] = dry + (wet - dry) * mix;
                }
            }
            1 => {
                let factor = ffi::powf(2.0, strength * 10.0);

                let offset = shift * factor;
                let mut held_sample = 0.0;

                for i in 0..BUFFER_LEN {
                    let dry = src[i];

                    if factor <= 1.0 || ((i as f32 + offset) % factor) < 1.0 {
                        held_sample = dry;
                    }
                    out[i] = dry + (held_sample - dry) * mix;
                }
            }
            _ => {
                helpers::pass(inputs, out);
            }
        }
    }
}

fn bit_crush(sample: f32, v: f32) -> f32 {
    if v <= 0.0 {
        return sample;
    }

    let bits = 16.0 - (v.clamp(0.0, 1.0) * 20.0);
    let steps = ffi::powf(2.0, bits);

    ffi::roundf(sample * steps) / steps
}
