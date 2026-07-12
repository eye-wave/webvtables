use crate::FixedStr;
use crate::draw::{Color, Direction, Draw, RENDER_STATS, camera};
use crate::ffi::{cosf, sinf};
use crate::geom::Interactive;
use crate::graph::{KEYFRAME_POS_PERCENT, Param};
use core::f32::consts::PI;

pub const HEADER_HEIGHT: f32 = 45.0;

pub struct CameraWidget;
pub struct RendererWidget;

impl Draw for CameraWidget {
    fn draw(&self, _i: usize, _s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let c = camera();

        let mut vbuf = FixedStr::<32>::new();

        ctx.fill_style([50; 3]);
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

impl Draw for RendererWidget {
    fn draw(&self, _i: usize, s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let mut vbuf = FixedStr::<32>::new();
        let w = 80.0;
        let x = s.viewport.0 - w;

        ctx.fill_style([50; 3]);
        ctx.fill_rect(x, HEADER_HEIGHT, w, 20.0, false);

        ctx.fill_style([150, 150, 150]);

        vbuf.push_int(unsafe { RENDER_STATS.delta });
        vbuf.push_str(" ms");

        ctx.fill_text(vbuf.as_str(), 13.0, x + 5.0, 12.0 + HEADER_HEIGHT, false);
    }
}

pub struct Header;

impl Draw for Header {
    fn draw(&self, _i: usize, _s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        ctx.fill_style([30, 30, 30]);
        ctx.fill_rect(0.0, 0.0, 2000.0, HEADER_HEIGHT, false);
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
    pub text: FixedStr<5>,
}

impl Interactive for Button {
    fn rect(&self) -> (f32, f32, f32, f32) {
        (self.x, self.y, self.w, self.h)
    }
}

impl Draw for Button {
    fn draw(&self, _i: usize, _s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        ctx.fill_style(self.color);
        ctx.fill_rect(self.x, self.y, self.w, self.h, false);

        ctx.fill_style(self.txt_color);
        ctx.fill_text(self.text.as_str(), 13.0, self.x + 5.0, self.y + 14.0, false);
    }
}

#[derive(Clone)]
pub struct Knob {
    pub x: f32,
    pub y: f32,
    pub r: f32,
    pub color: Color,
    pub param: Param,
}

impl Knob {
    const START_ANGLE: f32 = 0.75 * PI;
    const SWEEP: f32 = 1.5 * PI;

    const DRAG_RANGE_PX: f32 = 150.0;

    fn value_angle(&self) -> f32 {
        Self::START_ANGLE + Self::SWEEP * self.param.value().clamp(0.0, 1.0) as f32
    }

    pub fn drag_to(&mut self, start_value: f32, delta_px: f32) {
        self.param
            .set_value_norm((start_value + delta_px / Self::DRAG_RANGE_PX).clamp(0.0, 1.0) as f64);
    }

    pub fn reset_to_default(&mut self) {
        self.param.reset_to_default();
    }
}

impl Interactive for Knob {
    fn rect(&self) -> (f32, f32, f32, f32) {
        (self.x - self.r, self.y - self.r, self.r * 2.0, self.r * 2.0)
    }
}

impl Draw for Knob {
    fn draw(&self, _i: usize, _s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        ctx.line_width(3.0);

        ctx.stroke_style([60, 60, 66]);
        ctx.stroke_arc(
            self.x,
            self.y,
            self.r,
            Self::START_ANGLE,
            Self::START_ANGLE + Self::SWEEP,
            false,
        );

        ctx.stroke_style(self.color);
        ctx.stroke_arc(
            self.x,
            self.y,
            self.r,
            Self::START_ANGLE,
            self.value_angle(),
            false,
        );

        let angle = self.value_angle();
        ctx.stroke_style([230, 230, 230]);
        ctx.line_width(2.0);
        ctx.stroke_line(
            self.x,
            self.y,
            self.x + cosf(angle) * self.r * 0.8,
            self.y + sinf(angle) * self.r * 0.8,
            false,
        );

        let mut vbuf: FixedStr<16> = FixedStr::new();
        self.param.format_value(&mut vbuf);

        ctx.fill_text(vbuf.as_str(), 13.0, self.x - 20.0, self.y + 20.0, false);
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

        ctx.line_width((2.0 * c.zoom).min(1.0));
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

pub struct WavetableWidget;

impl WavetableWidget {
    pub const WIDTH: f32 = 310.0;
    pub const HEIGHT: f32 = 220.0;
}

impl Draw for WavetableWidget {
    fn draw(&self, _i: usize, s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let x = s.viewport.0 - Self::WIDTH;
        let y = s.viewport.1 * KEYFRAME_POS_PERCENT - Self::HEIGHT;

        ctx.fill_style([20; 3]);
        ctx.fill_rect(x, y, Self::WIDTH, Self::HEIGHT, false);

        // ctx.draw_wavetable(x, y, Self::WIDTH, Self::HEIGHT, false);
    }
}
