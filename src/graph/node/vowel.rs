use super::helpers;
use super::{BUFFER_LEN_F64, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use crate::ffi;

const FORMANTS: [[f32; 3]; 5] = [
    [730.0, 1090.0, 2440.0],
    [530.0, 1840.0, 2480.0],
    [270.0, 2290.0, 3010.0],
    [570.0, 840.0, 2410.0],
    [300.0, 870.0, 2240.0],
];
const AMPS: [f32; 3] = [1.0, 0.5, 0.25];

pub struct VowelNode;

impl VowelNode {
    fn magnitude(vowel: f32, freq: f32, q: f32, bin: f32) -> f32 {
        let v = vowel.clamp(0.0, 4.0);
        let i = (v as usize).min(3);
        let t = v - i as f32;
        let mut m = 0.0;
        for f in 0..3 {
            let hz = FORMANTS[i][f] + t * (FORMANTS[i + 1][f] - FORMANTS[i][f]);
            let fc = (hz / 1000.0 * freq).max(1.0);
            let x = bin / fc;
            let d = q * (x - 1.0 / x.max(1e-6));
            m += AMPS[f] / ffi::sqrtf(1.0 + d * d);
        }
        m
    }
}

impl NodeParamDef for VowelNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_linear("Vowel", 0.0, 4.0).with_default_denorm(0.0),
        Param::new_log("Freq", 1.0, BUFFER_LEN_F64)
            .with_unit("bins")
            .with_default_denorm(9.09),
        Param::new_linear("Q", 1.0, 30.0).with_default_denorm(6.0),
        Param::new_linear("Mix", 0.0, 100.0)
            .with_unit("%")
            .with_default_norm(1.0),
    ];
}

impl NodeLogic for VowelNode {
    fn title(&self) -> Label {
        label("Vowel Filter")
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
        let vowel = helpers::param(params, 0, 0.0) as f32;
        let freq = helpers::param(params, 1, 9.09).max(1.0) as f32;
        let q = helpers::param(params, 2, 6.0) as f32;
        let mix = (helpers::param(params, 3, 100.0) / 100.0) as f32;

        let mut samples = helpers::copy_of(helpers::input(inputs, 0));
        let spectrum = microfft::real::rfft_2048(&mut samples);

        for (k, spec) in spectrum.iter_mut().enumerate() {
            let m = if k == 0 {
                0.0
            } else {
                Self::magnitude(vowel, freq, q, k as f32)
            };
            *spec *= 1.0 + mix * (m - 1.0);
        }

        helpers::irfft_2048(spectrum, &mut outs[0]);
    }

    fn has_widget(&self) -> bool {
        true
    }

    fn fill_widget(
        &self,
        _: &[&Buffer],
        p: &[Option<Param>; MAX_PARAMS],
        out: &mut Buffer,
    ) -> usize {
        let vowel = helpers::param(p, 0, 0.0) as f32;
        let freq = helpers::param(p, 1, 9.09).max(1.0) as f32;
        let q = helpers::param(p, 2, 6.0) as f32;
        let mix = (helpers::param(p, 3, 100.0) / 100.0) as f32;
        helpers::response_curve(out, mix, |bin| Self::magnitude(vowel, freq, q, bin))
    }
}
