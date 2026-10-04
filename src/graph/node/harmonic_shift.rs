use super::helpers::{self};
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use alloc::boxed::Box;
use microfft::Complex32;

pub struct HarmonicShiftNode;

impl NodeParamDef for HarmonicShiftNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] =
        crate::params![Param::new_log("Shift", -20.0, 512.0).with_default_denorm(0.0)];
}

impl NodeLogic for HarmonicShiftNode {
    fn title(&self) -> Label {
        label("Harmonic shift")
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
        let shift = (1.0 + helpers::param(params, 0, 0.0) * 0.05) as f32;

        let src = helpers::input(inputs, 0);
        let mut samples = helpers::copy_of(src);
        let spectrum = microfft::real::rfft_2048(&mut samples);
        let n = spectrum.len();

        let mut shifted: Box<[Complex32; BUFFER_LEN / 2]> =
            helpers::boxed(Complex32::new(0.0, 0.0));
        shifted.copy_from_slice(spectrum);
        for b in shifted.iter_mut().skip(1) {
            b.re = 0.0;
            b.im = 0.0;
        }

        for (i, bin) in spectrum.iter().enumerate().take(n).skip(1) {
            let shifted_index = ((i as f32 - 1.0) * shift + 1.0).max(1.0);
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

        spectrum.copy_from_slice(&shifted[..]);

        helpers::irfft_2048(spectrum, out);

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
