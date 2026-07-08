//! 2D geometry helpers

use crate::{draw::camera, graph::state};

pub fn dist2(ax: f32, ay: f32, bx: f32, by: f32) -> f32 {
    let dx = ax - bx;
    let dy = ay - by;
    dx * dx + dy * dy
}

pub fn point_in_rect(px: f32, py: f32, x: f32, y: f32, w: f32, h: f32) -> bool {
    px >= x && px <= x + w && py >= y && py <= y + h
}

pub fn point_segment_dist2(px: f32, py: f32, x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
    let (dx, dy) = (x2 - x1, y2 - y1);
    let len2 = dx * dx + dy * dy;
    let t = if len2 > 0.0 {
        (((px - x1) * dx + (py - y1) * dy) / len2).clamp(0.0, 1.0)
    } else {
        0.0
    };
    dist2(px, py, x1 + dx * t, y1 + dy * t)
}

/// b is (x1,y1,x2,y2)
pub fn is_out_of_bounds(x1: f32, y1: f32, x2: f32, y2: f32) -> bool {
    let c = camera();
    let s = state();
    let b = s.viewport_bounds;

    let (sx, sy) = c.to_screen(x1, y1);
    let (sx2, sy2) = c.to_screen(x2, y2);

    sx2 < b.0 || sx > b.2 || sy2 < b.1 || sy > b.3
}
