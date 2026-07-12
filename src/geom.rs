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

/// Anything with a hit-testable rect (nodes, buttons, ...). Saves every
/// caller from destructuring `(x, y, w, h)` into `point_in_rect` by hand.
pub trait Interactive {
    fn rect(&self) -> (f32, f32, f32, f32);

    fn contains(&self, px: f32, py: f32) -> bool {
        let (x, y, w, h) = self.rect();
        point_in_rect(px, py, x, y, w, h)
    }
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
    let b = state().viewport_bounds;

    let (w_xmin, w_xmax) = (x1.min(x2), x1.max(x2));
    let (w_ymin, w_ymax) = (y1.min(y2), y1.max(y2));

    let (sx1, sy1) = c.to_screen(w_xmin, w_ymin);
    let (sx2, sy2) = c.to_screen(w_xmax, w_ymax);

    let s_xmin = sx1.min(sx2);
    let s_xmax = sx1.max(sx2);
    let s_ymin = sy1.min(sy2);
    let s_ymax = sy1.max(sy2);

    s_xmax < b.0 || s_xmin > b.2 || s_ymax < b.1 || s_ymin > b.3
}
