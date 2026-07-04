use crate::geom::dist2;

use super::consts::*;
use super::{GraphState, Node};

#[derive(Clone, Copy, PartialEq)]
pub enum SocketKind {
    Input,
    Output,
}

pub fn find_hovered_socket(s: &GraphState, x: f32, y: f32) -> Option<(usize, SocketKind)> {
    for i in 0..s.node_count {
        let (ox, oy) = output_pos(&s.nodes[i]);
        if dist2(x, y, ox, oy) <= SOCKET_HIT_R2 {
            return Some((i, SocketKind::Output));
        }
        let (ix, iy) = input_pos(&s.nodes[i]);
        if dist2(x, y, ix, iy) <= SOCKET_HIT_R2 {
            return Some((i, SocketKind::Input));
        }
    }
    None
}

pub fn output_pos(n: &Node) -> (f32, f32) {
    (
        n.x + Node::W,
        n.y + Node::HEADER_H + (Node::H - Node::HEADER_H) / 2.0,
    )
}

pub fn input_pos(n: &Node) -> (f32, f32) {
    (n.x, n.y + Node::HEADER_H + (Node::H - Node::HEADER_H) / 2.0)
}
