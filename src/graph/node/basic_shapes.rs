use crate::ffi;
use super::{BUFFER_LEN_F32, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::helpers::{self, PI32};

pub struct BasicShapesNode;

impl BasicShapesNode {
    pub const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_enum("Shape", &["Sine", "Triangle", "Square", "Sawtooth"]),
        Param::new_int("Repeats", 1, 100).with_unit("x"),
    ];
}

impl NodeLogic for BasicShapesNode {
    fn title(&self) -> &'static str {
        "Basic shapes"
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Inputs]
    }

    fn input_count(&self) -> usize {
        0
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        Self::PARAMS
    }

    fn process(
        &self,
        _inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let shape = helpers::param(params, 0, 0.0) as u8;
        let freq = helpers::param(params, 1, 1.0) as f32;

        let mut phase = 0.0;
        let phase_inc = freq / BUFFER_LEN_F32;

        for sample in out.iter_mut() {
            *sample = match shape {
                0 => ffi::sin((2.0 * PI32 * phase) as f64) as f32,
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
