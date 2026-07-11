use crate::draw::DrawBuf;
use crate::ffi;
use crate::graph::{BUFFER_LEN, BUFFER_LEN_F64, Buffer, GraphState, Node, Param, consts::*};

use super::helpers::{self, PI32, TAU32};
use super::{NodeLogic, NodeState};

pub struct IirFilterNode;

impl IirFilterNode {
    /// RBJ cookbook biquad coefficients, normalized by a0.
    fn coeffs(shape: u8, w0: f32, q: f32, gain_db: f32) -> (f32, f32, f32, f32, f32) {
        let cos_w0 = ffi::cosf(w0);
        let sin_w0 = ffi::sinf(w0);
        let alpha = sin_w0 / (2.0 * q);
        let a = ffi::powf(10.0, gain_db / 40.0);

        let (b0, b1, b2, a0, a1, a2) = match shape {
            0 => (
                (1.0 - cos_w0) / 2.0,
                1.0 - cos_w0,
                (1.0 - cos_w0) / 2.0,
                1.0 + alpha,
                -2.0 * cos_w0,
                1.0 - alpha,
            ),
            1 => (
                (1.0 + cos_w0) / 2.0,
                -(1.0 + cos_w0),
                (1.0 + cos_w0) / 2.0,
                1.0 + alpha,
                -2.0 * cos_w0,
                1.0 - alpha,
            ),
            2 => (
                sin_w0 / 2.0,
                0.0,
                -sin_w0 / 2.0,
                1.0 + alpha,
                -2.0 * cos_w0,
                1.0 - alpha,
            ),
            3 | 4 => {
                let s = q.clamp(0.05, 5.0);
                let sqrt_a = ffi::sqrtf(a);
                let alpha_s = sin_w0 / 2.0 * ffi::sqrtf((a + 1.0 / a) * (1.0 / s - 1.0) + 2.0);
                if shape == 3 {
                    (
                        a * ((a + 1.0) - (a - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha_s),
                        2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0),
                        a * ((a + 1.0) - (a - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha_s),
                        (a + 1.0) + (a - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha_s,
                        -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0),
                        (a + 1.0) + (a - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha_s,
                    )
                } else {
                    (
                        a * ((a + 1.0) + (a - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha_s),
                        -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0),
                        a * ((a + 1.0) + (a - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha_s),
                        (a + 1.0) - (a - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha_s,
                        2.0 * ((a - 1.0) - (a + 1.0) * cos_w0),
                        (a + 1.0) - (a - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha_s,
                    )
                }
            }
            5 => (
                1.0 + alpha * a,
                -2.0 * cos_w0,
                1.0 - alpha * a,
                1.0 + alpha / a,
                -2.0 * cos_w0,
                1.0 - alpha / a,
            ),
            _ => (
                1.0,
                -2.0 * cos_w0,
                1.0,
                1.0 + alpha,
                -2.0 * cos_w0,
                1.0 - alpha,
            ),
        };

        let coeffs = (b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
        if coeffs.0.is_finite()
            && coeffs.1.is_finite()
            && coeffs.2.is_finite()
            && coeffs.3.is_finite()
            && coeffs.4.is_finite()
        {
            coeffs
        } else {
            (1.0, 0.0, 0.0, 0.0, 0.0)
        }
    }
}

impl NodeLogic for IirFilterNode {
    fn title(&self) -> &'static str {
        "IIR Filter"
    }

    fn category(&self) -> &'static [super::NodeCategory] {
        &[super::NodeCategory::Effect]
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
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
        state: &mut NodeState,
        out: &mut Buffer,
    ) {
        let shape = helpers::param(params, 0, 0.0) as u8;
        let freq = (helpers::param(params, 1, 1000.0) as f32).max(1.0);
        let gain_db = helpers::param(params, 2, 0.0) as f32;
        let q = (helpers::param(params, 3, 0.707) as f32).max(0.02);
        let mix = (helpers::param(params, 4, 100.0) / 100.0) as f32;
        let src = helpers::input(inputs, 0);

        let w0 = (TAU32 * freq / BUFFER_LEN as f32).min(PI32 * 0.999);
        let (b0, b1, b2, a1, a2) = Self::coeffs(shape, w0, q, gain_db);

        let mut z1 = state[0];
        let mut z2 = state[1];

        for i in 0..BUFFER_LEN {
            let x = src[i];
            let y = b0 * x + z1;
            z1 = b1 * x - a1 * y + z2;
            z2 = b2 * x - a2 * y;
            if !z1.is_finite() {
                z1 = 0.0;
            }
            if !z2.is_finite() {
                z2 = 0.0;
            }
            out[i] = x * (1.0 - mix) + y.clamp(-1e6, 1e6) * mix;
        }

        state[0] = z1;
        state[1] = z2;
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
        let freq = (helpers::param(params, 1, 1000.0) as f32).max(1.0);
        let gain_db = helpers::param(params, 2, 0.0) as f32;
        let q = (helpers::param(params, 3, 0.707) as f32).max(0.02);
        let mix = (helpers::param(params, 4, 100.0) / 100.0) as f32;

        let w0 = (TAU32 * freq / BUFFER_LEN as f32).min(PI32 * 0.999);
        let (b0, b1, b2, a1, a2) = Self::coeffs(shape, w0, q, gain_db);
        let bins = BUFFER_LEN / 2;

        ctx.fill_style([18, 18, 22]);
        ctx.fill_rect(x, y, w, h, true);

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
            let wr = TAU32 * bin / BUFFER_LEN as f32;
            let (cw, sw) = (ffi::cosf(wr), ffi::sinf(wr));
            let (c2w, s2w) = (ffi::cosf(2.0 * wr), ffi::sinf(2.0 * wr));

            let num_re = b0 + b1 * cw + b2 * c2w;
            let num_im = -b1 * sw - b2 * s2w;
            let den_re = 1.0 + a1 * cw + a2 * c2w;
            let den_im = -a1 * sw - a2 * s2w;

            let num_mag = ffi::sqrtf(num_re * num_re + num_im * num_im);
            let den_mag = ffi::sqrtf(den_re * den_re + den_im * den_im).max(1e-6);
            let ratio = num_mag / den_mag;

            let mixed_ratio = (1.0 - mix) + mix * ratio;
            let db = 20.0 * ffi::log10f(mixed_ratio.max(1e-6));

            let px_x = x + px as f32;
            let px_y = db_to_y(db);
            if let Some((lx, ly)) = prev {
                ctx.stroke_line(lx, ly, px_x, px_y, true);
            }
            prev = Some((px_x, px_y));
        }

        true
    }
}
