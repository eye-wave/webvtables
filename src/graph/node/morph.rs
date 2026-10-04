use super::helpers;
use super::{Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use crate::ffi;

pub struct MorphNode;

impl NodeParamDef for MorphNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_linear("Morph", 0.0, 100.0)
            .with_unit("%")
            .with_default_norm(0.5),
        Param::new_enum("Blend", &["Linear", "Geometric"]),
        Param::new_enum("Phase", &["A", "B"]),
    ];
}

impl NodeLogic for MorphNode {
    fn title(&self) -> Label {
        label("Spectral Morph")
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
        let t = (helpers::param(params, 0, 50.0) / 100.0) as f32;
        let geo = helpers::param(params, 1, 0.0) as u8 == 1;
        let phase_b = helpers::param(params, 2, 0.0) as u8 == 1;

        helpers::fft_combine(
            helpers::input(inputs, 0),
            helpers::input(inputs, 1),
            &mut outs[0],
            |ar, ai, br, bi| {
                let ma = ffi::sqrtf(ar * ar + ai * ai);
                let mb = ffi::sqrtf(br * br + bi * bi);
                let m = if geo {
                    ffi::powf(ma.max(1e-9), 1.0 - t) * ffi::powf(mb.max(1e-9), t)
                } else {
                    ma + t * (mb - ma)
                };
                let (pr, pi, pm) = if phase_b { (br, bi, mb) } else { (ar, ai, ma) };
                if pm < 1e-9 {
                    (m, 0.0)
                } else {
                    (m * pr / pm, m * pi / pm)
                }
            },
        );
    }
}
