//! Opcode layout
//!   1  FillStyle    u8 r, u8 g, u8 b
//!   2  StrokeStyle  u8 r, u8 g, u8 b
//!   3  LineWidth    f32 w
//!   4  FillRect     f32 x, y, w, h
//!   5  FillCircle   f32 x, y, r
//!   6  StrokeLine   f32 x1, y1, x2, y2
//!   7  FillText     f32 size, x, y, u16 len, [u8; len] utf8
//!   8  FillWave     f32 x, y, w, h, *const u8 ptr

use alloc::vec::Vec;

use crate::graph::{BUFFER_LEN, GraphState};

mod camera;

pub use camera::*;

pub type Color = [u8; 3];

#[repr(u8)]
enum Op {
    FillStyle = 1,
    StrokeStyle = 2,
    LineWidth = 3,
    FillRect = 4,
    FillCircle = 5,
    StrokeLine = 6,
    FillText = 7,
    FillWave = 8,
}

pub trait Draw {
    fn draw(&self, i: usize, s: &GraphState, ctx: &mut DrawBuf);
}

#[derive(Default)]
pub struct DrawBuf {
    buf: Vec<u8>,
}

impl DrawBuf {
    const fn new() -> Self {
        Self { buf: Vec::new() }
    }

    fn push_u8(&mut self, v: u8) {
        self.buf.push(v);
    }

    fn push_u16(&mut self, v: u16) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    fn push_u32(&mut self, v: u32) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    fn push_f32(&mut self, v: f32) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    pub fn begin_frame(&mut self) {
        self.buf.clear();
    }

    pub fn fill_style(&mut self, col: Color) {
        self.push_u8(Op::FillStyle as u8);
        self.push_u8(col[0]);
        self.push_u8(col[1]);
        self.push_u8(col[2]);
    }

    pub fn stroke_style(&mut self, col: Color) {
        self.push_u8(Op::StrokeStyle as u8);
        self.push_u8(col[0]);
        self.push_u8(col[1]);
        self.push_u8(col[2]);
    }

    pub fn line_width(&mut self, w: f32) {
        self.push_u8(Op::LineWidth as u8);
        self.push_f32(w);
    }

    pub fn fill_rect(&mut self, x: f32, y: f32, w: f32, h: f32, with_cam: bool) {
        self.push_u8(Op::FillRect as u8);

        self.push_f32(cam_x(x, with_cam));
        self.push_f32(cam_y(y, with_cam));
        self.push_f32(cam_s(w, with_cam));
        self.push_f32(cam_s(h, with_cam));
    }

    pub fn fill_circle(&mut self, x: f32, y: f32, r: f32, with_cam: bool) {
        self.push_u8(Op::FillCircle as u8);
        self.push_f32(cam_x(x, with_cam));
        self.push_f32(cam_y(y, with_cam));
        self.push_f32(cam_s(r, with_cam));
    }

    pub fn stroke_line(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, with_cam: bool) {
        self.push_u8(Op::StrokeLine as u8);
        self.push_f32(cam_x(x1, with_cam));
        self.push_f32(cam_y(y1, with_cam));
        self.push_f32(cam_x(x2, with_cam));
        self.push_f32(cam_y(y2, with_cam));
    }

    pub fn fill_text(&mut self, text: &str, size: f32, x: f32, y: f32, with_cam: bool) {
        let bytes = text.as_bytes();
        let len = bytes.len().min(u16::MAX as usize) as u16;
        self.push_u8(Op::FillText as u8);
        self.push_f32(cam_s(size, with_cam));
        self.push_f32(cam_x(x, with_cam));
        self.push_f32(cam_y(y, with_cam));
        self.push_u16(len);
        self.buf.extend_from_slice(&bytes[..len as usize]);
    }

    pub fn fill_wave(
        &mut self,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        buf: &[f32; BUFFER_LEN],
        with_cam: bool,
    ) {
        self.line_width(1.0);
        self.push_u8(Op::FillWave as u8);
        self.push_f32(cam_x(x, with_cam));
        self.push_f32(cam_y(y, with_cam));
        self.push_f32(cam_s(w, with_cam));
        self.push_f32(cam_s(h, with_cam));
        self.push_u32(buf.as_ptr() as u32);
    }

    pub fn as_ptr_len(&self) -> (*const u8, usize) {
        (self.buf.as_ptr(), self.buf.len())
    }
}

static mut DRAWBUF: DrawBuf = DrawBuf::new();
static mut EDITOR_CAM: Camera = Camera::new();

#[inline(always)]
pub fn drawbuf() -> &'static mut DrawBuf {
    unsafe { &mut DRAWBUF }
}

#[inline(always)]
pub fn camera() -> &'static mut Camera {
    unsafe { &mut EDITOR_CAM }
}

pub fn cam_x(x: f32, with_cam: bool) -> f32 {
    if with_cam {
        let c = camera();
        (x + c.x) * c.zoom
    } else {
        x
    }
}

pub fn cam_y(y: f32, with_cam: bool) -> f32 {
    if with_cam {
        let c = camera();
        (y + c.y) * c.zoom
    } else {
        y
    }
}

pub fn cam_s(s: f32, with_cam: bool) -> f32 {
    if with_cam {
        let c = camera();
        s * c.zoom
    } else {
        s
    }
}
