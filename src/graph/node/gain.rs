use crate::graph::{Param, consts::*};

use super::NodeLogic;

pub struct GainNode;

impl NodeLogic for GainNode {
    fn title(&self) -> &'static str {
        "Gain"
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        let mut p = [None; MAX_PARAMS];

        p[0] = Some(Param::new_linear("Volume", 0.5, -30.0, 30.0).with_unit("dB"));
        p[1] = Some(Param::new_linear("Pan", 0.5, -1.0, 1.0));

        p
    }
}
