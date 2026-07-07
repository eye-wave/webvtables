use crate::ffi;
use crate::graph::node::helpers::PI32;
use crate::graph::{BUFFER_LEN_F32, Buffer, Param, consts::*};

use super::helpers;
use super::{NodeLogic, NodeState};

pub struct PartialsNode;

impl NodeLogic for PartialsNode {
    fn title(&self) -> &'static str {
        "Partials"
    }

    fn category(&self) -> &'static [super::NodeCategory] {
        &[super::NodeCategory::Inputs]
    }

    fn input_count(&self) -> usize {
        0
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        crate::params![Param::new_int("Count", 1, 48), Param::new_int("Gap", 0, 48),]
    }

    fn process(
        &self,
        _inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut NodeState,
        out: &mut Buffer,
    ) {
        let count = helpers::param(params, 0, 0.0) as u16;
        let gap = helpers::param(params, 1, 0.0) as u16;

        for i in 0..count {
            let harmonic = 1 + i * (gap + 1);

            let mut phase = 0.0;
            let phase_inc = harmonic as f32 / BUFFER_LEN_F32;

            for sample in out.iter_mut() {
                *sample += ffi::sin((2.0 * PI32 * phase) as f64) as f32;

                phase += phase_inc;
                if phase >= 1.0 {
                    phase -= 1.0;
                }
            }
        }

        let gain = 1.0 / count.max(1) as f32;
        for sample in out.iter_mut() {
            *sample *= gain;
        }
    }
}
