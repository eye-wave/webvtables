use crate::draw::DrawBuf;
use crate::ffi;
use crate::graph::{BUFFER_LEN, BUFFER_LEN_F64, Buffer, GraphState, Node, Param, consts::*};

use super::NodeLogic;
use super::helpers::{self, PI32, TAU32};

const MAX_STAGES: usize = 10;

pub struct PhaserNode;

impl PhaserNode {
    fn stage_coef(center: f32) -> f32 {
        let w0 = (TAU32 * center / BUFFER_LEN as f32).min(PI32 * 0.999);
        let t = ffi::sinf(w0) / (1.0 + ffi::cosf(w0).max(1e-6));
        ((t - 1.0) / (t + 1.0)).clamp(-0.999, 0.999)
    }

    fn stage_coefs(base: f32, spacing: f32, count: usize) -> [f32; MAX_STAGES] {
        let mut a = [0f32; MAX_STAGES];
        for (i, slot) in a.iter_mut().enumerate().take(count) {
            *slot = Self::stage_coef(base + i as f32 * spacing);
        }
        a
    }
}

impl NodeLogic for PhaserNode {
    fn title(&self) -> &'static str {
        "Phaser"
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
            Param::new_log("Base Freq", 1.0, BUFFER_LEN_F64 / 4.0)
                .with_unit("bins")
                .with_default_denorm(80.0),
            Param::new_int("Peaks", 1, MAX_STAGES as i32).with_default_denorm(4.0),
            Param::new_linear("Resonance", 0.0, 100.0)
                .with_unit("%")
                .with_default_norm(0.3),
            Param::new_linear("Mix", 0.0, 100.0)
                .with_unit("%")
                .with_default_norm(0.5),
            Param::new_log("Spacing", 1.0, BUFFER_LEN_F64 / 4.0)
                .with_unit("bins")
                .with_default_denorm(80.0),
        ]
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let base = helpers::param(params, 0, 80.0).max(1.0) as f32;
        let peaks = (helpers::param(params, 1, 4.0) as usize).clamp(1, MAX_STAGES);
        let feedback = (helpers::param(params, 2, 30.0) / 100.0) as f32 * 0.95;
        let mix = (helpers::param(params, 3, 50.0) / 100.0) as f32;
        let spacing = helpers::param(params, 4, 80.0).max(1.0) as f32;
        let src = helpers::input(inputs, 0);

        let a_coef = Self::stage_coefs(base, spacing, peaks);

        let mut stage_state = [0f32; MAX_STAGES];
        let mut fb_state = 0.0;

        for i in 0..BUFFER_LEN {
            let x = src[i];
            let mut v = x + feedback * fb_state;

            for s in 0..peaks {
                let a = a_coef[s];
                let y = -a * v + stage_state[s];
                let mut s_next = v + a * y;
                if !s_next.is_finite() {
                    s_next = 0.0;
                }
                stage_state[s] = s_next;
                v = y;
            }

            let wet = v;
            fb_state = if wet.is_finite() { wet } else { 0.0 };
            out[i] = x * (1.0 - mix) + wet.clamp(-1e6, 1e6) * mix;
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
        let base = helpers::param(params, 0, 80.0).max(1.0) as f32;
        let peaks = (helpers::param(params, 1, 4.0) as usize).clamp(1, MAX_STAGES);
        let feedback = (helpers::param(params, 2, 30.0) / 100.0) as f32 * 0.95;
        let mix = (helpers::param(params, 3, 50.0) / 100.0) as f32;
        let spacing = helpers::param(params, 4, 80.0).max(1.0) as f32;
        let a_coef = Self::stage_coefs(base, spacing, peaks);
        let bins = (BUFFER_LEN / 2) as f32;

        ctx.fill_style([18, 18, 22]);
        ctx.fill_rect(x, y, w, h, true);

        let db_min = -30.0f32;
        let db_max = 6.0f32;
        let db_to_y =
            |db: f32| y + h * (1.0 - (db.clamp(db_min, db_max) - db_min) / (db_max - db_min));

        ctx.stroke_style([70, 70, 78]);
        ctx.line_width(1.0);
        ctx.stroke_line(x, db_to_y(0.0), x + w, db_to_y(0.0), true);

        ctx.stroke_style([255, 215, 0]);
        ctx.line_width(2.0);
        let mut prev: Option<(f32, f32)> = None;
        for px in 0..(w as usize) {
            let min_freq = 20.0f32;
            let max_freq = bins;
            let pct = px as f32 / w.max(1.0);
            let bin = min_freq * ffi::powf(max_freq / min_freq, pct);

            let wr = (TAU32 * bin / BUFFER_LEN as f32).min(PI32 * 0.999);
            let (cw, sw) = (ffi::cosf(wr), ffi::sinf(wr));

            let (mut ar, mut ai) = (1.0f32, 0.0f32);
            for &a in a_coef.iter().take(peaks) {
                let (nr, ni) = (-a + cw, -sw);
                let (dr, di) = (1.0 - a * cw, a * sw);
                let d2 = (dr * dr + di * di).max(1e-9);
                let (hr, hi) = ((nr * dr + ni * di) / d2, (ni * dr - nr * di) / d2);
                let (new_ar, new_ai) = (ar * hr - ai * hi, ar * hi + ai * hr);
                ar = new_ar;
                ai = new_ai;
            }

            let (or_, oi) = (1.0 - feedback * ar, -feedback * ai);
            let o2 = (or_ * or_ + oi * oi).max(1e-9);
            let (wr_, wi_) = ((ar * or_ + ai * oi) / o2, (ai * or_ - ar * oi) / o2);

            let yr = (1.0 - mix) + mix * wr_;
            let yi = mix * wi_;
            let mag = ffi::sqrtf(yr * yr + yi * yi);
            let db = 20.0 * ffi::log10f(mag.max(1e-6));

            let px_x = x + px as f32;
            let px_y = db_to_y(db);
            if let Some((lx, ly)) = prev {
                ctx.stroke_line(lx, ly, px_x, px_y, true);
            }
            prev = Some((px_x, px_y));
        }
    }
}
