use super::helpers::{self};
use super::{Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::{Label, label};

pub struct RingModNode;

impl NodeLogic for RingModNode {
    fn title(&self) -> Label {
        label("Ring Modulation")
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
