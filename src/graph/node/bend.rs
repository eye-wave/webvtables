use super::helpers::{self};
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use crate::ffi;

pub struct BendNode;

impl NodeParamDef for BendNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] =
        crate::params![Param::new_linear("Bend", -5.0, 5.0).with_default_denorm(0.0)];
}

impl NodeLogic for BendNode {
    fn title(&self) -> Label {
        label("Bend")
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Effect, NodeCategory::Warp]
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
        let src = helpers::input(inputs, 0);
        let bend = helpers::param(params, 0, 0.0);

        let center = (BUFFER_LEN - 1) as f64 * 0.5;

        let exponent = ffi::pow(2.0, bend);

        for (i, sample) in out.iter_mut().enumerate() {
            let x = (i as f64 - center) / center;

            let warped = x.signum() * ffi::pow(x.abs(), exponent);

            let pos = center + warped * center;

            let pos = pos.clamp(0.0, (BUFFER_LEN - 1) as f64);

            let idx0 = pos as usize;
            let idx1 = (idx0 + 1).min(BUFFER_LEN - 1);

            let t = (pos - ffi::floor(pos)) as f32;

            *sample = src[idx0] * (1.0 - t) + src[idx1] * t;
        }
    }
}
