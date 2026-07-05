use crate::graph::{BUFFER_LEN, Buffer, Param, consts::*, node_colors};

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

    fn header_color(&self) -> [u8; 3] {
        node_colors::EFFECT
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
        let src = helpers::input(inputs, 0);

        for i in 0..BUFFER_LEN {
            out[i] = -src[i];
        }
    }
}
