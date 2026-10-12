use super::helpers;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};

pub struct SlewLimitNode;

impl NodeParamDef for SlewLimitNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] =
        crate::params![Param::new_linear("Amount", -1.0, 1.0).with_default_denorm(0.0),];
}

impl NodeLogic for SlewLimitNode {
    fn title(&self) -> Label {
        label("Slew Limiter")
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
        let amount = helpers::param(params, 0, 0.0) as f32;
        let src = helpers::input(inputs, 0);
        let out = &mut outs[0];

        out.copy_from_slice(src);

        if amount.abs() < f32::EPSILON || BUFFER_LEN < 2 {
            return;
        }

        let mut max_step = 0.0_f32;

        for i in 0..BUFFER_LEN {
            let next = (i + 1) % BUFFER_LEN;
            max_step = max_step.max((out[next] - out[i]).abs());
        }

        if max_step <= f32::EPSILON {
            return;
        }

        let limit = max_step * (1.0 - amount.abs()).max(0.001);

        for _ in 0..8 {
            let mut changed = false;

            if amount < 0.0 {
                for i in 0..BUFFER_LEN {
                    let prev = (i + BUFFER_LEN - 1) % BUFFER_LEN;
                    let delta = out[i] - out[prev];

                    if delta > limit {
                        out[i] = out[prev] + limit;
                        changed = true;
                    }
                }
            } else {
                for i in (0..BUFFER_LEN).rev() {
                    let next = (i + 1) % BUFFER_LEN;
                    let delta = out[i] - out[next];

                    if delta > limit {
                        out[i] = out[next] + limit;
                        changed = true;
                    }
                }
            }

            if !changed {
                break;
            }
        }
    }
}
