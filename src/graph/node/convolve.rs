use super::helpers;
use super::{Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};

pub struct ConvolveNode;

impl NodeParamDef for ConvolveNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_enum("Mode", &["Convolve", "Deconvolve"]),
        Param::new_linear("Gain", 0.0, 1.0).with_default_denorm(0.05),
        Param::new_log("Reg", 1e-6, 1.0).with_default_denorm(1e-2),
    ];
}

impl NodeLogic for ConvolveNode {
    fn title(&self) -> Label {
        label("Convolve")
    }
    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Effect, NodeCategory::Fft]
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
        let mode = helpers::param(params, 0, 0.0) as u8;
        let g = helpers::param(params, 1, 0.05) as f32;
        let eps = helpers::param(params, 2, 1e-2) as f32;
        let (a, b) = (helpers::input(inputs, 0), helpers::input(inputs, 1));
        let out = &mut outs[0];

        match mode {
            0 => helpers::fft_combine(a, b, out, |ar, ai, br, bi| {
                ((ar * br - ai * bi) * g, (ar * bi + ai * br) * g)
            }),
            _ => helpers::fft_combine(a, b, out, |ar, ai, br, bi| {
                let d = br * br + bi * bi + eps;
                ((ar * br + ai * bi) / d, (ai * br - ar * bi) / d)
            }),
        }
    }
}
