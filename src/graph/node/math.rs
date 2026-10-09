use super::helpers;
use super::{BUFFER_LEN_F32, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use crate::ffi;
use crate::graph::{scope::CURRENT, state};

pub struct MathNode;

impl NodeParamDef for MathNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_linear("a", 0.0, 1.0).with_default_norm(0.5),
        Param::new_linear("b", 0.0, 1.0).with_default_norm(0.5),
        Param::new_linear("c", 0.0, 1.0).with_default_norm(0.5),
        Param::new_linear("d", 0.0, 1.0).with_default_norm(0.5),
    ];
}

impl NodeLogic for MathNode {
    fn title(&self) -> Label {
        label("Math")
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Effect]
    }

    fn input_count(&self) -> usize {
        3
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
        let node = (state().arena.base() + unsafe { CURRENT } as usize) as u32;
        let p = |i| helpers::param(params, i, 0.0) as f32;
        let (a, b, c, d) = (p(0), p(1), p(2), p(3));
        let (ip, iq, ir) = (
            helpers::input(inputs, 0),
            helpers::input(inputs, 1),
            helpers::input(inputs, 2),
        );
        for (i, o) in outs[0].iter_mut().enumerate() {
            let x = i as f32 / BUFFER_LEN_F32;
            let y = ffi::math_eval(node, x, a, b, c, d, ip[i], iq[i], ir[i]);
            *o = if y.is_finite() { y } else { 0.0 };
        }
    }
}
