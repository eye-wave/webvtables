use crate::ffi;
use crate::graph::NodeCategory;
use crate::graph::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeLogic, Param, node::helpers};

pub struct InharmonicShiftNode;

impl NodeLogic for InharmonicShiftNode {
    fn title(&self) -> &'static str {
        "Inharmonic shift"
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

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        crate::params![Param::new_log("Shift", -20.0, 512.0).with_default_denorm(0.0)]
    }

    /*
     * This function was ported from:
     * https://github.com/mtytel/vital
     *
     * Original license: GNU General Public License v3.0
     * Original author: Matt Tytel
     */
    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let shift = helpers::param(params, 0, 0.0);
        let mult = (1.0 + shift * 0.05).max(1e-6);

        let src = helpers::input(inputs, 0);
        let mut samples: [f32; BUFFER_LEN] = *src;
        let spectrum = microfft::real::rfft_2048(&mut samples);
        let n = spectrum.len();

        let mut shifted = *spectrum;
        for b in shifted.iter_mut().skip(1) {
            b.re = 0.0;
            b.im = 0.0;
        }

        let max_octave = ffi::log2f(n as f32);

        for (i, bin) in spectrum.iter().enumerate().take(n).skip(1) {
            let octave = ffi::log2f(i as f32);
            let power = octave / max_octave;
            let shift_amt = ffi::powf(mult as f32, power);
            let shifted_index = (shift_amt * (i as f32 - 1.0) + 1.0).max(1.0);

            let dest = shifted_index as usize;
            if dest >= n {
                continue;
            }
            let t = shifted_index - dest as f32;

            shifted[dest].re += (1.0 - t) * bin.re;
            shifted[dest].im += (1.0 - t) * bin.im;
            if dest + 1 < n {
                shifted[dest + 1].re += t * bin.re;
                shifted[dest + 1].im += t * bin.im;
            }
        }

        spectrum.copy_from_slice(&shifted);

        let mut full = helpers::unpack_real_fft(spectrum);
        let time = microfft::inverse::ifft_2048(&mut full);

        for i in 0..BUFFER_LEN {
            out[i] = time[i].re;
        }

        let in_peak = src.iter().fold(0.0f32, |m, &x| m.max(x.abs()));
        let out_peak = out.iter().fold(0.0f32, |m, &x| m.max(x.abs()));
        if out_peak > 1e-6 {
            let scale = in_peak / out_peak;
            for s in out.iter_mut() {
                *s *= scale;
            }
        }
    }
}
