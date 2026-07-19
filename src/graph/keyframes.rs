use alloc::vec::Vec;

use crate::draw::{Direction, Draw};
use crate::geom::point_in_rect;
use crate::graph::{NodeKind, NodeLogic, debounce_toggle, state};
use crate::{FixedStr, ffi, render};

pub struct KeyframeRuler;

pub const KEYFRAME_RULER_HEIGHT: f32 = 28.0;
pub const KEYFRAME_POS_PERCENT: f32 = 0.6;
pub const RIGHT_MARGIN: f32 = 20.0;

impl Draw for KeyframeRuler {
    fn draw(&self, _i: usize, s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let view_h = s.viewport.1;
        let y = view_h * KEYFRAME_POS_PERCENT;

        ctx.fill_style([30; 3]);
        ctx.fill_rect(0.0, y, 2000.0, KEYFRAME_RULER_HEIGHT, false);

        let w = s.viewport.0 - KEYFRAME_LANE_WIDTH - RIGHT_MARGIN;
        for (n, h_mul) in [(16.0, 0.6), (32.0, 0.3), (256.0, 0.1)].iter() {
            let gap = w / n;

            const MARGIN: f32 = 6.0;
            const MARGIN_LEFT: f32 = KEYFRAME_W / 2.0;

            ctx.line_width(1.0);
            ctx.stroke_style([90; 3]);
            ctx.stroke_line_repeated(
                KEYFRAME_LANE_WIDTH + MARGIN_LEFT,
                y + MARGIN,
                KEYFRAME_LANE_WIDTH + MARGIN_LEFT,
                y + KEYFRAME_RULER_HEIGHT * h_mul + MARGIN,
                256,
                gap,
                Direction::Horizontal,
                false,
            );
        }

        ctx.line_width(1.0);
        ctx.stroke_style([80; 3]);
        ctx.stroke_line(KEYFRAME_LANE_WIDTH, y, s.viewport.0, y, false);

        let playhead_x = frame_to_screen_x(s, s.current_frame);

        ctx.line_width(2.0);
        ctx.stroke_style([100, 220, 160]);
        ctx.stroke_line(KEYFRAME_LANE_WIDTH, y, playhead_x, y, false);

        ctx.fill_style([100, 220, 160]);
        ctx.fill_circle(playhead_x, y, 4.0, false);
    }
}

pub struct KeyframeLanes;

const KEYFRAME_LANE_HEIGHT: f32 = 50.0;
const KEYFRAME_LANE_WIDTH: f32 = 180.0;

/// Width of the little scroll-position indicator drawn along the right
/// edge of the lanes area when there are more lanes than fit on screen.
const SCROLLBAR_W: f32 = 4.0;

/// Wheel-delta-to-pixels multiplier. Browser wheel `deltaY` per notch is
/// typically ~100, which would otherwise fly past a couple of lane rows
/// per tick; scaling it down keeps scrolling feeling controllable.
const SCROLL_SPEED: f32 = 0.35;

/// Y coordinate (in screen space) of the top of the lanes area, i.e.
/// just below the ruler.
pub fn lanes_top(s: &super::GraphState) -> f32 {
    s.viewport.1 * KEYFRAME_POS_PERCENT + KEYFRAME_RULER_HEIGHT
}

/// Screen-space top y of lane row `abs_row`, after applying the current
/// scroll offset. This is the single source of truth for where a lane
/// row (and everything drawn inside it: header, envelope line, and its
/// keyframe diamonds) sits on screen, so nothing can drift out of sync
/// with the rest.
pub fn lane_row_y(s: &super::GraphState, abs_row: usize) -> f32 {
    lanes_top(s) + abs_row as f32 * KEYFRAME_LANE_HEIGHT - s.lane_scroll
}

/// Whether a row whose top is at `row_y` is currently within the visible
/// lanes strip. A row that would start above the strip is hidden outright
/// (rather than clipped/partially drawn) so it never bleeds into the
/// ruler above; a row starting before the bottom of the viewport is kept
/// even if it runs past the bottom edge, since the canvas itself clips
/// that for free.
pub fn row_in_view(s: &super::GraphState, row_y: f32) -> bool {
    row_y >= lanes_top(s) - 0.5 && row_y < s.viewport.1
}

/// Furthest valid `lane_scroll` value: once the last lane row's bottom
/// reaches the bottom of the visible strip, scrolling further would just
/// show empty space.
pub fn max_lane_scroll(s: &super::GraphState) -> f32 {
    let total_h = s.lanes.len() as f32 * KEYFRAME_LANE_HEIGHT;
    let visible_h = (s.viewport.1 - lanes_top(s)).max(0.0);

    (total_h - visible_h).max(0.0)
}

/// Keeps `lane_scroll` in range after the lane count or viewport size
/// changes (e.g. a lane got removed, or the window was resized).
pub fn clamp_lane_scroll(s: &mut super::GraphState) {
    s.lane_scroll = s.lane_scroll.clamp(0.0, max_lane_scroll(s));
}

