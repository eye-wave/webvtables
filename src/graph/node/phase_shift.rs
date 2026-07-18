use super::NodeLogic;
use super::helpers;
use crate::graph::BUFFER_LEN_F64;
use crate::graph::{BUFFER_LEN, Buffer, MAX_PARAMS, Param};

pub struct PhaseShiftNode;

impl NodeLogic for PhaseShiftNode {
    fn title(&self) -> &'static str {
        "Phase shift"
    }

    fn category(&self) -> &'static [super::NodeCategory] {
        &[super::NodeCategory::Effect]
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        crate::params![Param::new_linear("Shift", 0.0, 360.0).with_unit("°")]
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let src = match inputs.first() {
            Some(&buf) => buf,
            None => return,
        };

        let deg = helpers::param(params, 0, 0.0);

        let normalized_shift = (deg % 360.0) / 360.0;
        let sample_shift = (normalized_shift * BUFFER_LEN_F64) as usize;

        for (i, sample) in out.iter_mut().enumerate().take(BUFFER_LEN) {
            let src_idx = (i + BUFFER_LEN - sample_shift) % BUFFER_LEN;
            *sample = src[src_idx];
        }
    }
}
