use super::helpers;
use super::{Buffer, NodeCategory, NodeLogic};
use crate::graph::{MAX_PARAMS, Param};

pub struct TransformNode;

impl TransformNode {
    pub const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_linear("Gain", 1.0, 4.0),
        Param::new_linear("Offset", 0.0, 1.0),
    ];
}

impl NodeLogic for TransformNode {
    fn title(&self) -> &'static str {
        "Transform"
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
    fn process(&self, i: &[&Buffer], p: &[Option<Param>; MAX_PARAMS], outs: &mut [Buffer]) {
        let (g, off) = (helpers::param(p, 0, 0.0) as f32, helpers::param(p, 1, 0.0) as f32);
        for (o, v) in outs[0].iter_mut().zip(i[0]) {
            *o = v * g + off;
        }
    }
}