/// Scrolls the lane list by a wheel delta (browser `WheelEvent.deltaY`
/// units), smoothly and proportionally rather than snapping row by row.
pub fn scroll_lanes(s: &mut super::GraphState, dy: f32) {
    let max_scroll = max_lane_scroll(s);
    if max_scroll <= 0.0 {
        s.lane_scroll = 0.0;
        return;
    }

    s.lane_scroll = (s.lane_scroll + dy * SCROLL_SPEED).clamp(0.0, max_scroll);
}

impl Draw for KeyframeLanes {
    fn draw(&self, _i: usize, s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let view_h = s.viewport.1;
        let y = lanes_top(s);

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
            s.viewport.0 - RIGHT_MARGIN,
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

        // Scroll-position indicator: a thin track down the right edge
        // with a thumb sized/positioned to reflect how much of the lane
        // list is visible and where in it we're scrolled to. Only shown
        // once there are more lanes than fit on screen.
        let track_h = view_h - y;
        let total_h = s.lanes.len() as f32 * KEYFRAME_LANE_HEIGHT;
        let max_scroll = max_lane_scroll(s);

        if total_h > track_h && max_scroll > 0.0 {
            let track_x = s.viewport.0 - SCROLLBAR_W;

            ctx.fill_style([35; 3]);
            ctx.fill_rect(track_x, y, SCROLLBAR_W, track_h, false);

            let thumb_h = (track_h * track_h / total_h).max(16.0);
            let thumb_y = y + (track_h - thumb_h) * (s.lane_scroll / max_scroll);

            ctx.fill_style([110; 3]);
            ctx.fill_rect(track_x, thumb_y, SCROLLBAR_W, thumb_h, false);
        }
    }
}

#[derive(Clone, Copy, PartialEq)]
pub struct KeyframeLane {
    pub node_id: u16,
    pub param_id: u8,
}

#[derive(Clone, Copy)]
pub struct Keyframe {
    pub lane: KeyframeLane,
    pub frame: u8,
    pub value: f64,
}

impl PartialEq for Keyframe {
    fn eq(&self, other: &Self) -> bool {
        self.lane == other.lane && self.frame == other.frame
    }
}

const KEYFRAME_W: f32 = 12.0;
const KEYFRAME_H: f32 = KEYFRAME_LANE_HEIGHT * 0.8;

const KEYFRAME_HIT_PAD: f32 = 5.0;

