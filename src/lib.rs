#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]
#![allow(static_mut_refs)]

#[cfg(all(target_arch = "wasm32", not(test)))]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

#[cfg(all(not(target_arch = "wasm32"), not(test)))]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    loop {}
}

mod draw;
mod geom;
mod graph;
mod js;
mod log;
mod str;

use draw::drawbuf;
use geom::{dist2, point_in_rect};
use graph::*;

use crate::draw::Draw;

pub use str::*;

#[unsafe(no_mangle)]
pub extern "C" fn init() {
    let s = state();
    s.nodes[0] = Node::new(NodeKind::BasicShapes, 40.0, 40.0);
    s.nodes[1] = Node::new(NodeKind::Gain, 240.0, 130.0);
    s.nodes[2] = Node::new(NodeKind::Output, 440.0, 60.0);
    s.node_count = 3;
    s.links[0] = Some(Link { from: 0, to: 1 });
    s.links[1] = Some(Link { from: 1, to: 2 });
    s.version += 1;
    render();
}

#[unsafe(no_mangle)]
pub extern "C" fn on_mouse_down(x: f32, y: f32) {
    console_print!("mouse down x: ", x, ", y: ", y);
    let s = state();

    for i in 0..s.node_count {
        let (ox, oy) = output_pos(&s.nodes[i]);
        if dist2(x, y, ox, oy) <= SOCKET_HIT_R2 {
            s.pending_link_from = Some(i);
            return;
        }
    }
    for i in (0..s.node_count).rev() {
        let n = s.nodes[i];
        if point_in_rect(x, y, n.x, n.y, Node::W, Node::HEADER_H) {
            s.dragging_node = Some(i);
            s.drag_offset = (x - n.x, y - n.y);
            return;
        }
    }
    if let Some(i) = find_hovered_link(s, x, y) {
        s.links[i] = None;
        s.hovered_link = None;
        s.version += 1;
        console_print!("removed link ", i);
    }
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
    if s.dragging_node.is_some() {
        return CursorKind::Grabbing;
    }
    for i in 0..s.node_count {
        let n = s.nodes[i];
        if point_in_rect(x, y, n.x, n.y, Node::W, Node::HEADER_H) {
            return CursorKind::Grab;
        }
    }
    if find_hovered_link(s, x, y).is_some() {
        return CursorKind::Pointer;
    }

    CursorKind::Default
}

#[unsafe(no_mangle)]
pub extern "C" fn on_mouse_move(x: f32, y: f32) {
    let s = state();
    s.mouse = (x, y);

    if let Some(i) = s.dragging_node {
        s.nodes[i].x = x - s.drag_offset.0;
        s.nodes[i].y = y - s.drag_offset.1;
    }

    s.hovered_link = if s.dragging_node.is_none() && s.pending_link_from.is_none() {
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
pub extern "C" fn on_mouse_up(x: f32, y: f32) {
    let s = state();
    if let Some(from) = s.pending_link_from {
        for j in 0..s.node_count {
            let (ix, iy) = input_pos(&s.nodes[j]);
            if dist2(x, y, ix, iy) <= SOCKET_HIT_R2 {
                if is_valid_target(s, from, j) {
                    for slot in s.links.iter_mut() {
                        if matches!(slot, Some(l) if l.to == j) {
                            *slot = None;
                        }
                    }

                    for slot in s.links.iter_mut() {
                        if slot.is_none() {
                            *slot = Some(Link { from, to: j });
                            s.version += 1;
                            console_print!("linked node ", from, " -> ", j);
                            break;
                        }
                    }
                } else {
                    console_print!("rejected link ", from, " -> ", j);
                }
                break;
            }
        }
    }
    s.pending_link_from = None;
    s.dragging_node = None;
    render();
}

// Read-only accessors so JS can mirror this graph (node kinds, params, links).
#[unsafe(no_mangle)]
pub extern "C" fn node_count() -> usize {
    state().node_count
}

#[unsafe(no_mangle)]
pub extern "C" fn node_kind(i: usize) -> u8 {
    state().nodes[i].kind as u8
}

#[unsafe(no_mangle)]
pub extern "C" fn node_param_count(i: usize) -> usize {
    state().nodes[i].params.iter().flatten().count()
}

#[unsafe(no_mangle)]
pub extern "C" fn node_param_value(i: usize, p: usize) -> f64 {
    state().nodes[i].params[p].map(|p| p.value()).unwrap_or(0.0)
}

#[unsafe(no_mangle)]
pub extern "C" fn max_links() -> usize {
    MAX_LINKS
}

// Packed as (present << 31) | (from << 16) | to - avoids needing multi-value
// returns across the FFI boundary. `slot` ranges over 0..max_links().
#[unsafe(no_mangle)]
pub extern "C" fn link_at(slot: usize) -> u32 {
    match state().links[slot] {
        Some(l) => 0x8000_0000 | ((l.from as u32) << 16) | (l.to as u32),
        None => 0,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn graph_version() -> u32 {
    state().version
}

#[unsafe(no_mangle)]
pub extern "C" fn render() {
    let s = state();
    let buf = drawbuf();
    buf.begin_frame();

    for (i, slot) in s.links.iter().enumerate() {
        if let Some(link) = slot {
            link.draw(i, s, buf);
        }
    }

    if let Some(from) = s.pending_link_from {
        buf.stroke_style(210, 180, 60);
        buf.line_width(2.0);
        let (fx, fy) = output_pos(&s.nodes[from]);
        buf.stroke_line(fx, fy, s.mouse.0, s.mouse.1);
    }

    for i in 0..s.node_count {
        s.nodes[i].draw(i, s, buf);
    }

    let (ptr, len) = buf.as_ptr_len();
    js::draw_flush(ptr, len);
}
