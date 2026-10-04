use super::helpers::{self};
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use crate::ffi;

pub struct SpectralGateNode;

impl NodeParamDef for SpectralGateNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_linear("Threshold", -80.0, 10.0)
            .with_unit("dB")
            .with_default_norm(1.0),
        Param::new_linear("Mix", 0.0, 100.0)
            .with_unit("%")
            .with_default_norm(1.0)
    ];
}

impl NodeLogic for SpectralGateNode {
    fn title(&self) -> Label {
        label("Spectral Gate")
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

        let src = helpers::input(inputs, 0);
        let mix = (helpers::param(params, 1, 100.0) / 100.0) as f32;

        let threshold = ffi::powf(10.0, threshold_db / 20.0);
        let thr2 = {
            let t = threshold * (BUFFER_LEN as f32 / 2.0);
            t * t
        };
        let floor = 1.0 - mix;

        let mut samples = helpers::copy_of(src);
        let spectrum = microfft::real::rfft_2048(&mut samples);

        for bin in spectrum.iter_mut() {
            if bin.re * bin.re + bin.im * bin.im <= thr2 {
                *bin *= floor;
            }
        }

        helpers::irfft_2048(spectrum, out);
    }
}
