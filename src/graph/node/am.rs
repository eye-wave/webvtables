use crate::graph::{BUFFER_LEN, MAX_PARAMS, NodeLogic, Param, node::helpers};

pub struct AMNode;

impl NodeLogic for AMNode {
    fn title(&self) -> &'static str {
        "Amplitude Modulation"
    }

    fn input_count(&self) -> usize {
        2
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        let mut p = [None; MAX_PARAMS];

        p[0] = Some(Param::new_linear("Depth", 0.0, 1.0));

        p
    }

    fn process(
        &self,
        inputs: &[&crate::graph::Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut super::NodeState,
        out: &mut crate::graph::Buffer,
    ) {
        let carrier = helpers::input(inputs, 0);
        let modulator = helpers::input(inputs, 1);
        let depth = helpers::param(params, 0, 1.0) as f32;

        for i in 0..BUFFER_LEN {
            let m = modulator[i] * depth;
            out[i] = carrier[i] * (1.0 + m);
        }
    }
}
