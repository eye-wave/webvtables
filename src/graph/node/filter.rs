use crate::draw::DrawBuf;
use crate::ffi;
use crate::graph::{BUFFER_LEN, Buffer, GraphState, Node, Param, consts::*, node_colors};
use microfft::Complex32;

use super::helpers;
use super::{NodeLogic, NodeState};

pub struct FilterNode;

impl FilterNode {
    fn magnitude(shape: u8, x: f32, q: f32, gain_db: f32) -> f32 {
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

    fn category(&self) -> super::NodeCategory {
        super::NodeCategory::Fft
    }

    fn header_color(&self) -> [u8; 3] {
        node_colors::EFFECT
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        let mut p = [None; MAX_PARAMS];

        p[0] = Some(Param::new_enum(
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
        ));

        p[1] = Some(
            Param::new_log("Freq", 1.0, BUFFER_LEN as f64)
                .with_unit("bins")
                .with_default_denormf(777.77),
        );
        p[2] = Some(
            Param::new_linear("Gain", -30.0, 30.0)
                .with_unit("dB")
                .with_default_norm(0.5),
        );
        p[3] = Some(Param::new_linear("Q", 0.0, 10.0).with_default_denormf(1.0));
        p[4] = Some(
            Param::new_linear("Mix", 0.0, 100.0)
                .with_unit("%")
                .with_default_norm(1.0),
        );

        p
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut NodeState,
        out: &mut Buffer,
    ) {
        let shape = helpers::param(params, 0, 0.0) as u8;
        let freq = helpers::param(params, 1, 1000.0) as f32;
        let gain_db = helpers::param(params, 2, 0.0) as f32;
        let q = helpers::param(params, 3, 0.707) as f32;
        let mix = (helpers::param(params, 4, 0.0) / 100.0) as f32;
        let src = helpers::input(inputs, 0);

        let mut samples: [f32; BUFFER_LEN] = *src;
        let spectrum = microfft::real::rfft_2048(&mut samples);
        let bins = BUFFER_LEN / 2;

        let dc = spectrum[0].re * Self::mask(shape, freq, q, gain_db, 0);
        let nyq = spectrum[0].im * Self::mask(shape, freq, q, gain_db, bins);
        for (k, spec) in spectrum.iter_mut().enumerate().take(bins).skip(1) {
            *spec *= Self::mask(shape, freq, q, gain_db, k);
        }

        let mut full = [Complex32::new(0.0, 0.0); BUFFER_LEN];
        full[0] = Complex32::new(dc, 0.0);
        full[bins] = Complex32::new(nyq, 0.0);
        for (k, spec) in spectrum.iter_mut().enumerate().take(bins).skip(1) {
            full[k] = *spec;
            full[BUFFER_LEN - k] = spec.conj();
        }

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
    ) -> bool {
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

        ctx.fill_style([18, 18, 22]);
        ctx.fill_rect(x, y, w, h);

        let db_min = -30.0f32;
        let db_max = 30.0f32;
        let db_to_y =
            |db: f32| y + h * (1.0 - (db.clamp(db_min, db_max) - db_min) / (db_max - db_min));

        ctx.stroke_style([70, 70, 78]);
        ctx.line_width(1.0);
        ctx.stroke_line(x, db_to_y(0.0), x + w, db_to_y(0.0));

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
                ctx.stroke_line(lx, ly, px_x, px_y);
            }
            prev = Some((px_x, px_y));
        }

        true
    }
}
