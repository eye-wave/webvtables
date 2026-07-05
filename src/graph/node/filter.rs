use crate::draw::DrawBuf;
use crate::ffi;
use crate::graph::node::helpers::PI64;
use crate::graph::{BUFFER_LEN, Buffer, GraphState, Node, Param, consts::*, node_colors};

use super::helpers;
use super::{NodeLogic, NodeState};

pub struct FilterNode;

impl NodeLogic for FilterNode {
    fn title(&self) -> &'static str {
        "FilterNode"
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
                "Lowshelf",
                "Lowcut",
                "Highcut",
                "Highshelf",
                "Bell",
                "Notch",
                "Allpass",
            ],
        ));

        p[1] = Some(Param::new_log("Freq", 1.0, (BUFFER_LEN / 2) as f64).with_unit("cyc"));
        p[2] = Some(Param::new_linear("Gain", -30.0, 30.0).with_unit("dB"));
        p[3] = Some(Param::new_linear("Q", 0.0, 10.0));

        p
    }

    // Standard RBJ Audio-EQ-Cookbook biquad. History (x1,x2,y1,y2) lives in
    // `state[0..4]` so the filter carries continuously across process()
    // calls instead of clicking to zero every buffer. There's no sample
    // rate in this engine — frames are fixed at BUFFER_LEN samples, so
    // BUFFER_LEN stands in for it below.
    // ponytail: shelving filters normally take a separate "slope" (S)
    // control; here the existing Q knob doubles as it (alpha derived the
    // same way for every shape) rather than adding a 5th param. Revisit if
    // the shelves need an independently tunable slope.
    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        state: &mut NodeState,
        out: &mut Buffer,
    ) {
        let shape = helpers::param(params, 0, 0.0) as u8;
        // No real sample rate here — frames are fixed at BUFFER_LEN samples,
        // so "Freq" is really cycles-per-frame, not Hz/sec. Clamped the same
        // way (min 20, capped just under this frame's Nyquist).
        let freq = helpers::param(params, 1, 1000.0);
        let gain_db = helpers::param(params, 2, 0.0);
        let q = helpers::param(params, 3, 0.707).max(0.05);
        let src = helpers::input(inputs, 0);

        let sr = BUFFER_LEN as f64;
        let f0 = freq.clamp(1.0, sr * 0.49);
        let w0 = 2.0 * PI64 * f0 / sr;
        let cos_w0 = ffi::cos(w0);
        let sin_w0 = ffi::sin(w0);
        let alpha = sin_w0 / (2.0 * q);
        let a = ffi::exp(gain_db * core::f64::consts::LN_10 / 40.0); // 10^(dB/40)
        let sqrt_a = ffi::sqrt(a);

        let (b0, b1, b2, a0, a1, a2) = match shape {
            1 => (
                // Lowcut (highpass)
                (1.0 + cos_w0) / 2.0,
                -(1.0 + cos_w0),
                (1.0 + cos_w0) / 2.0,
                1.0 + alpha,
                -2.0 * cos_w0,
                1.0 - alpha,
            ),
            2 => (
                // Highcut (lowpass)
                (1.0 - cos_w0) / 2.0,
                1.0 - cos_w0,
                (1.0 - cos_w0) / 2.0,
                1.0 + alpha,
                -2.0 * cos_w0,
                1.0 - alpha,
            ),
            3 => (
                // Highshelf
                a * ((a + 1.0) + (a - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha),
                -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0),
                a * ((a + 1.0) + (a - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha),
                (a + 1.0) - (a - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha,
                2.0 * ((a - 1.0) - (a + 1.0) * cos_w0),
                (a + 1.0) - (a - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha,
            ),
            4 => (
                // Bell (peaking EQ)
                1.0 + alpha * a,
                -2.0 * cos_w0,
                1.0 - alpha * a,
                1.0 + alpha / a,
                -2.0 * cos_w0,
                1.0 - alpha / a,
            ),
            5 => (
                // Notch
                1.0,
                -2.0 * cos_w0,
                1.0,
                1.0 + alpha,
                -2.0 * cos_w0,
                1.0 - alpha,
            ),
            6 => (
                // Allpass
                1.0 - alpha,
                -2.0 * cos_w0,
                1.0 + alpha,
                1.0 + alpha,
                -2.0 * cos_w0,
                1.0 - alpha,
            ),
            _ => (
                // Lowshelf
                a * ((a + 1.0) - (a - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha),
                2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0),
                a * ((a + 1.0) - (a - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha),
                (a + 1.0) + (a - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha,
                -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0),
                (a + 1.0) + (a - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha,
            ),
        };

        // Normalize by a0 once, in f64, then drop to f32 for the sample loop.
        let b0 = (b0 / a0) as f32;
        let b1 = (b1 / a0) as f32;
        let b2 = (b2 / a0) as f32;
        let a1 = (a1 / a0) as f32;
        let a2 = (a2 / a0) as f32;

        let (mut x1, mut x2, mut y1, mut y2) = (state[0], state[1], state[2], state[3]);

        for i in 0..BUFFER_LEN {
            let x0 = src[i];
            let y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
            out[i] = y0;

            x2 = x1;
            x1 = x0;
            y2 = y1;
            y1 = y0;
        }

        (state[0], state[1], state[2], state[3]) = (x1, x2, y1, y2);
    }

    fn has_widget(&self) -> bool {
        true
    }

    /// A freq/gain XY pad in place of two plain slider rows — dragging the
    /// dot is more intuitive than dragging Freq and Gain separately.
    /// visual only for now, doesn't yet accept mouse input;
    /// wiring drag events to it is the natural next step once this shape
    /// proves out.
    fn draw_widget(
        &self,
        node: &Node,
        _i: usize,
        _s: &GraphState,
        buf: &mut DrawBuf,
        rect: (f32, f32, f32, f32),
    ) -> bool {
        let (x, y, w, h) = rect;
        let pad = (x + 4.0, y + 2.0, w - 8.0, h - 6.0);

        buf.fill_style([20, 20, 24]);
        buf.fill_rect(pad.0, pad.1, pad.2, pad.3);

        // Freq/Gain sliders are already 0..1 normalized — reuse that
        // directly as the pad's x/y fraction instead of re-deriving it.
        let freq_n = node.params[1].map(|p| p.value()).unwrap_or(0.5) as f32;
        let gain_n = node.params[2].map(|p| p.value()).unwrap_or(0.5) as f32;

        let px = pad.0 + freq_n * pad.2;
        let py = pad.1 + (1.0 - gain_n) * pad.3;

        buf.stroke_style([90, 95, 105]);
        buf.line_width(1.0);
        buf.stroke_line(pad.0, py, pad.0 + pad.2, py);
        buf.stroke_line(px, pad.1, px, pad.1 + pad.3);

        buf.fill_style([255, 200, 80]);
        buf.fill_circle(px, py, 4.0);

        true
    }
}
