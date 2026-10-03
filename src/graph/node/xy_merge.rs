use super::helpers::{self};
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};

pub struct XyMergeNode;

impl NodeParamDef for XyMergeNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_linear("x", 0.0, 1.0).with_default_denorm(0.5),
        Param::new_linear("y", 0.0, 1.0).with_default_denorm(0.5),
    ];
}

impl NodeLogic for XyMergeNode {
    fn title(&self) -> Label {
        label("XY Merge")
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Combine]
    }

    fn input_count(&self) -> usize {
        4
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
        let out = &mut outs[0];

        let u = helpers::param(params, 0, 0.0) as f32;
        let v = helpers::param(params, 1, 0.0) as f32;

        let gain0 = (1.0 - u) * v;
        let gain1 = u * v;
        let gain2 = (1.0 - u) * (1.0 - v);
        let gain3 = u * (1.0 - v);

        let in0 = inputs.first().copied();
        let in1 = inputs.get(1).copied();
        let in2 = inputs.get(2).copied();
        let in3 = inputs.get(3).copied();

        for i in 0..BUFFER_LEN {
            let s0 = in0.map(|b| b[i]).unwrap_or(0.0);
            let s1 = in1.map(|b| b[i]).unwrap_or(0.0);
            let s2 = in2.map(|b| b[i]).unwrap_or(0.0);
            let s3 = in3.map(|b| b[i]).unwrap_or(0.0);

            out[i] = s0 * gain0 + s1 * gain1 + s2 * gain2 + s3 * gain3;
        }
    }
}
