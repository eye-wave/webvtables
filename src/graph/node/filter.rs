use crate::draw::DrawBuf;
use crate::graph::{
    BUFFER_LEN, Buffer, GraphState, Node, Param, ZERO_BUFFER, consts::*, node_colors,
};

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
            0,
            &[
                "Lowshelf", "Lowcut", "Highcut", "Lowcut", "Bell", "Notch", "Allpass",
            ],
        ));

        p[1] = Some(Param::new_log("Freq", 0.5, 20.0, 20_000.0).with_unit("hz"));
        p[2] = Some(Param::new_linear("Gain", 0.5, -30.0, 30.0).with_unit("dB"));
        p[3] = Some(Param::new_linear("Q", 0.5, 0.0, 10.0));

        p
    }

    // Lowcut/Highcut run a real one-pole IIR whose history lives in
    // `state[0]` (Node's new persistent per-node state slot) so it carries
    // across process() calls instead of clicking back to zero every frame.
    // ponytail: coefficient is derived directly from the normalized Freq
    // knob rather than a proper Hz/sample-rate mapping, and the remaining
    // shapes (Lowshelf/Bell/Notch/Allpass) still need wraparound-aware
    // biquad DSP - that's the "real work" the old comment here flagged and
    // is still future work. This exists to prove out node state, not to
    // finish the filter.
    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        state: &mut NodeState,
        out: &mut Buffer,
    ) {
        let shape = params[0].map(|p| p.denorm() as u8).unwrap_or(0);
        let src = inputs.first().copied().unwrap_or(&ZERO_BUFFER);

        match shape {
            1 | 2 => {
                let freq_n = params[1].map(|p| p.value()).unwrap_or(0.5) as f32;
                let a = freq_n.clamp(0.01, 0.99);
                let mut y1 = state[0];
                for i in 0..BUFFER_LEN {
                    y1 += a * (src[i] - y1);
                    out[i] = if shape == 2 { y1 } else { src[i] - y1 };
                }
                state[0] = y1;
            }
            _ => *out = *src,
        }
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
