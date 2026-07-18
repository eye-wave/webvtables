use crate::ffi;
use crate::graph::{
    BUFFER_LEN, BUFFER_LEN_F32, Param,
    node::helpers::{self, TAU32},
};
use crate::graph::{Buffer, NodeCategory};

use super::NodeLogic;

pub struct DisperserNode;

impl NodeLogic for DisperserNode {
    fn title(&self) -> &'static str {
        "Disperser"
    }

    fn category(&self) -> &'static [super::NodeCategory] {
        &[NodeCategory::Effect, NodeCategory::Fft]
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; crate::graph::MAX_PARAMS] {
        crate::params![Param::new_linear("Exponent", -10.0, 10.0).with_default_denorm(0.0)]
    }

    fn process(
        &self,
        inputs: &[&crate::graph::Buffer],
        params: &[Option<Param>; crate::graph::MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let exp = helpers::param(params, 0, 0.0) as f32;
        let src = helpers::input(inputs, 0);

        let direction = if exp >= 0.0 { 1.0 } else { -1.0 };
        let abs_exp = exp.abs();

        let mut samples: [f32; BUFFER_LEN] = *src;
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
