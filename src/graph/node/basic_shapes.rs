use crate::ffi;
use crate::graph::{BUFFER_LEN, Buffer, Param, consts::*, node_colors};

use super::{NodeLogic, NodeState};

pub struct BasicShapesNode;

impl NodeLogic for BasicShapesNode {
    fn title(&self) -> &'static str {
        "Basic shapes"
    }

    fn header_color(&self) -> [u8; 3] {
        node_colors::INPUT
    }

    fn input_count(&self) -> usize {
        0
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        let mut p = [None; MAX_PARAMS];

        p[0] = Some(Param::new_enum(
            "Shape",
            0,
            &["Sine", "Triangle", "Square", "Sawtooth"],
        ));

        p[1] = Some(Param::new_int("Freq", 0.0, 1, 100));

        p
    }

    fn process(
        &self,
        _inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut NodeState,
        out: &mut Buffer,
    ) {
        let shape = params[0].map(|p| p.denorm() as u8).unwrap_or(0);
        let freq = params[1].map(|p| p.denorm() as f32).unwrap_or(1.0);

        let mut phase = 0.0;
        let phase_inc = freq / BUFFER_LEN as f32;

        for sample in out.iter_mut() {
            *sample = match shape {
                0 => ffi::sin((2.0 * core::f32::consts::PI * phase) as f64) as f32,
                1 => {
                    if phase < 0.5 {
                        4.0 * phase - 1.0
                    } else {
                        3.0 - 4.0 * phase
                    }
                }
                2 => {
                    if phase < 0.5 {
                        1.0
                    } else {
                        -1.0
                    }
                }
                _ => 2.0 * phase - 1.0,
            };

            phase += phase_inc;
            if phase >= 1.0 {
                phase -= 1.0;
            }
        }
    }
}
