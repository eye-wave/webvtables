use super::data::current;
use super::helpers;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use crate::ffi;

pub const DRAW_POINTS: usize = 256;
const BINS: usize = BUFFER_LEN / 2;

const BEND: f64 = 2.3;
const LEVEL_DB: f32 = 60.0;

pub struct DrawFilterNode;

impl NodeParamDef for DrawFilterNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_linear("Mix", 0.0, 100.0)
            .with_unit("%")
            .with_default_norm(1.0),
        Param::new_linear("Scale", 3.0, 60.0)
            .with_unit("dB")
            .with_default_denorm(30.0),
        Param::new_enum("Axis", &["Log", "Linear"]),
    ];
}

impl NodeLogic for DrawFilterNode {
    fn title(&self) -> Label {
        label("Draw Filter")
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
        let mix = (helpers::param(params, 0, 100.0) / 100.0) as f32;
        let scale = helpers::param(params, 1, 30.0) as f32;
        let linear = helpers::param(params, 2, 0.0) as u8 == 1;
        let curve = current().unwrap_or(&[]);

        let mut samples = helpers::copy_of(helpers::input(inputs, 0));
        let spectrum = microfft::real::rfft_2048(&mut samples);
        for (k, spec) in spectrum.iter_mut().enumerate() {
            *spec *= factor(curve, k, scale, mix, linear);
        }
        helpers::irfft_2048(spectrum, &mut outs[0]);
    }

    fn has_widget(&self) -> bool {
        true
    }

    fn fill_widget(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        out: &mut Buffer,
    ) -> usize {
        let mix = (helpers::param(params, 0, 100.0) / 100.0) as f32;
        let scale = helpers::param(params, 1, 30.0) as f32;
        let linear = helpers::param(params, 2, 0.0) as u8 == 1;
        let curve = current().unwrap_or(&[]);

        let mut samples = helpers::copy_of(helpers::input(inputs, 0));
        let spectrum = microfft::real::rfft_2048(&mut samples);
        let mut mags = [0.0f32; BINS];
        let mut filtered = [0.0f32; BINS];
        for k in 1..BINS {
            mags[k] = helpers::magnitude(&spectrum[k]);
            filtered[k] = mags[k] * factor(curve, k, scale, mix, linear);
        }
        let peak = mags.iter().fold(1e-9f32, |a, &b| a.max(b));
        let level =
            |m: f32| (1.0 + 20.0 * ffi::log10f(m.max(1e-9) / peak) / LEVEL_DB).clamp(0.0, 1.0);
        let edge = |i: usize| to_bin(i as f32 / (DRAW_POINTS - 1) as f32, linear);
        for i in 0..DRAW_POINTS {
            let lo = (edge(i) as usize).clamp(1, BINS - 1);
            let hi = (edge(i + 1) as usize).clamp(lo + 1, BINS);
            let top = |m: &[f32; BINS]| m[lo..hi].iter().fold(0.0f32, |a, &b| a.max(b));
            out[i] = level(top(&mags));
            out[DRAW_POINTS + i] = level(top(&filtered));
        }
        2 * DRAW_POINTS
    }
}

fn factor(curve: &[f32], k: usize, scale: f32, mix: f32, linear: bool) -> f32 {
    1.0 + mix * (gain(curve, k, scale, linear) - 1.0)
}

fn to_bin(t: f32, linear: bool) -> f32 {
    let u = if linear {
        t as f64
    } else {
        (ffi::exp(BEND * t as f64) - 1.0) / (ffi::exp(BEND) - 1.0)
    };
    1.0 + (BINS - 2) as f32 * u as f32
}

fn from_bin(bin: f32, linear: bool) -> f32 {
    let u = ((bin - 1.0) / (BINS - 2) as f32).clamp(0.0, 1.0) as f64;
    (if linear {
        u
    } else {
        ffi::log(1.0 + u * (ffi::exp(BEND) - 1.0)) / BEND
    }) as f32
}

fn gain(curve: &[f32], k: usize, scale: f32, linear: bool) -> f32 {
    if curve.len() != DRAW_POINTS {
        return 1.0;
    }
    let t = from_bin(k as f32, linear) * (DRAW_POINTS - 1) as f32;
    let i = (t as usize).min(DRAW_POINTS - 2);
    let y = curve[i] + (curve[i + 1] - curve[i]) * (t - i as f32);
    if y <= -1.0 {
        0.0
    } else {
        ffi::powf(10.0, y * scale / 20.0)
    }
}
