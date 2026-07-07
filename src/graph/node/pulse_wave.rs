use crate::graph::{BUFFER_LEN, BUFFER_LEN_F64, Buffer, Param, consts::*};

use super::helpers;
use super::{NodeLogic, NodeState};

pub struct PulseWaveNode;

impl NodeLogic for PulseWaveNode {
    fn title(&self) -> &'static str {
        "Pulse wave"
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
        crate::params![
            Param::new_linear("PWM", 0.0, 0.5).with_default_norm(0.5),
            Param::new_int("Repeats", 1, 100).with_unit("x"),
        ]
    }

    fn process(
        &self,
        _inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut NodeState,
        out: &mut Buffer,
    ) {
        let pwm = helpers::param(params, 0, 0.0);
        let repeats = helpers::param(params, 1, 1.0).max(1.0);

        let period = BUFFER_LEN_F64 / repeats;
        let shift = period * pwm;

        for (i, sample) in out.iter_mut().enumerate().take(BUFFER_LEN) {
            let phase = (i as f64) % period;
            *sample = ((phase < shift) as u8 as f32) * 2.0 - 1.0;
        }
    }
}
