use crate::{
    ffi,
    graph::{
        MAX_PARAMS, NodeLogic, Param,
        node::helpers::{self, TAU32},
    },
};

pub struct FmNode;

impl NodeLogic for FmNode {
    fn title(&self) -> &'static str {
        "Frequency Modulation"
    }

    fn category(&self) -> &'static [super::NodeCategory] {
        &[super::NodeCategory::Combine]
    }

    fn input_count(&self) -> usize {
        2
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        crate::params![Param::new_linear("Ammount", 0.0, 10.0).with_unit("x")]
    }

    fn process(
        &self,
        inputs: &[&crate::graph::Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut super::NodeState,
        out: &mut crate::graph::Buffer,
    ) {
        let amount = helpers::param(params, 0, 0.0) as f32;
        helpers::map2(inputs, out, |carrier, modulator| {
            ffi::sinf(carrier * TAU32 + modulator * amount * TAU32)
        });
    }
}
