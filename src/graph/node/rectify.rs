use super::helpers;
use super::{Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};

pub struct RectifyNode;

impl NodeParamDef for RectifyNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_enum("Mode", &["Full", "Half", "Negative"]),
        Param::new_linear("Mix", 0.0, 100.0)
            .with_unit("%")
            .with_default_norm(1.0),
    ];
}

impl NodeLogic for RectifyNode {
    fn title(&self) -> Label {
        label("Rectify")
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
        let mix = (helpers::param(params, 1, 100.0) / 100.0) as f32;
        let src = helpers::input(inputs, 0);
        for (o, &x) in outs[0].iter_mut().zip(src.iter()) {
            let r = match mode {
                0 => x.abs(),
                1 => x.max(0.0),
                _ => -x.abs(),
            };
            *o = x + mix * (r - x);
        }
    }
}
