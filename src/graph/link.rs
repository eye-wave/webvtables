use serde::{Deserialize, Serialize};

use crate::{
    draw::{Draw, DrawBuf},
    geom::point_segment_dist2,
    graph::{input_pos, output_pos},
};

use super::GraphState;
use super::consts::*;

#[derive(Clone, Copy, Serialize, Deserialize)]
pub struct Link {
    pub from: usize,
    pub from_socket: usize,
    pub to: usize,
    pub to_socket: usize,
}

impl Link {
    pub fn new(from: usize, from_socket: usize, to: usize, to_socket: usize) -> Self {
        Self {
            from,
            from_socket,
            to,
            to_socket,
        }
    }
}

impl Draw for Link {
    fn draw(&self, i: usize, s: &GraphState, ctx: &mut DrawBuf) {
        if s.hovered_link == Some(i) {
            ctx.stroke_style([255, 240, 140]);
            ctx.line_width(3.0);
        } else {
            ctx.stroke_style([210, 180, 60]);
            ctx.line_width(2.0);
        }
        let (fx, fy) = output_pos(&s.nodes[self.from], self.from_socket);
        let (tx, ty) = input_pos(&s.nodes[self.to], self.to_socket);
        ctx.stroke_line(fx, fy, tx, ty);
    }
}

pub fn find_hovered_link(s: &GraphState, x: f32, y: f32) -> Option<usize> {
    for (i, slot) in s.links.iter().enumerate() {
        if let Some(l) = slot {
            let (fx, fy) = output_pos(&s.nodes[l.from], l.from_socket);
            let (tx, ty) = input_pos(&s.nodes[l.to], l.to_socket);
            if point_segment_dist2(x, y, fx, fy, tx, ty) <= LINK_HIT_DIST2 {
                return Some(i);
            }
        }
    }
    None
}
