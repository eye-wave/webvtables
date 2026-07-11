use crate::draw::{Direction, Draw};
use crate::geom::point_in_rect;
use crate::graph::{NodeKind, NodeLogic, state};
use crate::{FixedStr, ffi, render};

pub struct KeyframeRuler;

pub const KEYFRAME_RULER_HEIGHT: f32 = 25.0;
pub const KEYFRAME_POS_PERCENT: f32 = 0.6;

impl Draw for KeyframeRuler {
    fn draw(&self, _i: usize, s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let view_h = s.viewport.1;
        let y = view_h * KEYFRAME_POS_PERCENT;

        ctx.fill_style([30; 3]);
        ctx.fill_rect(0.0, y, 2000.0, KEYFRAME_RULER_HEIGHT, false);

        let w = s.viewport.0 - KEYFRAME_LANE_WIDTH;
        for (n, h_mul) in [(16.0, 0.6), (32.0, 0.3), (256.0, 0.1)].iter() {
            let gap = w / n;

            ctx.line_width(1.0);
            ctx.stroke_style([50; 3]);
            ctx.stroke_line_repeated(
                KEYFRAME_LANE_WIDTH,
                y,
                KEYFRAME_LANE_WIDTH,
                y + KEYFRAME_RULER_HEIGHT * h_mul,
                256,
                gap,
                Direction::Horizontal,
                false,
            );
        }
    }
}

pub struct KeyframeLanes;

const KEYFRAME_LANE_HEIGHT: f32 = 50.0;
const KEYFRAME_LANE_WIDTH: f32 = 180.0;

impl Draw for KeyframeLanes {
    fn draw(&self, _i: usize, s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let view_h = s.viewport.1;
        let y = view_h * KEYFRAME_POS_PERCENT + 25.0;

        let gap = KEYFRAME_LANE_HEIGHT;

        ctx.fill_style([20; 3]);
        ctx.fill_rect(0.0, y, s.viewport.0, s.viewport.1 - y, false);

        ctx.fill_style([60; 3]);
        ctx.fill_rect(0.0, y, KEYFRAME_LANE_WIDTH, view_h, false);

        ctx.line_width(1.0);
        ctx.stroke_style([45; 3]);
        ctx.stroke_line_repeated(
            0.0,
            y + gap,
            s.viewport.0,
            y + gap,
            8,
            gap,
            Direction::Vertical,
            false,
        );

        let w = s.viewport.0 - KEYFRAME_LANE_WIDTH;
        let gap = w / 64.0;

        ctx.stroke_style([25; 3]);
        ctx.stroke_line_repeated(
            KEYFRAME_LANE_WIDTH,
            y,
            KEYFRAME_LANE_WIDTH,
            y + 2000.0,
            64,
            gap,
            Direction::Horizontal,
            false,
        );
    }
}

#[derive(Clone, Copy, PartialEq)]
pub struct KeyframeLane {
    pub node_id: u16,
    pub param_id: u8,
}

#[derive(Clone, Copy)]
pub struct Keyframe {
    /// Which (node, param) lane this belongs to — the lane itself, not a
    /// position in `s.lanes`, so it never needs remapping when lanes are
    /// added, removed, or reordered.
    pub lane: KeyframeLane,
    pub frame: u8,
    pub value: f64,
}

impl PartialEq for Keyframe {
    fn eq(&self, other: &Self) -> bool {
        self.lane == other.lane && self.frame == other.frame
    }
}

/// Diamond width used both for drawing and hit-testing, so they can never
/// drift apart.
const KEYFRAME_W: f32 = 8.0;
const KEYFRAME_H: f32 = 20.0;
/// Extra margin added only for hit-testing — the 8px-wide diamond alone is
/// too small a target to reliably grab.
const KEYFRAME_HIT_PAD: f32 = 5.0;

impl Keyframe {
    /// This keyframe's diamond bounding box in world space, or `None` if
    /// its lane isn't currently shown (shouldn't normally happen — a lane
    /// removal also removes its keyframes).
    pub fn rect(&self, s: &super::GraphState) -> Option<(f32, f32, f32, f32)> {
        let row = s.lanes.iter().position(|l| *l == self.lane)?;

        let base_y = KEYFRAME_RULER_HEIGHT + s.viewport.1 * KEYFRAME_POS_PERCENT;
        let step_x = (s.viewport.0 - KEYFRAME_LANE_WIDTH) / 256.0;

        let x = self.frame as f32 * step_x + KEYFRAME_LANE_WIDTH;
        let y =
            base_y + row as f32 * KEYFRAME_LANE_HEIGHT + (KEYFRAME_LANE_HEIGHT - KEYFRAME_H) / 2.0;

        Some((x, y, KEYFRAME_W, KEYFRAME_H))
    }
}

