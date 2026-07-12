//! Opcode layout
//!   1  FillStyle           u8 r, u8 g, u8 b
//!   2  StrokeStyle         u8 r, u8 g, u8 b
//!   3  LineWidth           f32 w
//!   4  FillRect            f32 x, y, w, h
//!   5  FillCircle          f32 x, y, r
//!   6  StrokeLine          f32 x1, y1, x2, y2
//!   7  FillText            f32 size, x, y, u16 len, [u8; len] utf8
//!   8  FillWave            f32 x, y, w, h, *const u8 ptr
//!   9  StrokeLineRepeated  f32 x1, y1, x2, y2, u16 count, f32 gap, u8 direction
//!  10  StrokeArc           f32 x, y, r, start_angle, end_angle
//!  11  FillPoints          u16 count, [f32; count*2] xy (inline, copied into the drawbuf)
//!  12  StrokePoints        u16 count, [f32; count*2] xy (inline, copied into the drawbuf)
//!  13  FillPointsRef       u32 ptr, u16 count
//!  14  StrokePointsRef     u32 ptr, u16 count
//!

use alloc::vec::Vec;

use crate::ffi;
use crate::graph::{BUFFER_LEN, GraphState};

mod camera;
mod stack;

pub use camera::*;
pub use stack::*;

pub type Color = [u8; 3];

#[allow(unused)]
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
    StrokeLineRepeated = 9,
    StrokeArc = 10,
    FillPoints = 11,
    StrokePoints = 12,
    FillPointsRef = 13,
    StrokePointsRef = 14,
}

#[repr(u8)]
#[derive(Clone, Copy)]
pub enum Direction {
    Horizontal = 0,
    Vertical = 1,
}

pub trait Draw {
    fn draw(&self, i: usize, s: &GraphState, ctx: &mut DrawBuf);
}

#[derive(Default)]
pub struct DrawBuf {
    buf: Vec<u8>,
}

