use crate::FixedStr;
use crate::draw::{Color, Direction, Draw, camera};

pub const HEADER_HEIGHT: f32 = 45.0;

pub struct CameraWidget;

impl Draw for CameraWidget {
    fn draw(&self, _i: usize, _s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let c = camera();

        let mut vbuf = FixedStr::<32>::new();

        ctx.fill_style([50, 50, 50]);
        ctx.fill_rect(0.0, HEADER_HEIGHT, 200.0, 20.0, false);

        ctx.fill_style([150, 150, 150]);

        vbuf.push_str("x: ");
        vbuf.push_fixed2(c.x as f64);
        vbuf.push_str(" y: ");
        vbuf.push_fixed2(c.y as f64);
        vbuf.push_str(" zoom: ");
        vbuf.push_fixed2(c.zoom as f64);

        ctx.fill_text(vbuf.as_str(), 13.0, 5.0, 12.0 + HEADER_HEIGHT, false);
    }
}

pub struct Header;

impl Draw for Header {
    fn draw(&self, _i: usize, _s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        ctx.fill_style([30, 30, 30]);
        ctx.fill_rect(0.0, 0.0, 2000.0, HEADER_HEIGHT, false);
    }
}

pub struct KeyframeRuler;

pub const KEYFRAME_POS_PERCENT: f32 = 0.6;

impl Draw for KeyframeRuler {
    fn draw(&self, _i: usize, s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let view_h = s.viewport.1;
        let y = view_h * KEYFRAME_POS_PERCENT;

        ctx.fill_style([30, 30, 30]);
        ctx.fill_rect(0.0, y, 2000.0, 25.0, false);
    }
}

pub struct KeyframeLanes;

const KEYFRAME_LANE_HEIGHT: f32 = 50.0;

impl Draw for KeyframeLanes {
    fn draw(&self, _i: usize, s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let view_h = s.viewport.1;
        let y = view_h * KEYFRAME_POS_PERCENT + 25.0;

        let gap = KEYFRAME_LANE_HEIGHT;

        ctx.fill_style([20, 20, 20]);
        ctx.fill_rect(0.0, y, s.viewport.0, s.viewport.1 - y, false);

        ctx.fill_style([180, 50, 60]);
        ctx.fill_rect(0.0, y, 200.0, s.viewport.1 - y, false);

        ctx.stroke_style([45, 45, 45]);
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
    }
}

#[derive(Clone)]
pub struct Button {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub color: Color,
    pub txt_color: Color,
    pub text: FixedStr<12>,
}

impl Draw for Button {
    fn draw(&self, _i: usize, _s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        ctx.fill_style(self.color);
        ctx.fill_rect(self.x, self.y, self.w, self.h, false);

        ctx.fill_style(self.txt_color);
        ctx.fill_text(self.text.as_str(), 13.0, self.x + 5.0, self.y + 14.0, false);
    }
}

pub struct Background;

impl Draw for Background {
    fn draw(&self, _i: usize, s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let c = camera();

        const GAP: f32 = 200.0;

        let x = -c.x + (c.x % GAP) - GAP;
        let y = -c.y + (c.y % GAP) - GAP;

        let repeat_x = (s.viewport.0 / c.zoom / GAP) as u16 + 3;
        let repeat_y = (s.viewport.1 / c.zoom / GAP) as u16 + 3;

        ctx.stroke_style([35, 35, 35]);

        ctx.stroke_line_repeated(
            x,
            y,
            x,
            y + (s.viewport.1 / c.zoom) + GAP * 2.0,
            repeat_x,
            GAP,
            Direction::Horizontal,
            true,
        );
        ctx.stroke_line_repeated(
            x,
            y,
            x + (s.viewport.0 / c.zoom) + GAP * 2.0,
            y,
            repeat_y,
            GAP,
            Direction::Vertical,
            true,
        );
    }
}
