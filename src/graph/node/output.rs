use super::{NodeCategory, NodeLogic};
use crate::graph::{MAX_PARAMS, Param};

pub struct OutputNode;

impl OutputNode {
    pub const PARAMS: [Option<Param>; MAX_PARAMS] = [None; MAX_PARAMS];
}

// Sink: no outputs, so eval hands its inputs to the widgets directly.
impl NodeLogic for OutputNode {
    fn title(&self) -> &'static str {
        "Output"
    }
    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Outputs]
    }
    fn input_count(&self) -> usize {
        1
    }
    fn output_count(&self) -> usize {
        0
    }
}
