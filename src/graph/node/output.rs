use crate::graph::{MAX_PARAMS, Param, node_colors};

use super::NodeLogic;
use super::helpers;

pub struct OutputNode;

impl NodeLogic for OutputNode {
    fn title(&self) -> &'static str {
        "Output"
    }

    fn header_color(&self) -> [u8; 3] {
        node_colors::OUTPUT
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        0
    }

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        let mut p = [None; MAX_PARAMS];

        p[0] = Some(Param::new_bool("Peaks", true, Some(&["Normalize", "Clip"])));

        p
    }

    fn process(
        &self,
        inputs: &[&crate::graph::Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut super::NodeState,
        out: &mut crate::graph::Buffer,
    ) {
        let use_hard_clip = helpers::param_bool(params, 0, true);

        *out = *helpers::input(inputs, 0);

        if use_hard_clip {
            for sample in out.iter_mut() {
                *sample = sample.clamp(-1.0, 1.0);
            }
        } else {
            let mut max_peak: f32 = 0.0;
            for sample in out.iter() {
                let abs_sample = sample.abs();
                if abs_sample > max_peak {
                    max_peak = abs_sample;
                }
            }

            if max_peak > 0.0 {
                let scale_factor = 1.0 / max_peak;
                for sample in out.iter_mut() {
                    *sample *= scale_factor;
                }
            }
        }
    }
}
