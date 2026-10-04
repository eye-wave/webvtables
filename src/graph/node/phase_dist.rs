use super::helpers;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use crate::ffi;

pub(super) fn fract(x: f32) -> f32 {
    x - (x as i32) as f32
}

pub(super) fn read(src: &Buffer, p: f32) -> f32 {
    let x = p * BUFFER_LEN as f32;
    let i = x as usize;
    let f = x - i as f32;
    let (a, b) = (src[i % BUFFER_LEN], src[(i + 1) % BUFFER_LEN]);
    a + f * (b - a)
}

pub struct PhaseDistNode;

impl NodeParamDef for PhaseDistNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_enum("Mode", &["Bend", "Wobble", "Sync"]),
        Param::new_linear("Amount", -1.0, 1.0).with_default_denorm(0.5),
    ];
}

impl NodeLogic for PhaseDistNode {
    fn title(&self) -> Label {
        label("Phase Distortion")
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
        let mode = helpers::param(params, 0, 0.0) as u8;
        let a = helpers::param(params, 1, 0.5) as f32;
        let src = helpers::input(inputs, 0);
        let exp = ffi::powf(2.0, a * 3.0);
        let ratio = 1.0 + a.abs() * 7.0;

        for (i, o) in outs[0].iter_mut().enumerate() {
            let p = i as f32 / BUFFER_LEN as f32;
            let q = match mode {
                0 => ffi::powf(p, exp),
                1 => p + a * ffi::sinf(core::f32::consts::TAU * p) / core::f32::consts::TAU,
                _ => fract(p * ratio),
            };
            *o = read(src, q.clamp(0.0, 0.99999));
        }
    }
}
