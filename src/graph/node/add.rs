use crate::graph::{BUFFER_LEN, Buffer, Param, consts::MAX_PARAMS, node::helpers};

use super::{NodeLogic, NodeState};

pub struct AddNode;

impl NodeLogic for AddNode {
    fn title(&self) -> &'static str {
        "Add"
    }

    fn category(&self) -> super::NodeCategory {
        super::NodeCategory::Combine
    }

    fn input_count(&self) -> usize {
        2
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        let mut p = [None; MAX_PARAMS];

        p[0] = Some(Param::new_bool("Normalize", false, None));

        p
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut NodeState,
        out: &mut Buffer,
    ) {
        let normalize = helpers::param_bool(params, 0, false);

        for i in 0..BUFFER_LEN {
            out[i] = inputs.iter().map(|b| b[i]).sum::<f32>();
        }

        if normalize {
            let mut max_peak: f32 = 0.0;

            for sample in out.iter_mut() {
                let abs_val = sample.abs();
                if abs_val > max_peak {
                    max_peak = abs_val;
                }
            }

            if max_peak > 0.0 {
                let gain = 1.0 / max_peak;
                for sample in out.iter_mut() {
                    *sample *= gain;
                }
            }
        }
    }
}