impl KeyframeLane {
    pub fn new(nid: usize, pid: usize) -> Self {
        Self {
            node_id: nid as u16,
            param_id: pid as u8,
        }
    }

    fn kind(&self) -> Option<NodeKind> {
        let s = state();

        s.nodes.get(self.node_id as usize).map(|n| n.kind)
    }
}

impl Draw for KeyframeLane {
    fn draw(&self, i: usize, s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let view_h = s.viewport.1;
        let y = KEYFRAME_RULER_HEIGHT
            + view_h * KEYFRAME_POS_PERCENT
            + (i as f32 * KEYFRAME_LANE_HEIGHT);

        let Some(kind) = self.kind() else { return };

        ctx.fill_style(kind.header_color());
        ctx.fill_rect(0.0, y, KEYFRAME_LANE_WIDTH, KEYFRAME_LANE_HEIGHT, false);

        let color = kind.header_color().map(|n| (n as f32 * 0.8 - 10.0) as u8);
        ctx.fill_style(color);
        ctx.fill_rect(0.0, y, KEYFRAME_LANE_WIDTH, 20.0, false);

        let Some(Some(param)) = kind
            .default_params()
            .into_iter()
            .nth(self.param_id as usize)
        else {
            return;
        };

        let mut vbuf = FixedStr::<32>::new();
        vbuf.push_str_with_len(kind.title(), 12);

        vbuf.push_str("#");
        vbuf.push_int(self.node_id as i32);
        vbuf.push_str(" ");
        vbuf.push_str_with_len(param.name(), 12);

        ctx.fill_style([200; 3]);
        ctx.fill_text(vbuf.as_str(), 14.0, 2.0, y + 15.0, false);
    }
}

pub fn gen_diamond(x: f32, y: f32, w: f32, h: f32) -> [f32; 10] {
    let hw = w / 2.0;
    let hh = h / 2.0;

    #[rustfmt::skip]
    let points = [
        x + hw, y,      // top
        x + w,  y + hh, // right
        x + hw, y + h,  // bottom
        x,      y + hh, // left
        x + hw, y,      // top
    ];

    points
}

impl Draw for Keyframe {
    fn draw(&self, _i: usize, s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let Some((x, y, w, h)) = self.rect(s) else {
            return;
        };

        let points = gen_diamond(x, y, w, h);

        ctx.fill_style([200, 200, 120]);
        ctx.fill_points(&points, false);
    }
}

/// World-space frame axis is one keyframe slot at a time; the keyframe
/// snaps to whichever frame the mouse is nearest.
pub fn frame_from_world_x(s: &super::GraphState, world_x: f32) -> u8 {
    let step_x = (s.viewport.0 - KEYFRAME_LANE_WIDTH) / 256.0;

    ((ffi::roundf(world_x - KEYFRAME_LANE_WIDTH) / step_x).clamp(0.0, 255.0)) as u8
}

/// Index into `s.keyframes` of the diamond under `(x, y)`, if any.
pub fn keyframe_hit_test(s: &super::GraphState, x: f32, y: f32) -> Option<usize> {
    s.keyframes.iter().position(|k| {
        let Some((rx, ry, rw, rh)) = k.rect(s) else {
            return false;
        };

        point_in_rect(
            x,
            y,
            rx - KEYFRAME_HIT_PAD,
            ry - KEYFRAME_HIT_PAD,
            rw + KEYFRAME_HIT_PAD * 2.0,
            rh + KEYFRAME_HIT_PAD * 2.0,
        )
    })
}

/// Moves keyframe `idx` to `new_frame`, unless another keyframe already
/// occupies that frame in the same lane (only one keyframe per frame per
/// lane, ever).
pub fn move_keyframe(idx: usize, new_frame: u8) {
    let s = state();

    let Some(&Keyframe { lane, .. }) = s.keyframes.get(idx) else {
        return;
    };

    let occupied = s
        .keyframes
        .iter()
        .enumerate()
        .any(|(i, k)| i != idx && k.lane == lane && k.frame == new_frame);

    if !occupied {
        s.keyframes[idx].frame = new_frame;
    }
}

pub fn on_keyframe_hit(node_id: usize, param_id: usize) {
    let s = state();

    let Some(node) = s.nodes.get(node_id) else {
        return;
    };

    let Some(Some(param)) = node.params.get(param_id) else {
        return;
    };

    let lane = KeyframeLane::new(node_id, param_id);
    if s.lanes.contains(&lane) {
        s.lanes.retain(|l| *l != lane);
        s.keyframes.retain(|k| k.lane != lane);
    } else if s.lanes.push(lane).is_ok() {
        s.keyframes.push(Keyframe {
            lane,
            frame: 0,
            value: param.value(),
        });
    }

    render();
}
