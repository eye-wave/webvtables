use crate::graph::{Buffer, Param, consts::*};

use super::NodeLogic;
use super::helpers;

pub struct InvertNode;

impl NodeLogic for InvertNode {
    fn title(&self) -> &'static str {
        "Invert polarity"
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
