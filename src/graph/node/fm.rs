use crate::{
    ffi,
    graph::{
        BUFFER_LEN, MAX_PARAMS, NodeLogic, Param,
        node::helpers::{self, TAU32},
    },
};

pub struct FMNode;

impl NodeLogic for FMNode {
    fn title(&self) -> &'static str {
        "Frequency Modulation"
    }

    fn input_count(&self) -> usize {
        2
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        let mut p = [None; MAX_PARAMS];

        p[0] = Some(Param::new_linear("Ammount", 0.0, 10.0).with_unit("x"));

        p
    }

    fn process(
        &self,
        inputs: &[&crate::graph::Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut super::NodeState,
        out: &mut crate::graph::Buffer,
    ) {
        let amount = helpers::param(params, 0, 0.0) as f32;

        let carrier = helpers::input(inputs, 0);
        let modulator = helpers::input(inputs, 1);

        for i in 0..BUFFER_LEN {
            out[i] = ffi::sinf(carrier[i] * TAU32 + modulator[i] * amount * TAU32);
        }
    }
}
