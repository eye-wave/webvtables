use crate::ffi;

use super::helpers;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};

pub struct OctaveNode;

impl NodeParamDef for OctaveNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_int("Octaves", 1, 8).with_default_denorm(2.0),
        Param::new_linear("Slope", 0.0, 1.0).with_default_denorm(0.5),
    ];
}

impl NodeLogic for OctaveNode {
    fn title(&self) -> Label {
        label("Octave")
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
        let octaves = helpers::param(params, 0, 2.0) as usize;
        let slope = (helpers::param(params, 1, 0.5) as f32).clamp(0.0, 1.0);
        let src = helpers::input(inputs, 0);
        let out = &mut outs[0];

        out.copy_from_slice(src);

        if octaves == 0 || BUFFER_LEN == 0 {
            return;
        }

        for octave in 1..=octaves {
            let weight = ffi::powf(1.0 - slope, octave as f32);
            let multiplier = 1usize << octave;

            for (i, sample) in out.iter_mut().enumerate().take(BUFFER_LEN) {
                let phase = (i * multiplier) % BUFFER_LEN;
                *sample += src[phase] * weight;
            }
        }

        let mut peak = 0.0_f32;
        for &sample in out.iter() {
            peak = peak.max(sample.abs());
        }

        if peak > 1.0 {
            for sample in out.iter_mut() {
                *sample /= peak;
            }
        }
    }
}
