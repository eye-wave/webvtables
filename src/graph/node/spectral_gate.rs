use crate::ffi;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::helpers::{self};

pub struct SpectralGateNode;

impl SpectralGateNode {
    pub const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_linear("Threshold", -80.0, 10.0)
            .with_unit("dB")
            .with_default_norm(1.0),
        Param::new_linear("Mix", 0.0, 100.0)
            .with_unit("%")
            .with_default_norm(1.0)
    ];
}

impl NodeLogic for SpectralGateNode {
    fn title(&self) -> &'static str {
        "Spectral Gate"
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Effect, NodeCategory::Fft]
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
        let out = &mut outs[0];
        let threshold_db = helpers::param(params, 0, 0.0) as f32;
        let threshold = ffi::powf(10.0, threshold_db / 20.0);

        let src = helpers::input(inputs, 0);
        let mix = (helpers::param(params, 1, 100.0) / 100.0) as f32;

        let mut samples = helpers::copy_of(src);
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
