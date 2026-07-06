use crate::graph::{MAX_PARAMS, NodeLogic, Param, node::helpers};

pub struct RingModNode;

impl NodeLogic for RingModNode {
    fn title(&self) -> &'static str {
        "Ring Modulation"
    }

    fn category(&self) -> super::NodeCategory {
        super::NodeCategory::Combine
    }

    fn input_count(&self) -> usize {
        2
    }

    fn output_count(&self) -> usize {
        1
    }

    fn process(
        &self,
        inputs: &[&crate::graph::Buffer],
        _params: &[Option<Param>; MAX_PARAMS],
        _state: &mut super::NodeState,
        out: &mut crate::graph::Buffer,
    ) {
        helpers::map2(inputs, out, |a, b| a * b);
    }
}
