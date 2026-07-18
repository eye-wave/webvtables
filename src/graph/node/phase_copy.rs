use crate::graph::node::helpers::{from_mag_phase, magnitude, phase};
use crate::graph::{BUFFER_LEN, Buffer, NodeCategory, Param, consts::*};
use microfft::Complex32;

use super::NodeLogic;
use super::helpers;

pub struct PhaseCopyNode;

impl NodeLogic for PhaseCopyNode {
    fn title(&self) -> &'static str {
        "Phase copy"
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

    fn process(&self, inputs: &[&Buffer], _params: &[Option<Param>; MAX_PARAMS], out: &mut Buffer) {
        let a = helpers::input(inputs, 0);
        let b = helpers::input(inputs, 1);
        let bins = BUFFER_LEN / 2;

        let mut a_time: [f32; BUFFER_LEN] = *a;
        let mut b_time: [f32; BUFFER_LEN] = *b;
        let a_spec = microfft::real::rfft_2048(&mut a_time);
        let b_spec = microfft::real::rfft_2048(&mut b_time);

        let dc = a_spec[0].re.abs() * b_spec[0].re.signum();
        let nyq = a_spec[0].im.abs() * b_spec[0].im.signum();

        let mut full = [Complex32::new(0.0, 0.0); BUFFER_LEN];
        full[0] = Complex32::new(dc, 0.0);
        full[bins] = Complex32::new(nyq, 0.0);
        for k in 1..bins {
            let mag = magnitude(&a_spec[k]);
            let phase = phase(&b_spec[k]);
            let bin = from_mag_phase(mag, phase);

            full[k] = bin;
            full[BUFFER_LEN - k] = full[k].conj();
        }

        let time = microfft::inverse::ifft_2048(&mut full);
        for i in 0..BUFFER_LEN {
            out[i] = time[i].re;
        }
    }
}
