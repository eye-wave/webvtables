use super::{Label, label};
use super::{Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::helpers::{self};

pub struct GainNode;

impl GainNode {
    pub const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_linear("Volume", -30.0, 30.0)
            .with_unit("dB")
            .with_default_norm(0.5)
    ];
}

impl NodeLogic for GainNode {
    fn title(&self) -> Label {
        label("Gain")
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
        let gain = helpers::param_db(params, 0, 0.0) as f32;
        helpers::map1(inputs, out, |x| x * gain);
    }
}
