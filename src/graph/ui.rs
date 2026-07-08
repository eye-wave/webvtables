use crate::{
    FixedStr,
    draw::{Draw, camera},
};

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

impl Draw for KeyframeLanes {
    fn draw(&self, _i: usize, s: &super::GraphState, ctx: &mut crate::draw::DrawBuf) {
        let view_h = s.viewport.1;
        let y = view_h * KEYFRAME_POS_PERCENT + 25.0;

        ctx.fill_style([40, 40, 40]);

        for i in 0..10 {
            let y = y + (i as f32 * 42.0);
            ctx.fill_rect(260.0, y, 2000.0, 40.0, false);
        }
    }
}
