use crate::graph::{Buffer, MAX_PARAMS, NodeLogic, Param, node::helpers};

pub struct AmNode;

impl NodeLogic for AmNode {
    fn title(&self) -> &'static str {
        "Amplitude Modulation"
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
        crate::params![Param::new_linear("Depth", 0.0, 1.0)]
    }

    fn process(
        &self,
        inputs: &[&crate::graph::Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let depth = helpers::param(params, 0, 1.0) as f32;
        helpers::map2(inputs, out, |carrier, modulator| {
            carrier * (1.0 + modulator * depth)
        });
    }
}