#[allow(unused)]
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

    fn push_rec<const N: usize>(&mut self, rec: Rec<N>) {
        self.buf.extend_from_slice(&rec.bytes);
    }

    pub fn begin_frame(&mut self) {
        self.buf.clear();
    }

    pub fn fill_style(&mut self, col: Color) {
        self.push_rec(
            *Rec::<4>::new(Op::FillStyle as u8)
                .u8(col[0])
                .u8(col[1])
                .u8(col[2]),
        );
    }

    pub fn stroke_style(&mut self, col: Color) {
        self.push_rec(
            *Rec::<4>::new(Op::StrokeStyle as u8)
                .u8(col[0])
                .u8(col[1])
                .u8(col[2]),
        );
    }

    pub fn line_width(&mut self, w: f32) {
        self.push_rec(*Rec::<5>::new(Op::LineWidth as u8).f32(w));
    }

    pub fn fill_rect(&mut self, x: f32, y: f32, w: f32, h: f32, with_cam: bool) {
        self.push_rec(
            *Rec::<17>::new(Op::FillRect as u8)
                .f32(cam_x(x, with_cam))
                .f32(cam_y(y, with_cam))
                .f32(cam_s(w, with_cam))
                .f32(cam_s(h, with_cam)),
        );
    }

    pub fn fill_circle(&mut self, x: f32, y: f32, r: f32, with_cam: bool) {
        self.push_rec(
            *Rec::<13>::new(Op::FillCircle as u8)
                .f32(cam_x(x, with_cam))
                .f32(cam_y(y, with_cam))
                .f32(cam_s(r, with_cam)),
        );
    }

    pub fn stroke_line(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, with_cam: bool) {
        self.push_rec(
            *Rec::<17>::new(Op::StrokeLine as u8)
                .f32(cam_x(x1, with_cam))
                .f32(cam_y(y1, with_cam))
                .f32(cam_x(x2, with_cam))
                .f32(cam_y(y2, with_cam)),
        );
    }

    pub fn fill_text(&mut self, text: &str, size: f32, x: f32, y: f32, with_cam: bool) {
        let bytes = text.as_bytes();
        let len = bytes.len().min(u16::MAX as usize) as u16;
        self.push_rec(
            *Rec::<15>::new(Op::FillText as u8)
                .f32(cam_s(size, with_cam))
                .f32(cam_x(x, with_cam))
                .f32(cam_y(y, with_cam))
                .u16(len),
        );
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
        self.push_rec(
            *Rec::<21>::new(Op::FillWave as u8)
                .f32(cam_x(x, with_cam))
                .f32(cam_y(y, with_cam))
                .f32(cam_s(w, with_cam))
                .f32(cam_s(h, with_cam))
                .u32(buf.as_ptr() as u32),
        );
    }

    #[allow(clippy::too_many_arguments)]
    pub fn stroke_line_repeated(
        &mut self,
        x1: f32,
        y1: f32,
        x2: f32,
        y2: f32,
        count: u16,
        gap: f32,
        direction: Direction,
        with_cam: bool,
    ) {
        self.push_rec(
            *Rec::<24>::new(Op::StrokeLineRepeated as u8)
                .f32(cam_x(x1, with_cam))
                .f32(cam_y(y1, with_cam))
                .f32(cam_x(x2, with_cam))
                .f32(cam_y(y2, with_cam))
                .u16(count)
                .f32(cam_s(gap, with_cam))
                .u8(direction as u8),
        );
    }

    pub fn stroke_arc(
        &mut self,
        x: f32,
        y: f32,
        r: f32,
        start_angle: f32,
        end_angle: f32,
        with_cam: bool,
    ) {
        self.push_rec(
            *Rec::<21>::new(Op::StrokeArc as u8)
                .f32(cam_x(x, with_cam))
                .f32(cam_y(y, with_cam))
                .f32(cam_s(r, with_cam))
                .f32(start_angle)
                .f32(end_angle),
        );
    }

    fn push_points(&mut self, op: Op, points: &[f32], with_cam: bool) {
        let count = (points.len() / 2).min(u16::MAX as usize);
        self.push_u8(op as u8);
        self.push_u16(count as u16);
        for p in points[..count * 2].chunks_exact(2) {
            self.push_f32(cam_x(p[0], with_cam));
            self.push_f32(cam_y(p[1], with_cam));
        }
    }

    pub fn fill_points(&mut self, points: &[f32], with_cam: bool) {
        self.push_points(Op::FillPoints, points, with_cam);
    }

    pub fn stroke_points(&mut self, points: &[f32], with_cam: bool) {
        self.push_points(Op::StrokePoints, points, with_cam);
    }

    /// pointer + count, `points` must stay alive until the drawbuf is
    /// consumed on the JS side. No camera transform is applied
    fn push_points_ref(&mut self, op: Op, points: &[f32]) {
        let count = (points.len() / 2).min(u16::MAX as usize) as u16;
        self.push_rec(
            *Rec::<7>::new(op as u8)
                .u32(points.as_ptr() as u32)
                .u16(count),
        );
    }

    pub fn fill_points_ref(&mut self, points: &[f32]) {
        self.push_points_ref(Op::FillPointsRef, points);
    }

    pub fn stroke_points_ref(&mut self, points: &[f32]) {
        self.push_points_ref(Op::StrokePointsRef, points);
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

#[inline]
pub fn cam_x(x: f32, with_cam: bool) -> f32 {
    if with_cam {
        let c = camera();
        c.tx(x)
    } else {
        x
    }
}

#[inline]
pub fn cam_y(y: f32, with_cam: bool) -> f32 {
    if with_cam {
        let c = camera();
        c.ty(y)
    } else {
        y
    }
}

#[inline]
pub fn cam_s(s: f32, with_cam: bool) -> f32 {
    if with_cam {
        let c = camera();
        c.ts(s)
    } else {
        s
    }
}

pub struct RenderStats {
    prev_timestamp: f64,
    pub delta: i32,
}

impl RenderStats {
    pub const fn new() -> Self {
        Self {
            prev_timestamp: 0.0,
            delta: 0,
        }
    }

    pub fn refresh(&mut self) {
        let time = ffi::perf_now();

        self.delta = (time - self.prev_timestamp) as i32;
        self.prev_timestamp = time;
    }
}

pub static mut RENDER_STATS: RenderStats = RenderStats::new();
