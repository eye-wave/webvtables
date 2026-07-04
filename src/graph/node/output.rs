use super::NodeLogic;

pub struct OutputNode;

impl NodeLogic for OutputNode {
    fn title(&self) -> &'static str {
        "Output"
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        0
    }
}
