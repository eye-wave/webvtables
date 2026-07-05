//! Opcode layout
//!   1  FillStyle    u8 r, u8 g, u8 b
//!   2  StrokeStyle  u8 r, u8 g, u8 b
//!   3  LineWidth    f32 w
//!   4  FillRect     f32 x, y, w, h
//!   5  FillCircle   f32 x, y, r
//!   6  StrokeLine   f32 x1, y1, x2, y2
//!   7  FillText     f32 x, y, u16 len, [u8; len] utf8

use alloc::vec::Vec;

use crate::graph::GraphState;

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

    pub fn fill_rect(&mut self, x: f32, y: f32, w: f32, h: f32) {
        self.push_u8(Op::FillRect as u8);
        self.push_f32(x);
        self.push_f32(y);
        self.push_f32(w);
        self.push_f32(h);
    }

    pub fn fill_circle(&mut self, x: f32, y: f32, r: f32) {
        self.push_u8(Op::FillCircle as u8);
        self.push_f32(x);
        self.push_f32(y);
        self.push_f32(r);
    }

    pub fn stroke_line(&mut self, x1: f32, y1: f32, x2: f32, y2: f32) {
        self.push_u8(Op::StrokeLine as u8);
        self.push_f32(x1);
        self.push_f32(y1);
        self.push_f32(x2);
        self.push_f32(y2);
    }

    pub fn fill_text(&mut self, text: &str, x: f32, y: f32) {
        let bytes = text.as_bytes();
        let len = bytes.len().min(u16::MAX as usize) as u16;
        self.push_u8(Op::FillText as u8);
        self.push_f32(x);
        self.push_f32(y);
        self.push_u16(len);
        self.buf.extend_from_slice(&bytes[..len as usize]);
    }

    pub fn as_ptr_len(&self) -> (*const u8, usize) {
        (self.buf.as_ptr(), self.buf.len())
    }
}

static mut DRAWBUF: DrawBuf = DrawBuf::new();

pub fn drawbuf() -> &'static mut DrawBuf {
    unsafe { &mut DRAWBUF }
}
