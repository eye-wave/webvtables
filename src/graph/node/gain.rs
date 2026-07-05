use crate::graph::{BUFFER_LEN, Buffer, Param, consts::*, node_colors};

use super::helpers;
use super::{NodeLogic, NodeState};

pub struct GainNode;

impl NodeLogic for GainNode {
    fn title(&self) -> &'static str {
        "Gain"
    }

    fn header_color(&self) -> [u8; 3] {
        node_colors::EFFECT
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        let mut p = [None; MAX_PARAMS];

        p[0] = Some(
            Param::new_linear("Volume", -30.0, 30.0)
                .with_unit("dB")
                .with_default_norm(0.5),
        );

        p
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut NodeState,
        out: &mut Buffer,
    ) {
        let gain = helpers::param_db(params, 0, 0.0) as f32;
        let src = helpers::input(inputs, 0);

        for i in 0..BUFFER_LEN {
            out[i] = src[i] * gain;
        }
    }
}
