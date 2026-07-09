use crate::api::nodes::pack_f32_pair;
use crate::draw::{cam_s, camera};
use crate::geom::{Interactive, dist2, point_in_rect};
use crate::{console_print, graph::*};
use crate::{ffi, render};

#[repr(u8)]
#[derive(Copy, Clone)]
pub enum HitType {
    Empty = 0,
    Node = 1,
    Link = 2,
    Btn = 3,
    Knob = 4,
}

impl HitType {
    fn from_u8(v: u8) -> Self {
        match v {
            1 => Self::Node,
            2 => Self::Link,
            3 => Self::Btn,
            4 => Self::Knob,
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
    fn btn(id: u16) -> Self {
        Self {
            kind: HitType::Btn,
            id,
            _sub_id: -1,
        }
    }
    fn knob(id: u16) -> Self {
        Self {
            kind: HitType::Knob,
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
pub extern "C" fn on_mouse_down(sx: f32, sy: f32, button: i8, ctrl_key: bool) -> u32 {
    let s = state();
    let c = camera();

    let (x, y) = c.to_world(sx, sy);

    for (i, b) in s.buttons.iter().enumerate() {
        if b.contains(sx, sy) {
            ffi::click_btn(i);
            return HitResult::btn(i as u16).into_u32();
        }
    }

    for (i, k) in s.knobs.iter().enumerate() {
        if k.contains(sx, sy) {
            s.dragging_knob = Some(i);
            s.drag_knob_start_y = sy;
            s.drag_knob_start_value = k.param.value() as f32;
            ffi::capture_mouse();

            return HitResult::knob(i as u16).into_u32();
        }
    }

    for i in 0..s.nodes.len() {
        let n = &s.nodes[i];
        for o in 0..n.kind.output_count() {
            let (ox, oy) = output_pos(n, o);

            if dist2(x, y, ox, oy) <= SOCKET_HIT_R2 {
                s.pending_link_from = Some((i, o));
                return HitResult::node(i as u16, -1).into_u32();
            }
        }
    }

    for i in (0..s.nodes.len()).rev() {
        let n = s.nodes[i];

        if let Some(p) = param_hit(&n, x, y) {
            let param = n.params[p].as_ref().unwrap();

            if ctrl_key {
                let r = n.param_value_rect(p);
                let (x, y) = c.to_screen(r.0, r.1);
                let w = cam_s(r.2, true);
                let h = cam_s(r.3, true);

                param.open_param_widget(i, p, x, y, w, h, c.zoom);
                return HitResult::node(i as u16, p as i8).into_u32();
            }

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

        if n.contains(x, y) {
            return HitResult::node(i as u16, -1).into_u32();
        }
    }

    if let Some(i) = find_hovered_link(s, x, y) {
        s.links.remove(i);
        s.hovered_link = None;
        s.version += 1;
        console_print!("removed link ", i);
        return HitResult::link(i as u16).into_u32();
    }

    if button == 0 {
        s.is_panning = true;
        s.last_pan = (sx, sy);
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
pub extern "C" fn get_cursor_kind(sx: f32, sy: f32) -> CursorKind {
    let s = state();
    let c = camera();

    let (x, y) = c.to_world(sx, sy);

    if s.dragging_node.is_some() || s.dragging_param.is_some() || s.dragging_knob.is_some() {
        return CursorKind::Grabbing;
    }

    for n in s.nodes.iter() {
        if header_hit(n, x, y) || param_hit(n, x, y).is_some() {
            return CursorKind::Grab;
        }
    }

    for b in s.buttons.iter() {
        if b.contains(sx, sy) {
            return CursorKind::Pointer;
        }
    }

    for b in s.knobs.iter() {
        if b.contains(sx, sy) {
            return CursorKind::Grab;
        }
    }

    if find_hovered_link(s, x, y).is_some() {
        return CursorKind::Pointer;
    }

    CursorKind::Default
}

#[unsafe(no_mangle)]
pub extern "C" fn on_mouse_move(sx: f32, sy: f32, alt_key: bool) {
    let s = state();
    let c = camera();

    if s.is_panning {
        let (lx, ly) = s.last_pan;
        c.pan_by_drag(sx - lx, sy - ly);
        s.last_pan = (sx, sy);

        render();
        return;
    }

    if let Some(idx) = s.dragging_knob
        && let Some(knob) = s.knobs.get_mut(idx)
    {
        let delta = s.drag_knob_start_y - sy;
        knob.drag_to(s.drag_knob_start_value, delta);
        render();

        ffi::drag_knob(idx, knob.param.denorm());

        return;
    }

    let (x, y) = c.to_world(sx, sy);
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

    let mouse_over_any_node = s.nodes.iter().any(|n| n.contains(x, y));

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
pub extern "C" fn on_dbl_click(x: f32, y: f32, button: i8) {
    let s = state();

    let raw_hit = on_mouse_down(x, y, -1, false);
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
            return;
        }
    }

    if let HitType::Knob = hit.kind
        && let Some(knob) = s.knobs.get_mut(hit.id as usize)
    {
        knob.reset_to_default();
        s.dragging_knob = None;
        ffi::release_mouse();

        s.version += 1;
        render();
        return;
    }

    if let HitType::Empty = hit.kind
        && button == 0
    {
        ffi::open_node_picker(x, y);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn on_mouse_up(sx: f32, sy: f32) {
    let s = state();
    let c = camera();

    let (x, y) = c.to_world(sx, sy);

    s.is_panning = false;

    if let Some((from, from_socket)) = s.pending_link_from {
        'search: for j in 0..s.nodes.len() {
            let n = &s.nodes[j];
            for to_socket in 0..n.kind.input_count() {
                let (ix, iy) = input_pos(n, to_socket);
                if dist2(x, y, ix, iy) <= SOCKET_HIT_R2 {
                    if is_valid_target(s, from, j) {
                        s.links.retain(|l| !(l.to == j && l.to_socket == to_socket));

                        if s.links
                            .push(Link {
                                from,
                                from_socket,
                                to: j,
                                to_socket,
                            })
                            .is_ok()
                        {
                            s.version += 1;
                            console_print!("linked node ", from, " -> ", j);
                        } else {
                            console_print!("link capacity reached");
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
    if s.dragging_knob.is_some() {
        s.dragging_knob = None;
        ffi::release_mouse();
    }
    render();
}

#[unsafe(no_mangle)]
pub extern "C" fn on_wheel(sx: f32, sy: f32, dx: f32, dy: f32, ctrl_key: bool) {
    let c = camera();

    if ctrl_key {
        c.zoom_at(sx, sy, dy);
    } else {
        c.pan(dx, dy);
    }

    render();
}

#[unsafe(no_mangle)]
pub extern "C" fn on_context_menu(x: f32, y: f32) {
    let raw_hit = on_mouse_down(x, y, -1, false);

    ffi::open_context_menu(x, y, raw_hit);
}

#[unsafe(no_mangle)]
pub extern "C" fn on_resize(w: f32, h: f32) {
    let s = state();
    s.viewport = (w, h);
}

#[unsafe(no_mangle)]
pub extern "C" fn set_camera(x: f32, y: f32, zoom: f32) {
    let c = camera();
    c.x = x;
    c.y = y;
    c.zoom = zoom;
}

#[unsafe(no_mangle)]
pub extern "C" fn get_world_pos(sx: f32, sy: f32) -> u64 {
    let c = camera();

    let (x, y) = c.to_world(sx, sy);
    pack_f32_pair(x, y)
}

static mut BTN_TEXT_BUFFER: [u8; 12] = [0; 12];

#[unsafe(no_mangle)]
pub extern "C" fn get_btn_text_buffer() -> *mut u8 {
    unsafe { BTN_TEXT_BUFFER.as_mut_ptr() }
}

#[unsafe(no_mangle)]
pub extern "C" fn write_btn_text(idx: usize, text_len: usize) {
    let s = state();
    let Some(btn) = s.buttons.get_mut(idx) else {
        return;
    };

    let byte_len = text_len.min(12);

    btn.text.clear();
    btn.text.push_raw(unsafe { &BTN_TEXT_BUFFER[0..byte_len] });

    unsafe { BTN_TEXT_BUFFER.fill(0) };
}
