use super::helpers;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use crate::ffi;

pub struct BendNode;

impl NodeParamDef for BendNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] =
        crate::params![Param::new_linear("Amount", -2.0, 2.0).with_default_denorm(0.0),];
}

impl NodeLogic for BendNode {
    fn title(&self) -> Label {
        label("Bend")
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
        let a = helpers::param(params, 0, 0.5) as f32;
        let src = helpers::input(inputs, 0);
        let exp = ffi::powf(2.0, a * 3.0);

        for (i, o) in outs[0].iter_mut().enumerate() {
            let p = i as f32 / BUFFER_LEN as f32;
            let q = ffi::powf(p, exp);
            *o = helpers::sample_linear(src, q.clamp(0.0, 0.99999));
        }
    }
}
