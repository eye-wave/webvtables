use crate::graph::node::BUFFER_LEN;

use super::helpers;
use super::{Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use alloc::boxed::Box;
use microfft::Complex32;

pub struct RotateNode;

impl NodeParamDef for RotateNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_enum("Mode", &["Rotate", "Reverse"]),
        Param::new_int("Amount", 0, 1023),
        Param::new_linear("Mix", 0.0, 100.0)
            .with_unit("%")
            .with_default_norm(1.0),
    ];
}

impl NodeLogic for RotateNode {
    fn title(&self) -> Label {
        label("Spectral Rotate")
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
        let reverse = helpers::param(params, 0, 0.0) as u8 == 1;
        let amt = helpers::param(params, 1, 0.0) as usize;
        let mix = (helpers::param(params, 2, 100.0) / 100.0) as f32;

        let mut samples = helpers::copy_of(helpers::input(inputs, 0));
        let spectrum = microfft::real::rfft_2048(&mut samples);
        let n = spectrum.len();
        let m = n - 1;

        let mut src: Box<[Complex32; BUFFER_LEN / 2]> = helpers::boxed(Complex32::new(0.0, 0.0));
        src.copy_from_slice(spectrum);

        for k in 1..n {
            let i = k - 1;
            let j = if reverse { m - 1 - i } else { i };
            let from = (j + m - amt % m) % m + 1;
            let moved = src[from];
            let orig = src[k];
            spectrum[k] = Complex32::new(
                orig.re + mix * (moved.re - orig.re),
                orig.im + mix * (moved.im - orig.im),
            );
        }

        helpers::irfft_2048(spectrum, &mut outs[0]);
    }
}
