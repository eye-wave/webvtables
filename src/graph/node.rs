use crate::draw::Draw;
use crate::draw::DrawBuf;
use crate::graph::FixedStr;
use crate::graph::GraphState;
use crate::graph::Param;
use crate::graph::SocketKind;
use crate::graph::input_pos;
use crate::graph::is_valid_target;
use crate::graph::output_pos;

use super::consts::*;

/// What a node actually does. This is what the audio step will dispatch on
/// (oscillator vs gain vs output), so title/params are derived from it
/// instead of being hand-duplicated at every call site.
#[derive(Clone, Copy, PartialEq)]
#[repr(u8)]
pub enum NodeKind {
    BasicShapes,
    Gain,
    Output,
}

impl NodeKind {
    pub fn title(self) -> &'static str {
        match self {
            NodeKind::BasicShapes => "Basic shapes",
            NodeKind::Gain => "Gain Control",
            NodeKind::Output => "Output",
        }
    }

    fn default_params(self) -> [Option<Param>; MAX_PARAMS] {
        let mut p = [None; MAX_PARAMS];
        match self {
            NodeKind::BasicShapes => {
                p[0] = Some(Param::new_enum(
                    "Shape",
                    0,
                    &["Sine", "Triangle", "Square", "Sawtooth"],
                ));
            }
            NodeKind::Gain => {
                p[0] = Some(Param::new_float("Volume", 0.8, -30.0, 30.0));
                p[1] = Some(Param::new_float("Pan", 0.0, -1.0, 1.0));
            }
            NodeKind::Output => {}
        }
        p
    }
}

#[derive(Clone, Copy)]
pub struct Node {
    pub x: f32,
    pub y: f32,
    pub kind: NodeKind,
    pub params: [Option<Param>; MAX_PARAMS],
}

impl Node {
    pub const HEADER_H: f32 = 20.0;
    pub const PARAM_H: f32 = 16.0;

    pub const W: f32 = 130.0;
    pub const H: f32 = Self::HEADER_H + (MAX_PARAMS as f32 * Self::PARAM_H) + 10.0;

    pub fn new(kind: NodeKind, x: f32, y: f32) -> Self {
        Node {
            x,
            y,
            kind,
            params: kind.default_params(),
        }
    }
}

// ponytail: filler for unused slots in the fixed-size node array; kind is
// never read since node_count gates all iteration.
pub const EMPTY_NODE: Node = Node {
    x: 0.0,
    y: 0.0,
    kind: NodeKind::Output,
    params: [None; MAX_PARAMS],
};

impl Draw for Node {
    fn draw(&self, i: usize, s: &GraphState, buf: &mut DrawBuf) {
        buf.fill_style(40, 42, 48);
        buf.fill_rect(self.x, self.y, Self::W, Self::H);

        buf.fill_style(70, 90, 200);
        buf.fill_rect(self.x, self.y, Self::W, Self::HEADER_H);

        buf.fill_style(230, 230, 230);
        buf.fill_text(self.kind.title(), self.x + 6.0, self.y + 14.0);

        let mut current_y = self.y + Self::HEADER_H + 12.0;
        for param in self.params.iter().flatten() {
            buf.fill_style(180, 180, 180);
            buf.fill_text(param.name(), self.x + 8.0, current_y);

            let mut vbuf: FixedStr<16> = FixedStr::new();
            param.format_value(&mut vbuf);

            buf.fill_style(140, 200, 140);
            buf.fill_text(vbuf.as_str(), self.x + Self::W - 24.0, current_y);

            current_y += Self::PARAM_H;
        }

        // 3. Draw Input Socket
        let (ix, iy) = input_pos(self);
        let is_hovered = s.hovered_socket == Some((i, SocketKind::Input));
        let is_valid_drop_zone = match s.pending_link_from {
            Some(from) => is_valid_target(s, from, i),
            None => false,
        };

        if s.pending_link_from.is_some() {
            if is_valid_drop_zone {
                if is_hovered {
                    buf.fill_style(255, 215, 0);
                    buf.fill_circle(ix, iy, SOCKET_R + 4.0);
                } else {
                    buf.fill_style(100, 220, 100);
                    buf.fill_circle(ix, iy, SOCKET_R + 2.0);
                }
            } else {
                buf.fill_style(50, 50, 50);
                buf.fill_circle(ix, iy, SOCKET_R);
            }
        } else {
            buf.fill_style(
                if is_hovered { 150 } else { 60 },
                if is_hovered { 255 } else { 180 },
                if is_hovered { 150 } else { 250 },
            );
            buf.fill_circle(ix, iy, if is_hovered { SOCKET_R + 2.0 } else { SOCKET_R });
        }

        // 4. Draw Output Socket
        let (ox, oy) = output_pos(self);
        let output_active = match s.pending_link_from {
            Some(from) => i == from,
            None => s.hovered_socket == Some((i, SocketKind::Output)),
        };
        buf.fill_style(
            250,
            if output_active { 220 } else { 180 },
            if output_active { 150 } else { 60 },
        );
        buf.fill_circle(
            ox,
            oy,
            if output_active {
                SOCKET_R + 2.0
            } else {
                SOCKET_R
            },
        );
    }
}
