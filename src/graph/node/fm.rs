use crate::graph::{
    BUFFER_LEN_F32, MAX_PARAMS, NodeLogic, Param,
    node::helpers::{self},
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
        out: &mut crate::graph::Buffer,
    ) {
        let amount = helpers::param(params, 0, 0.0) as f32;
        let mut phase = 0.0;

        let base_freqs = helpers::input(inputs, 0);
        let modulators = helpers::input(inputs, 1);

        for i in 0..crate::graph::BUFFER_LEN {
            let current_freq = base_freqs[i] + (modulators[i] * amount);

            phase += current_freq / BUFFER_LEN_F32;

            if phase >= 1.0 {
                phase -= 1.0;
            } else if phase < 0.0 {
                phase += 1.0;
            }

            out[i] = phase * 2.0 - 1.0;
        }
    }
}
