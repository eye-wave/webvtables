use crate::{
    draw::{Draw, DrawBuf},
    geom::point_segment_dist2,
    graph::{input_pos, output_pos},
};

use super::GraphState;
use super::consts::*;

#[derive(Clone, Copy)]
pub struct Link {
    pub from: usize,
    pub to: usize,
}

impl Draw for Link {
    fn draw(&self, i: usize, s: &GraphState, buf: &mut DrawBuf) {
        if s.hovered_link == Some(i) {
            buf.stroke_style(255, 240, 140);
            buf.line_width(3.0);
        } else {
            buf.stroke_style(210, 180, 60);
            buf.line_width(2.0);
        }
        let (fx, fy) = output_pos(&s.nodes[self.from]);
        let (tx, ty) = input_pos(&s.nodes[self.to]);
        buf.stroke_line(fx, fy, tx, ty);
    }
}

pub fn find_hovered_link(s: &GraphState, x: f32, y: f32) -> Option<usize> {
    for (i, slot) in s.links.iter().enumerate() {
        if let Some(l) = slot {
            let (fx, fy) = output_pos(&s.nodes[l.from]);
            let (tx, ty) = input_pos(&s.nodes[l.to]);
            if point_segment_dist2(x, y, fx, fy, tx, ty) <= LINK_HIT_DIST2 {
                return Some(i);
            }
        }
    }
    None
}
