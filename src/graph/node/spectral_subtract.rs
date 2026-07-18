use crate::graph::node::helpers::magnitude;
use crate::graph::{BUFFER_LEN, Buffer, NodeCategory, Param, consts::*};
use microfft::Complex32;

use super::NodeLogic;
use super::helpers;

pub struct SpectralSubtractNode;

impl NodeLogic for SpectralSubtractNode {
    fn title(&self) -> &'static str {
        "Spectral Subtract"
    }

    fn category(&self) -> &'static [super::NodeCategory] {
        &[NodeCategory::Combine, NodeCategory::Fft]
    }

    fn input_count(&self) -> usize {
        2
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        crate::params![
            Param::new_linear("Mix", 0.0, 100.0)
                .with_unit("%")
                .with_default_norm(1.0)
        ]
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let mix = (helpers::param(params, 0, 100.0) / 100.0) as f32;
        let a = helpers::input(inputs, 0);
        let b = helpers::input(inputs, 1);
        let bins = BUFFER_LEN / 2;

        let mut a_time: [f32; BUFFER_LEN] = *a;
        let mut b_time: [f32; BUFFER_LEN] = *b;
        let a_spec = microfft::real::rfft_2048(&mut a_time);
        let b_spec = microfft::real::rfft_2048(&mut b_time);

        let dc = a_spec[0].re - b_spec[0].re;
        let nyq = a_spec[0].im - b_spec[0].im;

        let mut full = [Complex32::new(0.0, 0.0); BUFFER_LEN];
        full[0] = Complex32::new(dc, 0.0);
        full[bins] = Complex32::new(nyq, 0.0);
        for k in 1..bins {
            let mag_a = magnitude(&a_spec[k]);
            let mag_b = magnitude(&b_spec[k]);
            let mag = (mag_a - mag_b).max(0.0);

            let scale = mag / mag_a.max(1e-9);
            full[k] = a_spec[k] * scale;
            full[BUFFER_LEN - k] = full[k].conj();
        }

        let time = microfft::inverse::ifft_2048(&mut full);
        for i in 0..BUFFER_LEN {
            out[i] = a[i] * (1.0 - mix) + time[i].re * mix;
        }
    }
}
