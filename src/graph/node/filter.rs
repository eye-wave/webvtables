use crate::graph::{Param, consts::*};

use super::NodeLogic;

pub struct FilterNode;

impl NodeLogic for FilterNode {
    fn title(&self) -> &'static str {
        "FilterNode"
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        let mut p = [None; MAX_PARAMS];

        p[0] = Some(Param::new_enum(
            "Shape",
            0,
            &[
                "Lowshelf", "Lowcut", "Highcut", "Lowcut", "Bell", "Notch", "Allpass",
            ],
        ));

        p[1] = Some(Param::new_log("Freq", 0.5, 20.0, 20_000.0).with_unit("hz"));
        p[2] = Some(Param::new_linear("Gain", 0.5, -30.0, 30.0).with_unit("dB"));
        p[3] = Some(Param::new_linear("Q", 0.5, 0.0, 10.0));

        p
    }
}
