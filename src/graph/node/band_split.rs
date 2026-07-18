use crate::graph::{BUFFER_LEN, BUFFER_LEN_F64, Buffer, MAX_PARAMS, NodeCategory, Param};

use super::NodeLogic;
use super::helpers;

pub struct BandSplitNode;

impl BandSplitNode {
    fn band(src: &Buffer, lo: usize, hi: usize) -> Buffer {
        let mut samples: [f32; BUFFER_LEN] = *src;
        let spectrum = microfft::real::rfft_2048(&mut samples);

        for (k, spec) in spectrum.iter_mut().enumerate() {
            if k < lo || k >= hi {
                *spec = Default::default();
            }
        }

        let mut full = helpers::unpack_real_fft(spectrum);
        let time = microfft::inverse::ifft_2048(&mut full);

        let mut out = [0f32; BUFFER_LEN];
        for i in 0..BUFFER_LEN {
            out[i] = time[i].re;
        }
        out
    }
}

impl NodeLogic for BandSplitNode {
    fn title(&self) -> &'static str {
        "Band split"
    }

    fn category(&self) -> &'static [super::NodeCategory] {
        &[NodeCategory::Fft]
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        3
    }

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        crate::params![
            Param::new_log("Low band", 1.0, BUFFER_LEN_F64)
                .with_unit("bins")
                .with_default_denorm(40.0),
            Param::new_log("High band", 1.0, BUFFER_LEN_F64)
                .with_unit("bins")
                .with_default_denorm(1500.0),
        ]
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let bins = BUFFER_LEN / 2;
        let low_edge = helpers::param(params, 0, 40.0) as f32;
        let high_edge = helpers::param(params, 1, 1500.0) as f32;
        let src = helpers::input(inputs, 0);

        let lo = low_edge.clamp(0.0, bins as f32) as usize;
        let hi = high_edge.clamp(lo as f32, bins as f32) as usize;

        outs[0] = Self::band(src, 0, lo);
        outs[1] = Self::band(src, lo, hi);
        outs[2] = Self::band(src, hi, bins);
    }

    fn has_widget(&self) -> bool {
        false
    }
}
