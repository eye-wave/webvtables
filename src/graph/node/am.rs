use super::{Label, label};
use super::{Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::helpers::{self};

pub struct AmNode;

impl AmNode {
    pub const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![Param::new_linear("Depth", 0.0, 1.0)];
}

impl NodeLogic for AmNode {
    fn title(&self) -> Label {
        label("Amplitude Modulation")
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Combine]
    }

    fn input_count(&self) -> usize {
        2
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
        let depth = helpers::param(params, 0, 1.0) as f32;
        helpers::map2(inputs, out, |carrier, modulator| {
            carrier * (1.0 + modulator * depth)
        });
    }
}
