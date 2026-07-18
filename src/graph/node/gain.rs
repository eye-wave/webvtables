use crate::graph::{Buffer, Param, consts::*};

use super::NodeLogic;
use super::helpers;

pub struct GainNode;

impl NodeLogic for GainNode {
    fn title(&self) -> &'static str {
        "Gain"
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

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        crate::params![
            Param::new_linear("Volume", -30.0, 30.0)
                .with_unit("dB")
                .with_default_norm(0.5)
        ]
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let gain = helpers::param_db(params, 0, 0.0) as f32;
        helpers::map1(inputs, out, |x| x * gain);
    }
}
