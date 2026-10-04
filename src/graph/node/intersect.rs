use super::helpers;
use super::{Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use crate::ffi;

pub struct IntersectNode;

impl NodeParamDef for IntersectNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_enum("Mode", &["Geometric", "Min", "Multiply"]),
        Param::new_enum("Phase", &["A", "B"]),
    ];
}

impl NodeLogic for IntersectNode {
    fn title(&self) -> Label {
        label("Intersect")
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
        let phase_b = helpers::param(params, 1, 0.0) as u8 == 1;

        helpers::fft_combine(
            helpers::input(inputs, 0),
            helpers::input(inputs, 1),
            &mut outs[0],
            |ar, ai, br, bi| {
                let ma = ffi::sqrtf(ar * ar + ai * ai);
                let mb = ffi::sqrtf(br * br + bi * bi);
                let m = match mode {
                    0 => ffi::sqrtf(ma * mb),
                    1 => ma.min(mb),
                    _ => ma * mb,
                };
                let (pr, pi, pm) = if phase_b { (br, bi, mb) } else { (ar, ai, ma) };
                if pm < 1e-9 {
                    (0.0, 0.0)
                } else {
                    (m * pr / pm, m * pi / pm)
                }
            },
        );
    }
}
