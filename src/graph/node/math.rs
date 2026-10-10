use super::helpers;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
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

    // out[i] = f(x = i/N, a, b, c, d, p[i], q[i], r[i]); JS owns f (compiled from the node's LaTeX)
    // and fills the whole buffer in one call. Without a function yet `out` stays silent (zeroed).
    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        // same address JS gets from get_node(); it keys the compiled function
        let node = (state().arena.base() + unsafe { CURRENT } as usize) as u32;
        let p = |i| helpers::param(params, i, 0.0) as f32;
        let (a, b, c, d) = (p(0), p(1), p(2), p(3));
        let (ip, iq, ir) = (
            helpers::input(inputs, 0),
            helpers::input(inputs, 1),
            helpers::input(inputs, 2),
        );
        let out = &mut outs[0];
        ffi::math_eval(
            node,
            a,
            b,
            c,
            d,
            ip.as_ptr(),
            iq.as_ptr(),
            ir.as_ptr(),
            out.as_mut_ptr(),
            BUFFER_LEN as u32,
        );
    }
}
