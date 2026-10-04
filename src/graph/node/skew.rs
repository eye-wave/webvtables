use super::helpers;
use super::phase_dist::{fract, read};
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};

pub struct SkewNode;

impl NodeParamDef for SkewNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_linear("Skew", 0.05, 0.95).with_default_denorm(0.5),
        Param::new_linear("Rotate", 0.0, 1.0).with_default_denorm(0.0),
    ];
}

impl NodeLogic for SkewNode {
    fn title(&self) -> Label {
        label("Skew")
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
        let s = helpers::param(params, 0, 0.5) as f32;
        let r = helpers::param(params, 1, 0.0) as f32;
        let src = helpers::input(inputs, 0);

        for (i, o) in outs[0].iter_mut().enumerate() {
            let p = fract(i as f32 / BUFFER_LEN as f32 + r);
            let q = if p < 0.5 {
                p * 2.0 * s
            } else {
                s + (p - 0.5) * 2.0 * (1.0 - s)
            };
            *o = read(src, q);
        }
    }
}
