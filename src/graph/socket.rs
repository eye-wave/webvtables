use crate::geom::dist2;
use crate::graph::NodeLogic;

use super::consts::*;
use super::{GraphState, Node};

#[derive(Clone, Copy, PartialEq)]
pub enum SocketKind {
    Input,
    Output,
}

/// (node index, kind, socket index within that side)
pub type SocketRef = (usize, SocketKind, usize);

pub fn find_hovered_socket(s: &GraphState, x: f32, y: f32) -> Option<SocketRef> {
    for (i, node) in s.nodes.iter().enumerate() {
        let n = &node;
        for o in 0..n.kind.output_count() {
            let (ox, oy) = output_pos(n, o);
            if dist2(x, y, ox, oy) <= SOCKET_HIT_R2 {
                return Some((i, SocketKind::Output, o));
            }
        }
        for inp in 0..n.kind.input_count() {
            let (ix, iy) = input_pos(n, inp);
            if dist2(x, y, ix, iy) <= SOCKET_HIT_R2 {
                return Some((i, SocketKind::Input, inp));
            }
        }
    }
    None
}

fn evenly(idx: usize, count: usize, main: f32) -> f32 {
    main * (idx + 1) as f32 / (count + 1) as f32
}

pub fn input_pos(node: &Node, idx: usize) -> (f32, f32) {
    (
        node.x,
        node.y + evenly(idx, node.kind.input_count(), node.height()),
    )
}

pub fn output_pos(node: &Node, idx: usize) -> (f32, f32) {
    (
        node.x + Node::W,
        node.y + evenly(idx, node.kind.output_count(), node.height()),
    )
}
