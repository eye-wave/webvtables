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
    for i in 0..s.node_count {
        let n = &s.nodes[i];
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

/// Evenly spaces `count` sockets down the body of the node (below the
/// header), returning the y for socket `idx`.
fn socket_y(n: &Node, idx: usize, count: usize) -> f32 {
    let body_top = n.y + Node::HEADER_H;
    let body_h = Node::H - Node::HEADER_H;
    body_top + body_h * (idx as f32 + 1.0) / (count as f32 + 1.0)
}

pub fn output_pos(n: &Node, idx: usize) -> (f32, f32) {
    (n.x + Node::W, socket_y(n, idx, n.kind.output_count()))
}

pub fn input_pos(n: &Node, idx: usize) -> (f32, f32) {
    (n.x, socket_y(n, idx, n.kind.input_count()))
}
