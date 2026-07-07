use crate::ffi;
use crate::graph::{BUFFER_LEN, Buffer, Param, consts::*};

use super::helpers;
use super::{NodeLogic, NodeState};

pub struct SpectralGateNode;

impl NodeLogic for SpectralGateNode {
    fn title(&self) -> &'static str {
        "Spectral Gate"
    }

    fn category(&self) -> super::NodeCategory {
        super::NodeCategory::Fft
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        crate::params![
            Param::new_linear("Threshold", -80.0, 10.0)
                .with_unit("dB")
                .with_value(1.0),
            Param::new_linear("Mix", 0.0, 100.0)
                .with_unit("%")
                .with_value(1.0)
        ]
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut NodeState,
        out: &mut Buffer,
    ) {
        let threshold_db = helpers::param(params, 0, 0.0) as f32;
        let threshold = ffi::powf(10.0, threshold_db / 20.0);

        let src = helpers::input(inputs, 0);
        let mix = (helpers::param(params, 1, 100.0) / 100.0) as f32;

        let mut samples: [f32; BUFFER_LEN] = *src;
        let spectrum = microfft::real::rfft_2048(&mut samples);

        for bin in spectrum.iter_mut() {
            let mag = helpers::magnitude(bin) / (BUFFER_LEN as f32 / 2.0);
            let gain = (mag > threshold) as u8 as f32;
            bin.re *= gain;
            bin.im *= gain;
        }

        let mut full = helpers::unpack_real_fft(spectrum);
        let time = microfft::inverse::ifft_2048(&mut full);

        for i in 0..BUFFER_LEN {
            out[i] = src[i] * (1.0 - mix) + time[i].re * mix;
        }
    }
}
