use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::helpers::{self};

pub struct CombNode;

impl CombNode {
    pub const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_int("Delay", 0, (BUFFER_LEN / 2) as i32).with_unit("samp"),
        Param::new_int("Iter", 1, 35).with_unit("n")
    ];
}

impl NodeLogic for CombNode {
    fn title(&self) -> &'static str {
        "Comb"
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Effect]
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        Self::PARAMS
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