impl Keyframe {
    pub fn rect(&self, s: &super::GraphState) -> Option<(f32, f32, f32, f32)> {
        let abs_row = s.lanes.iter().position(|l| *l == self.lane)?;

        let row_y = lane_row_y(s, abs_row);
        if !row_in_view(s, row_y) {
            return None;
        }

        let step_x = (s.viewport.0 - KEYFRAME_LANE_WIDTH) / 256.0;

        let x = self.frame as f32 * step_x + KEYFRAME_LANE_WIDTH;
        let y = row_y + (KEYFRAME_LANE_HEIGHT - KEYFRAME_H) / 2.0;

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

    fn keyframes(&self) -> impl Iterator<Item = &Keyframe> + Clone {
        let s = state();

        s.keyframes
            .iter()
            .filter(|k| k.lane.node_id == self.node_id && k.lane.param_id == self.param_id)
    }

    fn kind(&self) -> Option<NodeKind> {
        let s = state();

        s.nodes.get(self.node_id as usize).map(|n| n.kind)
    }
}

impl Draw for KeyframeLane {
    fn draw(&self, i: usize, s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let y = lane_row_y(s, i);

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

        let mut prev = None;
        let w = s.viewport.0 - KEYFRAME_LANE_WIDTH;

        let mut sorted: Vec<&Keyframe> = self.keyframes().collect();
        sorted.sort_by_key(|k| k.frame);

        ctx.stroke_style([90, 80, 60]);
        for k in sorted {
            let x = (k.frame as f32 / 256.0 * w) + KEYFRAME_LANE_WIDTH;
            let y = y + (1.0 - k.value) as f32 * KEYFRAME_LANE_HEIGHT;

            if let Some((px, py)) = prev {
                ctx.stroke_line(px, py, x, y, false);
            }

            prev = Some((x, y));
        }
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

fn diamond_fill_points(x: f32, y: f32, w: f32, h: f32, value: f32) -> ([f32; 12], usize) {
    let value = value.clamp(0.0, 1.0);
    let hw = w / 2.0;
    let hh = h / 2.0;

    #[rustfmt::skip]
    let verts = [
        (x + hw, y),      // top
        (x + w,  y + hh), // right
        (x + hw, y + h),  // bottom
        (x,      y + hh), // left
    ];

    // Fill from the bottom up: value 0 -> nothing, value 1 -> everything.
    let y_cut = y + h * (1.0 - value);

    let mut out = [0.0f32; 12];
    let mut n = 0usize;

    for i in 0..4 {
        let (cx, cy) = verts[i];
        let (px, py) = verts[(i + 3) % 4];

        let cur_in = cy >= y_cut;
        let prev_in = py >= y_cut;

        if cur_in != prev_in && (cy - py).abs() > f32::EPSILON {
            let t = (y_cut - py) / (cy - py);
            out[n * 2] = px + t * (cx - px);
            out[n * 2 + 1] = y_cut;
            n += 1;
        }

        if cur_in {
            out[n * 2] = cx;
            out[n * 2 + 1] = cy;
            n += 1;
        }
    }

    if n > 0 {
        out[n * 2] = out[0];
        out[n * 2 + 1] = out[1];
        n += 1;
    }

    (out, n)
}

impl Draw for Keyframe {
    fn draw(&self, _i: usize, s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let Some((x, y, w, h)) = self.rect(s) else {
            return;
        };

        // Always show the full diamond outline...
        let points = gen_diamond(x, y, w, h);
        ctx.line_width(1.5);
        ctx.stroke_style([230, 200, 50]);
        ctx.stroke_points(&points, false);

        // ...then fill only the bottom `value` fraction of it, so the
        // diamond doubles as a little gauge for the keyframe's value.
        let (fill_pts, fill_n) = diamond_fill_points(x, y, w, h, self.value as f32);
        if fill_n >= 3 {
            ctx.fill_style([230, 200, 50]);
            ctx.fill_points(&fill_pts[..fill_n * 2], false);
        }
    }
}

pub fn frame_from_screen_x(s: &super::GraphState, screen_x: f32) -> u8 {
    let step_x = (s.viewport.0 - KEYFRAME_LANE_WIDTH) / 256.0;

    ((ffi::roundf(screen_x - KEYFRAME_LANE_WIDTH) / step_x).clamp(0.0, 255.0)) as u8
}

pub fn frame_to_screen_x(s: &super::GraphState, frame: u8) -> f32 {
    let step_x = (s.viewport.0 - KEYFRAME_LANE_WIDTH) / 256.0;

    frame as f32 * step_x + KEYFRAME_LANE_WIDTH
}

const PLAYHEAD_HIT_R2: f32 = 8.0 * 8.0;

/// Takes raw screen coordinates (see `frame_from_screen_x`), not world
/// coordinates — the ruler doesn't move with camera pan/zoom.
pub fn playhead_hit_test(s: &super::GraphState, sx: f32, sy: f32) -> bool {
    let ruler_y = s.viewport.1 * KEYFRAME_POS_PERCENT;
    let px = frame_to_screen_x(s, s.current_frame);

    let dx = sx - px;
    let dy = sy - ruler_y;

    dx * dx + dy * dy <= PLAYHEAD_HIT_R2
}

/// Takes raw screen coordinates (see `frame_from_screen_x`), not world
/// coordinates — the lane diamonds don't move with camera pan/zoom.
pub fn keyframe_hit_test(s: &super::GraphState, sx: f32, sy: f32) -> Option<usize> {
    s.keyframes.iter().position(|k| {
        let Some((rx, ry, rw, rh)) = k.rect(s) else {
            return false;
        };

        point_in_rect(
            sx,
            sy,
            rx - KEYFRAME_HIT_PAD,
            ry - KEYFRAME_HIT_PAD,
            rw + KEYFRAME_HIT_PAD * 2.0,
            rh + KEYFRAME_HIT_PAD * 2.0,
        )
    })
}

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

/// Node keyframe-diamond button. Empty by default; clicking it when
/// empty drops a keyframe at the graph's current frame (creating the
/// lane first if this is the param's first keyframe). Clicking it when
/// full (a keyframe already sits at the current frame) removes just
/// that keyframe — and the lane too, if that was its last one.
pub fn on_keyframe_hit(node_id: usize, param_id: usize) {
    let s = state();

    let Some(node) = s.nodes.get(node_id) else {
        return;
    };

    let Some(Some(param)) = node.params.get(param_id) else {
        return;
    };

    let lane = KeyframeLane::new(node_id, param_id);

    if debounce_toggle(&mut s.last_keyframe_toggle, lane) {
        return;
    }

    let frame = s.current_frame;

    if let Some(existing) = s
        .keyframes
        .iter()
        .position(|k| k.lane == lane && k.frame == frame)
    {
        s.keyframes.remove(existing);

        // No keyframes left on this lane -> drop the lane too.
        if !s.keyframes.iter().any(|k| k.lane == lane) {
            s.lanes.retain(|l| *l != lane);
            clamp_lane_scroll(s);
        }
    } else {
        if !s.lanes.contains(&lane) && s.lanes.push(lane).is_err() {
            return;
        }

        s.keyframes.push(Keyframe {
            lane,
            frame,
            value: param.value(),
        });
    }

    render();
}
