use super::helpers::{self, TAU32};
use super::{
    BUFFER_LEN, BUFFER_LEN_F32, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param,
};
use super::{Label, label};
use crate::ffi;

pub struct DisperserNode;

impl NodeParamDef for DisperserNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] =
        crate::params![Param::new_linear("Exponent", -10.0, 10.0).with_default_denorm(0.0)];
}

impl NodeLogic for DisperserNode {
    fn title(&self) -> Label {
        label("Disperser")
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
        for (i, bin) in spectrum.iter_mut().enumerate().skip(1) {
            let a = ffi::powf(i as f32, abs_exp) * step * direction;
            *bin *= microfft::Complex32::new(ffi::cosf(a), ffi::sinf(a));
        }

        let mut full = helpers::unpack_real_fft(spectrum);
        let time = microfft::inverse::ifft_2048(&mut full);

        for i in 0..BUFFER_LEN {
            out[i] = time[i].re;
        }
    }
}
