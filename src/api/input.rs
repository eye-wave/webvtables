use crate::geom::{dist2, point_in_rect};
use crate::render;
use crate::{console_print, graph::*};

#[repr(u8)]
#[derive(Copy, Clone)]
pub enum HitType {
    Empty = 0,
    Node = 1,
    Link = 2,
}

impl HitType {
    fn from_u8(v: u8) -> Self {
        match v {
            1 => Self::Node,
            2 => Self::Link,
            _ => Self::Empty,
        }
    }
}

pub struct HitResult {
    kind: HitType,
    id: u16,
    _sub_id: i8,
}

impl HitResult {
    fn node(id: u16, param_id: i8) -> Self {
        Self {
            kind: HitType::Node,
            id,
            _sub_id: param_id,
        }
    }
    fn link(id: u16) -> Self {
        Self {
            kind: HitType::Link,
            id,
            _sub_id: -1,
        }
    }
    fn empty() -> Self {
        Self {
            kind: HitType::Empty,
            id: 0,
            _sub_id: -1,
        }
    }

    pub fn into_u32(self) -> u32 {
        (self.kind as u32) | ((self.id as u32) << 8) | (((self._sub_id as u8) as u32) << 24)
    }

    pub fn from_u32(val: u32) -> Self {
        Self {
            kind: HitType::from_u8((val & 0xFF) as u8),
            id: ((val >> 8) & 0xFFFF) as u16,
            _sub_id: ((val >> 24) & 0xFF) as i8,
        }
    }
}

/// Node header-bar rect hit test. Shared by mouse-down and cursor-kind queries.
fn header_hit(n: &Node, x: f32, y: f32) -> bool {
    point_in_rect(x, y, n.x, n.y, Node::W, Node::HEADER_H)
}

/// Index of the param whose value box contains (x, y), if any. `p` here is a
/// raw index into `n.params`, matching the convention used by
/// `node_param_value` elsewhere - params are assumed packed with no gaps.
fn param_hit(n: &Node, x: f32, y: f32) -> Option<usize> {
    (0..n.params.iter().flatten().count()).find(|&p| {
        let (bx, by, bw, bh) = n.param_value_rect(p);
        point_in_rect(x, y, bx, by, bw, bh)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn on_mouse_down(x: f32, y: f32) -> u32 {
    let s = state();

    for i in 0..s.node_count {
        let n = &s.nodes[i];
        for o in 0..n.kind.output_count() {
            let (ox, oy) = output_pos(n, o);
            if dist2(x, y, ox, oy) <= SOCKET_HIT_R2 {
                s.pending_link_from = Some((i, o));
                return HitResult::node(i as u16, -1).into_u32();
            }
        }
    }

    for i in (0..s.node_count).rev() {
        let n = s.nodes[i];

        if let Some(p) = param_hit(&n, x, y) {
            let param = n.params[p].as_ref().unwrap();
            s.dragging_param = Some((i, p));
            s.drag_param_start_y = y;
            s.drag_param_start_value = param.value();
            return HitResult::node(i as u16, p as i8).into_u32();
        }

        if header_hit(&n, x, y) {
            s.dragging_node = Some(i);
            s.drag_offset = (x - n.x, y - n.y);
            return HitResult::node(i as u16, -1).into_u32();
        }

        if point_in_rect(x, y, n.x, n.y, Node::W, n.height()) {
            return HitResult::node(i as u16, -1).into_u32();
        }
    }

    if let Some(i) = find_hovered_link(s, x, y) {
        s.links[i] = None;
        s.hovered_link = None;
        s.version += 1;
        console_print!("removed link ", i);
        return HitResult::link(i as u16).into_u32();
    }

    HitResult::empty().into_u32()
}

#[repr(u8)]
pub enum CursorKind {
    Default,
    Grab,
    Grabbing,
    Pointer,
}

#[unsafe(no_mangle)]
pub extern "C" fn get_cursor_kind(x: f32, y: f32) -> CursorKind {
    let s = state();
    if s.dragging_node.is_some() || s.dragging_param.is_some() {
        return CursorKind::Grabbing;
    }
    for i in 0..s.node_count {
        let n = s.nodes[i];
        if header_hit(&n, x, y) || param_hit(&n, x, y).is_some() {
            return CursorKind::Grab;
        }
    }
    if find_hovered_link(s, x, y).is_some() {
        return CursorKind::Pointer;
    }

    CursorKind::Default
}

#[unsafe(no_mangle)]
pub extern "C" fn on_mouse_move(x: f32, y: f32, _btn: u8, alt_key: bool) {
    let s = state();
    s.mouse = (x, y);

    if let Some(i) = s.dragging_node {
        s.nodes[i].x = x - s.drag_offset.0;
        s.nodes[i].y = y - s.drag_offset.1;
    }

    if let Some((i, p)) = s.dragging_param {
        let delta = s.drag_param_start_y - y;
        if let Some(param) = s.nodes[i].params[p].as_mut() {
            param.drag_from(s.drag_param_start_value, delta as f64, alt_key);
        }
    }

    let mouse_over_any_node = (0..s.node_count).any(|i| {
        point_in_rect(
            x,
            y,
            s.nodes[i].x,
            s.nodes[i].y,
            Node::W,
            s.nodes[i].height(),
        )
    });

    s.hovered_link =
        if s.dragging_node.is_none() && s.pending_link_from.is_none() && !mouse_over_any_node {
            find_hovered_link(s, x, y)
        } else {
            None
        };

    s.hovered_socket = if s.dragging_node.is_none() {
        find_hovered_socket(s, x, y)
    } else {
        None
    };

    render();
}

#[unsafe(no_mangle)]
pub extern "C" fn on_dbl_click(x: f32, y: f32) -> u32 {
    let s = state();

    let raw_hit = on_mouse_down(x, y);
    let hit = HitResult::from_u32(raw_hit);

    if let HitType::Node = hit.kind
        && hit._sub_id > -1
    {
        let i = hit.id as usize;
        let p = hit._sub_id as usize;

        if let Some(param) = s.nodes[i].params[p].as_mut() {
            console_print!("Double clicked parameter ", p, " on node ", i);

            param.reset_to_default();
            s.dragging_param = None;

            s.version += 1;
            render();

            return raw_hit;
        }
    }

    raw_hit
}

#[unsafe(no_mangle)]
pub extern "C" fn on_mouse_up(x: f32, y: f32) {
    let s = state();
    if let Some((from, from_socket)) = s.pending_link_from {
        'search: for j in 0..s.node_count {
            let n = &s.nodes[j];
            for to_socket in 0..n.kind.input_count() {
                let (ix, iy) = input_pos(n, to_socket);
                if dist2(x, y, ix, iy) <= SOCKET_HIT_R2 {
                    if is_valid_target(s, from, j) {
                        for slot in s.links.iter_mut() {
                            if matches!(slot, Some(l) if l.to == j && l.to_socket == to_socket) {
                                *slot = None;
                            }
                        }

                        for slot in s.links.iter_mut() {
                            if slot.is_none() {
                                *slot = Some(Link {
                                    from,
                                    from_socket,
                                    to: j,
                                    to_socket,
                                });
                                s.version += 1;
                                console_print!("linked node ", from, " -> ", j);
                                break;
                            }
                        }
                    } else {
                        console_print!("rejected link ", from, " -> ", j);
                    }
                    break 'search;
                }
            }
        }
    }
    s.pending_link_from = None;
    s.dragging_node = None;
    s.dragging_param = None;
    render();
}
