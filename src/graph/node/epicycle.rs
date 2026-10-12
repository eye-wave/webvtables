use core::f32::consts::FRAC_1_SQRT_2;

use super::helpers;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use crate::ffi;
use crate::graph::node::BUFFER_LEN_F32;

pub struct EpicycleNode;

impl NodeParamDef for EpicycleNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_int("Arms", 1, 64).with_default_denorm(8.0),
        Param::new_linear("Decay", 0.0, 2.0).with_default_denorm(0.7),
        Param::new_int("Ratio", 1, 16).with_default_denorm(2.0),
        Param::new_linear("Detune", 0.0, 1.0),
        Param::new_linear("Phase", 0.0, 1.0),
        Param::new_linear("Twist", -1.0, 1.0),
    ];
}

impl NodeLogic for EpicycleNode {
    fn title(&self) -> Label {
        label("Epicycle")
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Inputs]
    }

    fn input_count(&self) -> usize {
        0
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        Self::PARAMS
    }

    fn process(&self, _: &[&Buffer], params: &[Option<Param>; MAX_PARAMS], outs: &mut [Buffer]) {
        let out = &mut outs[0];

        let arms = helpers::param(params, 0, 8.0) as usize;
        let decay = helpers::param(params, 1, 0.7);
        let ratio = helpers::param(params, 2, 2.0) as usize;
        let detune = helpers::param(params, 3, 0.0) as f32;
        let phase = helpers::param(params, 4, 0.0) as f32;
        let twist = helpers::param(params, 5, 0.0) as f32;

        let table = helpers::sine_table();
        let mask = BUFFER_LEN - 1;

        for (n, sample) in out.iter_mut().enumerate() {
            let mut x = 0.0_f32;
            let mut y = 0.0_f32;

            for arm in 0..arms {
                let k = arm as f32;

                let frequency = 1 + arm * ratio;
                let frequency = frequency as f32;

                let arm_phase = phase * BUFFER_LEN_F32
                    + k * detune * BUFFER_LEN_F32
                    + twist * k * k * BUFFER_LEN_F32 / arms.max(1) as f32;

                let index = (ffi::roundf(n as f32 * frequency + arm_phase) as usize) & mask;

                let radius = ffi::powf(k + 1.0, -decay as f32);
                x += radius * table[index];
                y += radius * table[(index + BUFFER_LEN / 4) & mask];
            }

            *sample = x * FRAC_1_SQRT_2 + y * FRAC_1_SQRT_2;
        }

        let peak = out.iter().fold(1e-9_f32, |m, &x| m.max(x.abs()));

        for sample in out.iter_mut() {
            *sample /= peak;
        }
    }
}
