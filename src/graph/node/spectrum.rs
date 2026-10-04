use super::helpers;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use crate::ffi;

pub struct SpectrumNode;

impl NodeParamDef for SpectrumNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_int("Count", 1, 256),
        Param::new_linear("Slope", 0.0, 3.0).with_default_denorm(1.0),
        Param::new_enum("Select", &["All", "Odd", "Even"]),
        Param::new_enum("Sign", &["Same", "Alternate"]),
    ];
}

impl NodeLogic for SpectrumNode {
    fn title(&self) -> Label {
        label("Spectrum")
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
        let out = &mut outs[0];
        let count = helpers::param(params, 0, 16.0) as usize;
        let slope = helpers::param(params, 1, 1.0) as f32;
        let select = helpers::param(params, 2, 0.0) as u8;
        let alt = helpers::param(params, 3, 0.0) as u8 == 1;
        let t = helpers::sine_table();

        for h in 1..=count {
            if (select == 1 && h % 2 == 0) || (select == 2 && h % 2 == 1) {
                continue;
            }
            let mut a = ffi::powf(h as f32, -slope);
            if alt && h % 2 == 0 {
                a = -a;
            }
            for (n, s) in out.iter_mut().enumerate() {
                *s += a * t[(h * n) & (BUFFER_LEN - 1)];
            }
        }

        let peak = out.iter().fold(1e-9f32, |m, &x| m.max(x.abs()));
        for s in out.iter_mut() {
            *s /= peak;
        }
    }
}
