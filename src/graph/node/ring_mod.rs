use crate::graph::{BUFFER_LEN, MAX_PARAMS, NodeLogic, Param, node::helpers};

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
        let a = helpers::input(inputs, 0);
        let b = helpers::input(inputs, 1);

        for i in 0..BUFFER_LEN {
            out[i] = a[i] * b[i];
        }
    }
}
