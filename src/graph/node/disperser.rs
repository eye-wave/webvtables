use crate::ffi;
use super::{BUFFER_LEN, BUFFER_LEN_F32, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::helpers::{self, TAU32};

pub struct DisperserNode;

impl DisperserNode {
    pub const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![Param::new_linear("Exponent", -10.0, 10.0).with_default_denorm(0.0)];
}

impl NodeLogic for DisperserNode {
    fn title(&self) -> &'static str {
        "Disperser"
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
        let exp = helpers::param(params, 0, 0.0) as f32;
        let src = helpers::input(inputs, 0);

        let direction = if exp >= 0.0 { 1.0 } else { -1.0 };
        let abs_exp = exp.abs();

        let mut samples = helpers::copy_of(src);
        let spectrum = microfft::real::rfft_2048(&mut samples);

        let step = TAU32 / BUFFER_LEN_F32;

        for (i, bin) in spectrum.iter_mut().enumerate() {
            let (mag, mut phase) = helpers::mag_phase(bin);

            phase += ffi::powf(i as f32, abs_exp) * step * direction;
            *bin = helpers::from_mag_phase(mag, phase);
        }

        let mut full = helpers::unpack_real_fft(spectrum);
        let time = microfft::inverse::ifft_2048(&mut full);

        for i in 0..BUFFER_LEN {
            out[i] = time[i].re;
        }
    }
}
