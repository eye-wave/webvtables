use crate::draw::DrawBuf;
use crate::ffi;
use crate::graph::{
    BUFFER_LEN, BUFFER_LEN_F64, Buffer, GraphState, Node, NodeCategory, Param, consts::*,
};

use super::NodeLogic;
use super::helpers;

pub struct FilterNode;

impl FilterNode {
    fn magnitude(shape: u8, x: f32, q: f32, gain_db: f32) -> f32 {
        let q = q.max(f32::EPSILON);

        let x2 = x * x;
        let reso = x2 / (q * q);
        let denom = (1.0 - x2) * (1.0 - x2) + reso;
        let gain = ffi::powf(10.0, gain_db / 20.0);

        match shape {
            0 => ffi::sqrtf(1.0 / denom),
            1 => ffi::sqrtf(x2 * x2 / denom),
            2 => ffi::sqrtf(reso / denom),
            3 => {
                let s = 2.0 * q.max(0.15);
                let t = 1.0 / (1.0 + ffi::powf(x, s));
                1.0 + (gain - 1.0) * t
            }
            4 => {
                let s = 2.0 * q.max(0.15);
                let xs = ffi::powf(x, s);
                let t = xs / (1.0 + xs);
                1.0 + (gain - 1.0) * t
            }
            5 => 1.0 + (gain - 1.0) * (reso / denom),
            6 => ffi::sqrtf((1.0 - x2) * (1.0 - x2) / denom),

            _ => 1.0,
        }
    }

    fn mask(shape: u8, freq: f32, q: f32, gain_db: f32, bin: usize) -> f32 {
        Self::magnitude(shape, bin as f32 / freq, q, gain_db)
    }
}

impl NodeLogic for FilterNode {
    fn title(&self) -> &'static str {
        "FFT Filter"
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

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        crate::params![
            Param::new_enum(
                "Shape",
                &[
                    "Lowpass",
                    "Highpass",
                    "Bandpass",
                    "Lowshelf",
                    "Highshelf",
                    "Peaking",
                    "Notch",
                ],
            ),
            Param::new_log("Freq", 1.0, BUFFER_LEN_F64)
                .with_unit("bins")
                .with_default_denorm(777.77),
            Param::new_linear("Gain", -30.0, 30.0)
                .with_unit("dB")
                .with_default_norm(0.5),
            Param::new_linear("Q", 0.0, 10.0).with_default_denorm(1.0),
            Param::new_linear("Mix", 0.0, 100.0)
                .with_unit("%")
                .with_default_norm(1.0),
        ]
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let shape = helpers::param(params, 0, 0.0) as u8;
        let freq = helpers::param(params, 1, 1000.0) as f32;
        let gain_db = helpers::param(params, 2, 0.0) as f32;
        let q = helpers::param(params, 3, 0.707) as f32;
        let mix = (helpers::param(params, 4, 0.0) / 100.0) as f32;
        let src = helpers::input(inputs, 0);

        let mut samples: [f32; BUFFER_LEN] = *src;
        let spectrum = microfft::real::rfft_2048(&mut samples);
        let bins = BUFFER_LEN / 2;

        for (k, spec) in spectrum.iter_mut().enumerate().take(bins).skip(1) {
            *spec *= Self::mask(shape, freq, q, gain_db, k);
        }

        let mut full = helpers::unpack_real_fft(spectrum);
        let time = microfft::inverse::ifft_2048(&mut full);

        for i in 0..BUFFER_LEN {
            let dry = src[i];
            let wet = time[i].re;

            out[i] = dry * (1.0 - mix) + wet * (mix);
        }
    }

    fn has_widget(&self) -> bool {
        true
    }

    fn draw_widget(
        &self,
        node: &Node,
        _i: usize,
        _s: &GraphState,
        ctx: &mut DrawBuf,
        rect: (f32, f32, f32, f32),
    ) {
        let (x, y, w, h) = rect;
        let params = &node.params;
        let shape = helpers::param(params, 0, 0.0) as u8;
        let freq = helpers::param(params, 1, 1000.0).max(1.0) as f32;
        let gain_db = helpers::param(params, 2, 0.0) as f32;
        let q = helpers::param(params, 3, 0.707).max(0.05) as f32;
        let mix = (helpers::param(params, 4, 100.0) / 100.0) as f32;

        let mut impulse = [0f32; BUFFER_LEN];
        impulse[0] = 1.0;
        let spectrum = microfft::real::rfft_2048(&mut impulse);
        let bins = BUFFER_LEN / 2;

        let db_min = -30.0f32;
        let db_max = 30.0f32;
        let db_to_y =
            |db: f32| y + h * (1.0 - (db.clamp(db_min, db_max) - db_min) / (db_max - db_min));

        ctx.stroke_style([70, 70, 78]);
        ctx.line_width(1.0);
        ctx.stroke_line(x, db_to_y(0.0), x + w, db_to_y(0.0), true);

        ctx.stroke_style([255, 215, 0]);
        ctx.line_width(2.0);
        let mut prev: Option<(f32, f32)> = None;
        for px in 0..(w as usize) {
            let t = px as f32 / w.max(1.0);
            let bin = ffi::powf(bins as f32, t).clamp(1.0, (bins - 1) as f32);
            let k = bin as usize;
            let c = spectrum[k];
            let in_mag = ffi::sqrtf(c.re * c.re + c.im * c.im).max(1e-6);
            let out_mag = in_mag * Self::mask(shape, freq, q, gain_db, k);
            let ratio = out_mag / in_mag;

            let mixed_ratio = (1.0 - mix) + mix * ratio;
            let db = 20.0 * ffi::log10f(mixed_ratio.max(1e-6));

            let px_x = x + px as f32;
            let px_y = db_to_y(db);
            if let Some((lx, ly)) = prev {
                ctx.stroke_line(lx, ly, px_x, px_y, true);
            }
            prev = Some((px_x, px_y));
        }
    }
}
