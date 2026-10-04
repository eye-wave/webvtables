use super::helpers;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};

pub struct MirrorNode;

impl NodeParamDef for MirrorNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_enum("Mode", &["Repeat", "Flip", "Reflect", "Reflect Inv"]),
        Param::new_enum("Source", &["First", "Second"]),
        Param::new_linear("Mix", 0.0, 100.0)
            .with_unit("%")
            .with_default_norm(1.0),
    ];
}

impl NodeLogic for MirrorNode {
    fn title(&self) -> Label {
        label("Mirror")
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
        let first = helpers::param(params, 1, 0.0) as u8 == 0;
        let mix = (helpers::param(params, 2, 100.0) / 100.0) as f32;
        let src = helpers::input(inputs, 0);
        let h = BUFFER_LEN / 2;
        let sign = if mode == 1 || mode == 3 { -1.0 } else { 1.0 };

        for (n, o) in outs[0].iter_mut().enumerate() {
            let x = src[n];
            let m = if (n < h) == first {
                x
            } else {
                let p = if mode < 2 {
                    (n + h) % BUFFER_LEN
                } else {
                    BUFFER_LEN - 1 - n
                };
                sign * src[p]
            };
            *o = x + mix * (m - x);
        }
    }
}
