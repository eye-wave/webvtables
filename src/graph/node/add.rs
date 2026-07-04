use super::NodeLogic;

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
}
