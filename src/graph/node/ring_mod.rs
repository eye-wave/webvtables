use super::{Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::helpers::{self};

pub struct RingModNode;

impl RingModNode {
    pub const PARAMS: [Option<Param>; MAX_PARAMS] = [None; MAX_PARAMS];
}

impl NodeLogic for RingModNode {
    fn title(&self) -> &'static str {
        "Ring Modulation"
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Combine]
    }

    fn input_count(&self) -> usize {
        2
    }

    fn output_count(&self) -> usize {
        1
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        _params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        helpers::map2(inputs, out, |a, b| a * b);
    }
}
