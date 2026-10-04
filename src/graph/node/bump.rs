use super::helpers;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use crate::ffi;

pub struct BumpNode;

impl NodeParamDef for BumpNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_log("Width", 0.01, 1.0).with_default_denorm(0.2),
        Param::new_linear("Center", 0.0, 1.0).with_default_denorm(0.5),
        Param::new_enum("Polarity", &["Unipolar", "Bipolar"]),
    ];
}

impl NodeLogic for BumpNode {
    fn title(&self) -> Label {
        label("Bump")
    }
    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Inputs]
    }
    fn input_count(&self) -> usize {
        0
    }
    fn output_count(&self) -> usize {
        1
    }
    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        Self::PARAMS
    }

    fn process(&self, _: &[&Buffer], params: &[Option<Param>; MAX_PARAMS], outs: &mut [Buffer]) {
        let w = helpers::param(params, 0, 0.2).max(0.01) as f32;
        let c = helpers::param(params, 1, 0.5) as f32;
        let bipolar = helpers::param(params, 2, 0.0) as u8 == 1;
        let tau = core::f32::consts::TAU;
        let pow = 1.0 / w;

        for (n, s) in outs[0].iter_mut().enumerate() {
            let p = n as f32 / BUFFER_LEN as f32;
            let b = 0.5 + 0.5 * ffi::sinf(tau * (p - c) + core::f32::consts::FRAC_PI_2);
            let v = ffi::powf(b, pow);
            *s = if bipolar { v * 2.0 - 1.0 } else { v };
        }
    }
}
