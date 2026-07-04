use crate::graph::node_colors;

use super::NodeLogic;

pub struct OutputNode;

impl NodeLogic for OutputNode {
    fn title(&self) -> &'static str {
        "Output"
    }

    fn header_color(&self) -> [u8; 3] {
        node_colors::OUTPUT
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        0
    }
}
