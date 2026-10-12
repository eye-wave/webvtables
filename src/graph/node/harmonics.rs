use crate::ffi;

use super::helpers;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};

pub struct HarmonicsNode;

impl NodeParamDef for HarmonicsNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_int("Harmonics", 1, 64).with_default_denorm(4.0),
        Param::new_int("Gap", 1, 16).with_default_denorm(1.0),
        Param::new_linear("Slope", 0.0, 1.0).with_default_denorm(0.5),
    ];
}

impl NodeLogic for HarmonicsNode {
    fn title(&self) -> Label {
        label("Harmonics")
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
        let harmonics = (helpers::param(params, 0, 4.0) as usize).clamp(1, 64);
        let gap = (helpers::param(params, 1, 1.0) as usize).max(1);
        let slope = (helpers::param(params, 2, 0.5) as f32).clamp(0.0, 1.0);

        let src = helpers::input(inputs, 0);
        let out = &mut outs[0];

        out.copy_from_slice(src);

        if BUFFER_LEN == 0 {
            return;
        }

        for index in 0..harmonics {
            let harmonic = 2 + index * gap;
            let weight = ffi::powf(1.0 - slope, index as f32);

            for (i, sample) in out.iter_mut().enumerate().take(BUFFER_LEN) {
                let phase = ((i as u64 * harmonic as u64) % BUFFER_LEN as u64) as usize;
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
