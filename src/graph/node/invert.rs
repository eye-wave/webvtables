use super::{Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::helpers::{self};

pub struct InvertNode;

impl InvertNode {
    pub const PARAMS: [Option<Param>; MAX_PARAMS] = [None; MAX_PARAMS];
}

impl NodeLogic for InvertNode {
    fn title(&self) -> &'static str {
        "Invert polarity"
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Effect]
    }

    fn input_count(&self) -> usize {
        1
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
        helpers::map1(inputs, out, |x| -x);
    }
}
