use super::helpers;
use super::{Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::{Label, label};

// A port of a custom node (see the editor definitions): passes its input through, so an
// instance external links can end on a real socket.
pub struct GroupOutNode;

impl NodeLogic for GroupOutNode {
    fn title(&self) -> Label {
        label("Group Output")
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Outputs]
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn process(&self, inputs: &[&Buffer], _: &[Option<Param>; MAX_PARAMS], outs: &mut [Buffer]) {
        helpers::pass(inputs, &mut outs[0]);
    }
}
