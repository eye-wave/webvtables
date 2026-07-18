use super::NodeLogic;
use super::helpers;
use crate::ffi;
use crate::graph::NodeCategory;
use crate::graph::{BUFFER_LEN, Buffer, MAX_PARAMS, Param};

pub struct SyncWarpNode;

impl NodeLogic for SyncWarpNode {
    fn title(&self) -> &'static str {
        "Sync warp"
    }

    fn category(&self) -> &'static [super::NodeCategory] {
        &[NodeCategory::Effect, NodeCategory::Warp]
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        crate::params![
            Param::new_linear("Multiply", 0.0, 50.0)
                .with_unit("x")
                .with_default_denorm(1.0)
        ]
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let src = helpers::input(inputs, 0);
        let multiply = helpers::param(params, 0, 1.0);

        for (i, sample) in out.iter_mut().enumerate() {
            let pos = i as f64 * multiply;

            let idx0 = pos as usize % BUFFER_LEN;
            let idx1 = (idx0 + 1) % BUFFER_LEN;

            let t = (pos - ffi::floor(pos)) as f32;

            *sample = src[idx0] * (1.0 - t) + src[idx1] * t;
        }
    }
}
