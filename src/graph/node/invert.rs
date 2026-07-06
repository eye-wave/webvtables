use crate::graph::{Buffer, Param, consts::*};

use super::helpers;
use super::{NodeLogic, NodeState};

pub struct InvertNode;

impl NodeLogic for InvertNode {
    fn title(&self) -> &'static str {
        "Invert polarity"
    }

    fn category(&self) -> super::NodeCategory {
        super::NodeCategory::Effect
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
        _state: &mut NodeState,
        out: &mut Buffer,
    ) {
        helpers::map1(inputs, out, |x| -x);
    }
}
