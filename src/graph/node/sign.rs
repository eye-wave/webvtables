use super::helpers::{self};
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::{Label, label};

pub struct SignNode;

impl NodeLogic for SignNode {
    fn title(&self) -> Label {
        label("Sign")
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Effect, NodeCategory::Distortion]
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        _params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let input = helpers::input(inputs, 0);

        for i in 0..BUFFER_LEN {
            out[i] = if input[i] == 0.0 {
                0.0
            } else {
                input[i].signum()
            };
        }
    }
}
