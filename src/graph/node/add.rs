use crate::{
    draw::Direction,
    graph::{BUFFER_LEN, Buffer, Param, consts::MAX_PARAMS, node::helpers},
};

use super::{NodeLogic, NodeState};

pub struct AddNode;

impl NodeLogic for AddNode {
    fn title(&self) -> &'static str {
        "Add"
    }

    fn category(&self) -> &'static [super::NodeCategory] {
        &[super::NodeCategory::Combine]
    }

    fn input_count(&self) -> usize {
        2
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        crate::params![
            Param::new_bool("Normalize", false, None),
            Param::new_linear("Crossfade", -1.0, 1.0).with_default_denorm(0.0)
        ]
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut NodeState,
        out: &mut Buffer,
    ) {
        let normalize = helpers::param_bool(params, 0, false);
        let crossfade = helpers::param(params, 1, 0.0) as f32;

        let mix = (crossfade + 1.0) * 0.5;
        let gain0 = 1.0 - mix;
        let gain1 = mix;

        let in0 = inputs.first().copied();
        let in1 = inputs.get(1).copied();

        for i in 0..BUFFER_LEN {
            let s0 = in0.map(|b| b[i]).unwrap_or(0.0);
            let s1 = in1.map(|b| b[i]).unwrap_or(0.0);

            out[i] = (s0 * gain0) + (s1 * gain1);
        }

        if normalize {
            let mut max_peak: f32 = 0.0;

            for sample in out.iter_mut() {
                let abs_val = sample.abs();
                if abs_val > max_peak {
                    max_peak = abs_val;
                }
            }

            if max_peak > 0.0 {
                let gain = 1.0 / max_peak;
                for sample in out.iter_mut() {
                    *sample *= gain;
                }
            }
        }
    }

    fn has_widget(&self) -> bool {
        true
    }

    fn draw_widget(
        &self,
        node: &super::Node,
        _i: usize,
        _s: &crate::graph::GraphState,
        ctx: &mut crate::draw::DrawBuf,
        rect: (f32, f32, f32, f32),
    ) -> bool {
        const M: f32 = 10.0;
        const S: f32 = 18.0;

        let params = &node.params;
        let value = helpers::param(params, 1, 0.0) as f32;

        let (x, y, w, h) = rect;
        let ty = rect.1 + rect.3 / 2.0 + S / 3.0;

        let cx = rect.0 + rect.2 / 2.0;
        let cy = rect.1 + rect.3 / 2.0;

        ctx.fill_style([16, 16, 20]);
        ctx.fill_rect(x, y, w, h, true);

        ctx.fill_style([200; 3]);
        ctx.fill_text("A", S, x + M, ty, true);
        ctx.fill_text("B", S, x + w - (S / 2.0) - M, ty, true);

        let gap = w / 3.0;
        let lx = cx - gap;

        ctx.line_width(1.0);
        ctx.stroke_style([80; 3]);
        ctx.stroke_line(lx, cy, cx + gap, cy, true);

        #[rustfmt::skip]
        ctx.stroke_line_repeated(lx,cy - 4.0,lx,cy + 4.0,3,gap,Direction::Horizontal,true);

        let px = cx + value * gap;
        ctx.fill_style([100, 220, 160]);
        ctx.fill_circle(px, cy, 5.0, true);

        true
    }
}
