use super::helpers::{self};
use super::{Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};

use crate::graph::node::BUFFER_LEN;

pub struct PartialsNode;

impl NodeParamDef for PartialsNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] =
        crate::params![Param::new_int("Count", 1, 48), Param::new_int("Gap", 0, 48),];
}

impl NodeLogic for PartialsNode {
    fn title(&self) -> Label {
        label("Partials")
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

    fn process(
        &self,
        _inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let (count, gap) = (
            helpers::param(params, 0, 0.0) as usize,
            helpers::param(params, 1, 0.0) as usize,
        );
        let t = helpers::sine_table();
        for i in 0..count {
            let h = 1 + i * (gap + 1);
            for (n, s) in out.iter_mut().enumerate() {
                *s += t[(h * n) & (BUFFER_LEN - 1)];
            }
        }

        let gain = 1.0 / count.max(1) as f32;
        for sample in out.iter_mut() {
            *sample *= gain;
        }
    }
}
