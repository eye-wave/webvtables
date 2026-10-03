use super::helpers::{self};
use super::{Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::{Label, label};

pub struct InvertNode;

impl NodeLogic for InvertNode {
    fn title(&self) -> Label {
        label("Invert polarity")
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
