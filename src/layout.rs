//! Minimal layout engine, ratatui-style: define a `Layout` as a `const`,
//! `.split(area)` it into child `Rect`s at draw time. Kills manual
//! `x = viewport.0 - w` math scattered across widgets. `Rect` implements
//! `Interactive` so hit-testing (`rect.contains(mx, my)`) works for free.

use crate::geom::Interactive;
use alloc::vec::Vec;

#[derive(Clone, Copy, Default, Debug)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Rect {
    pub const fn new(x: f32, y: f32, w: f32, h: f32) -> Self {
        Self { x, y, w, h }
    }
}

impl Interactive for Rect {
    fn rect(&self) -> (f32, f32, f32, f32) {
        (self.x, self.y, self.w, self.h)
    }
}

#[derive(Clone, Copy)]
pub enum Axis {
    Horizontal,
    Vertical,
}

#[derive(Clone, Copy)]
pub enum Constraint {
    Length(f32),
    Percent(f32),
    /// Splits leftover space by weight. Ignores `Align` (nothing left over).
    Fill(u16),
}

#[derive(Clone, Copy, Default)]
pub enum Align {
    #[default]
    Start,
    Center,
    End,
    Between,
    /// Equal gap before the first child, between every pair, and after the
    /// last (flexbox `space-evenly`). With zero-size children this is how
    /// you distribute N points evenly across a span, margins included.
    Evenly,
}

pub struct Layout<'a> {
    axis: Axis,
    constraints: &'a [Constraint],
    align: Align,
    gap: f32,
}

impl<'a> Layout<'a> {
    pub const fn align(mut self, align: Align) -> Self {
        self.align = align;
        self
    }

    pub const fn gap(mut self, gap: f32) -> Self {
        self.gap = gap;
        self
    }

    /// Splits `area` along `self.axis` into one `Rect` per constraint.
    /// Cross-axis is left untouched (each child spans the full width of a
    /// vbox, or the full height of an hbox) — that covers every widget in
    /// this codebase; add per-child cross alignment if that stops being true.
    pub fn split(&self, area: Rect) -> Vec<Rect> {
        let n = self.constraints.len();
        if n == 0 {
            return Vec::new();
        }

        let main = match self.axis {
            Axis::Horizontal => area.w,
            Axis::Vertical => area.h,
        };
        let gaps_total = self.gap * n.saturating_sub(1) as f32;

        let mut sizes = alloc::vec![0.0f32; n];
        let mut fixed_total = 0.0;
        let mut fill_weight_total: u32 = 0;

        for (i, c) in self.constraints.iter().enumerate() {
            match c {
                Constraint::Length(px) => {
                    sizes[i] = *px;
                    fixed_total += px;
                }
                Constraint::Percent(pct) => {
                    let s = main * pct / 100.0;
                    sizes[i] = s;
                    fixed_total += s;
                }
                Constraint::Fill(w) => fill_weight_total += *w as u32,
            }
        }

        let remaining = (main - fixed_total - gaps_total).max(0.0);

        let mut offset = 0.0;
        let mut extra_gap = 0.0;

        if fill_weight_total > 0 {
            for (i, c) in self.constraints.iter().enumerate() {
                if let Constraint::Fill(w) = c {
                    sizes[i] = remaining * *w as f32 / fill_weight_total as f32;
                }
            }
        } else {
            match self.align {
                Align::Start => {}
                Align::Center => offset = remaining / 2.0,
                Align::End => offset = remaining,
                Align::Between if n > 1 => extra_gap = remaining / (n - 1) as f32,
                Align::Between => offset = remaining / 2.0, // single child: same as Center
                Align::Evenly => {
                    let slot = remaining / (n + 1) as f32;
                    offset = slot;
                    extra_gap = slot;
                }
            }
        }

        let mut out = Vec::with_capacity(n);
        let mut cursor = offset;
        for size in sizes {
            out.push(match self.axis {
                Axis::Horizontal => Rect::new(area.x + cursor, area.y, size, area.h),
                Axis::Vertical => Rect::new(area.x, area.y + cursor, area.w, size),
            });
            cursor += size + self.gap + extra_gap;
        }
        out
    }
}

pub const fn hbox(constraints: &[Constraint]) -> Layout {
    Layout {
        axis: Axis::Horizontal,
        constraints,
        align: Align::Start,
        gap: 0.0,
    }
}

pub const fn vbox(constraints: &[Constraint]) -> Layout {
    Layout {
        axis: Axis::Vertical,
        constraints,
        align: Align::Start,
        gap: 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fill_splits_remaining_evenly() {
        let area = Rect::new(0.0, 0.0, 300.0, 100.0);
        let rects = hbox(&[Constraint::Length(50.0), Constraint::Fill(1), Constraint::Fill(2)]).split(area);
        assert_eq!(rects.len(), 3);
        assert_eq!(rects[0].w, 50.0);
        assert_eq!(rects[1].w, (250.0f32 / 3.0));
        assert_eq!(rects[2].w, (500.0f32 / 3.0));
        assert_eq!(rects[2].x, rects[1].x + rects[1].w);
    }

    #[test]
    fn center_and_between_alignment() {
        let area = Rect::new(0.0, 0.0, 100.0, 100.0);
        let centered = vbox(&[Constraint::Length(20.0)]).align(Align::Center).split(area);
        assert_eq!(centered[0].y, 40.0);

        let between = hbox(&[Constraint::Length(10.0), Constraint::Length(10.0), Constraint::Length(10.0)])
            .align(Align::Between)
            .split(area);
        assert_eq!(between[0].x, 0.0);
        assert_eq!(between[2].x, 90.0);
        // equal gaps either side of the middle child
        assert_eq!(between[1].x - between[0].w, area.w - between[1].w - between[2].w - between[1].x);
    }

    #[test]
    fn hit_test_via_interactive() {
        let r = Rect::new(10.0, 10.0, 20.0, 20.0);
        assert!(r.contains(15.0, 15.0));
        assert!(!r.contains(0.0, 0.0));
    }

    #[test]
    fn evenly_matches_idx_plus_one_over_count_plus_one() {
        // socket_y's old formula: y = area.y + main * (idx+1) / (count+1)
        let area = Rect::new(0.0, 0.0, 10.0, 200.0);
        let count = 3;
        let rows = vbox(&[Constraint::Length(0.0); 3]).align(Align::Evenly).split(area);
        for idx in 0..count {
            let expected = area.y + area.h * (idx as f32 + 1.0) / (count as f32 + 1.0);
            assert!((rows[idx].y - expected).abs() < 1e-4);
        }
    }
}
