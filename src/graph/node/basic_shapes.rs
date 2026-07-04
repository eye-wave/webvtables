use crate::graph::{Param, consts::*};

use super::NodeLogic;

pub struct BasicShapesNode;

impl NodeLogic for BasicShapesNode {
    fn title(&self) -> &'static str {
        "Basic shapes"
    }

    fn input_count(&self) -> usize {
        0
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        let mut p = [None; MAX_PARAMS];

        p[0] = Some(Param::new_enum(
            "Shape",
            0,
            &["Sine", "Triangle", "Square", "Sawtooth"],
        ));

        p
    }
}
