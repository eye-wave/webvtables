use crate::graph::{BUFFER_LEN, Buffer, Param, consts::MAX_PARAMS};

use super::{NodeLogic, NodeState};

pub struct AddNode;

impl NodeLogic for AddNode {
    fn title(&self) -> &'static str {
        "Add"
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
        _state: &mut NodeState,
        out: &mut Buffer,
    ) {
        for i in 0..BUFFER_LEN {
            out[i] = inputs.iter().map(|b| b[i]).sum();
        }
    }
}
