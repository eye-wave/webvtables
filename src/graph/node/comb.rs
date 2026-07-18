use crate::graph::{BUFFER_LEN, Buffer, Param, consts::*};

use super::NodeLogic;
use super::helpers;

pub struct CombNode;

impl NodeLogic for CombNode {
    fn title(&self) -> &'static str {
        "Comb"
    }

    fn category(&self) -> &'static [super::NodeCategory] {
        &[super::NodeCategory::Effect]
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        crate::params![
            Param::new_int("Delay", 0, (BUFFER_LEN / 2) as i32).with_unit("samp"),
            Param::new_int("Iter", 1, 35).with_unit("n")
        ]
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let delay = helpers::param(params, 0, 0.0) as usize;
        let iter = helpers::param(params, 1, 0.0) as usize;

        let src = helpers::input(inputs, 0);

        for i in 0..BUFFER_LEN {
            let val = (src[i] + src[(i + delay) % BUFFER_LEN]) / 2.0;
            out[i] = val
        }

        if iter > 1 {
            for _ in 0..(iter - 1) {
                for i in 0..BUFFER_LEN {
                    let val = (out[i] + out[(i + delay) % BUFFER_LEN]) / 2.0;
                    out[i] = val
                }
            }
        }
    }
}
