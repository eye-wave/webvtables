use super::{Label, label};
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::helpers::{self};

pub struct AddNode;

impl AddNode {
    pub const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![Param::new_linear("Crossfade", -1.0, 1.0).with_default_denorm(0.0)];
}

impl NodeLogic for AddNode {
    fn title(&self) -> Label {
        label("Add")
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
        let crossfade = helpers::param(params, 0, 0.0) as f32;

        let mix = (crossfade + 1.0) * 0.5;
        let gain0 = 1.0 - mix;
        let gain1 = mix;

        let in0 = inputs.first().copied();
        let in1 = inputs.get(1).copied();

        for i in 0..BUFFER_LEN {
            let s0 = in0.map(|b| b[i]).unwrap_or(0.0);
            let s1 = in1.map(|b| b[i]).unwrap_or(0.0);

            out[i] = (s0 * gain0) + (s1 * gain1);
        }
    }
}
