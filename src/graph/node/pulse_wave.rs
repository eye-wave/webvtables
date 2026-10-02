use super::{Label, label};
use super::{BUFFER_LEN, BUFFER_LEN_F64, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::helpers::{self};

pub struct PulseWaveNode;

impl PulseWaveNode {
    pub const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_linear("PWM", 0.0, 0.5).with_default_norm(0.5),
        Param::new_int("Repeats", 1, 100).with_unit("x"),
    ];
}

impl NodeLogic for PulseWaveNode {
    fn title(&self) -> Label {
        label("Pulse wave")
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

    fn process(
        &self,
        _inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
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
