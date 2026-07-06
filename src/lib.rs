#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]
#![allow(static_mut_refs)]

extern crate alloc;

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

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

mod draw;
mod ffi;
mod geom;
mod graph;
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

    // heap-allocated once here instead of a static array, to keep it out of the binary.
    s.buffers = Some(alloc::vec![ZERO_BUFFER; MAX_NODES].into_boxed_slice());

    s.nodes[0] = Node::new(NodeKind::BasicShapes, 40.0, 40.0);
    s.nodes[1] = Node::new(NodeKind::Output, 340.0, 40.0);

    s.nodes[0].params[0].as_mut().unwrap().set_value_norm(1.0);

    s.node_count = 2;

    s.links[0] = Some(Link::new(0, 0, 1, 0));

    s.version += 1;
    render();
}

#[repr(u8)]
pub enum MouseDownResult {
    /// Nothing under the cursor - the click landed on empty canvas.
    Empty = 0,
    /// The click started a drag, grabbed a link, or was otherwise consumed.
    Interactive = 1,
}

#[unsafe(no_mangle)]
pub extern "C" fn on_mouse_down(x: f32, y: f32) -> MouseDownResult {
    let s = state();

    for i in 0..s.node_count {
        let n = &s.nodes[i];
        for o in 0..n.kind.output_count() {
            let (ox, oy) = output_pos(n, o);
            if dist2(x, y, ox, oy) <= SOCKET_HIT_R2 {
                s.pending_link_from = Some((i, o));
                return MouseDownResult::Interactive;
            }
        }
    }

    for i in (0..s.node_count).rev() {
        let n = s.nodes[i];

        for (p, param) in n.params.iter().flatten().enumerate() {
            let (bx, by, bw, bh) = n.param_value_rect(p);
            if point_in_rect(x, y, bx, by, bw, bh) {
                s.dragging_param = Some((i, p));
                s.drag_param_start_y = y;
                s.drag_param_start_value = param.value();
                return MouseDownResult::Interactive;
            }
        }

        if point_in_rect(x, y, n.x, n.y, Node::W, Node::HEADER_H) {
            s.dragging_node = Some(i);
            s.drag_offset = (x - n.x, y - n.y);
            return MouseDownResult::Interactive;
        }

        if point_in_rect(x, y, n.x, n.y, Node::W, n.height()) {
            return MouseDownResult::Interactive;
        }
    }

    if let Some(i) = find_hovered_link(s, x, y) {
        s.links[i] = None;
        s.hovered_link = None;
        s.version += 1;
        console_print!("removed link ", i);
        return MouseDownResult::Interactive;
    }

    MouseDownResult::Empty
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
        if point_in_rect(x, y, n.x, n.y, Node::W, Node::HEADER_H) {
            return CursorKind::Grab;
        }
        for p in 0..n.params.iter().flatten().count() {
            let (bx, by, bw, bh) = n.param_value_rect(p);
            if point_in_rect(x, y, bx, by, bw, bh) {
                return CursorKind::Grab;
            }
        }
    }
    if find_hovered_link(s, x, y).is_some() {
        return CursorKind::Pointer;
    }

    CursorKind::Default
}

#[unsafe(no_mangle)]
pub extern "C" fn iter_all_nodes() {
    for node in NodeKind::iter() {
        let title = node.title();
        let categ = node.as_node().category().as_str();

        ffi::push_node_name(title.as_ptr(), title.len(), categ.as_ptr(), categ.len());
    }
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
        let delta = s.drag_param_start_y - y; // dragging up increases the value
        if let Some(param) = s.nodes[i].params[p].as_mut() {
            param.drag_from(s.drag_param_start_value, delta as f64, alt_key);
        }
    }

    let mut mouse_over_any_node = false;
    for i in 0..s.node_count {
        let n = s.nodes[i];

        if point_in_rect(x, y, n.x, n.y, Node::W, n.height()) {
            mouse_over_any_node = true;
            break;
        }
    }

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
pub extern "C" fn on_context_menu(x: f32, y: f32) {
    let s = state();

    for i in (0..s.node_count).rev() {
        let n = s.nodes[i];

        if !point_in_rect(x, y, n.x, n.y, Node::W, n.height()) {
            continue;
        }

        for p in 0..n.params.iter().flatten().count() {
            let (bx, by, bw, bh) = n.param_value_rect(p);

            if point_in_rect(x, y, bx, by, bw, bh) {
                if let Some(param) = s.nodes[i].params[p].as_mut() {
                    console_print!("Double clicked parameter ", p, " on node ", i);

                    param.reset_to_default();

                    s.version += 1;
                    render();
                }
                return;
            }
        }

        console_print!("Opening context menu for node ", i);
        ffi::open_context_menu(x, y, i as i32);
        return;
    }

    ffi::open_context_menu(x, y, -1);
    console_print!("Opening context menu on x:", x, "y:", y);
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

// Read-only accessors so Host can mirror this graph (node kinds, params, links).
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

// Packed as (present << 31) | (from << 24) | (from_socket << 16) | (to << 8)
// | to_socket - avoids needing multi-value returns across the FFI boundary.
// `slot` ranges over 0..max_links().
#[unsafe(no_mangle)]
pub extern "C" fn link_at(slot: usize) -> u32 {
    match state().links[slot] {
        Some(l) => {
            0x8000_0000
                | ((l.from as u32) << 24)
                | ((l.from_socket as u32) << 16)
                | ((l.to as u32) << 8)
                | (l.to_socket as u32)
        }
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
    process_graph(s);

    let ctx = drawbuf();
    ctx.begin_frame();

    for (i, slot) in s.links.iter().enumerate() {
        if let Some(link) = slot {
            link.draw(i, s, ctx);
        }
    }

    if let Some((from, from_socket)) = s.pending_link_from {
        ctx.stroke_style([210, 180, 60]);
        ctx.line_width(2.0);
        let (fx, fy) = output_pos(&s.nodes[from], from_socket);
        ctx.stroke_line(fx, fy, s.mouse.0, s.mouse.1);
    }

    for i in 0..s.node_count {
        s.nodes[i].draw(i, s, ctx);
    }

    let (ptr, len) = ctx.as_ptr_len();
    ffi::draw_flush(ptr, len);
}

#[unsafe(no_mangle)]
pub extern "C" fn remove_node(target_idx: usize) {
    let s = state();

    if target_idx >= s.node_count {
        return;
    }

    // clear out links
    for slot in s.links.iter_mut() {
        if let Some(l) = slot {
            if l.from == target_idx || l.to == target_idx {
                *slot = None;
            } else {
                if l.from > target_idx {
                    l.from -= 1;
                }
                if l.to > target_idx {
                    l.to -= 1;
                }
            }
        }
    }

    // shift the remaining nodes down to fill the gap
    for i in target_idx..(s.node_count - 1) {
        s.nodes[i] = s.nodes[i + 1];
    }

    s.node_count -= 1;

    // clear leftover state
    if s.dragging_node == Some(target_idx) {
        s.dragging_node = None;
    } else if let Some(idx) = s.dragging_node
        && idx > target_idx
    {
        s.dragging_node = Some(idx - 1);
    }

    if let Some((idx, _)) = s.dragging_param {
        if idx == target_idx {
            s.dragging_param = None;
        } else if idx > target_idx {
            s.dragging_param = s.dragging_param.map(|(_, p)| (idx - 1, p));
        }
    }

    if let Some((idx, _)) = s.pending_link_from {
        if idx == target_idx {
            s.pending_link_from = None;
        } else if idx > target_idx {
            s.pending_link_from = s.pending_link_from.map(|(_, o)| (idx - 1, o));
        }
    }

    s.version += 1;
    render();
}

#[unsafe(no_mangle)]
pub extern "C" fn remove_all_nodes() {
    let s = state();

    s.nodes = [EMPTY_NODE; MAX_NODES];
    s.node_count = 0;

    for slot in s.links.iter_mut() {
        *slot = None;
    }

    s.dragging_node = None;
    s.dragging_param = None;
    s.pending_link_from = None;
    s.hovered_link = None;
    s.hovered_socket = None;

    s.version = 0;
    render();
}

/// # Safety
///
/// This function is unsafe because it dereferences the raw pointer `name_ptr`.
/// The caller must ensure that `name_ptr` points to a valid, initialized block of
/// memory containing at least `name_len` bytes, and that the memory remains valid
/// and immutable for the duration of this call.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn add_node(x: f32, y: f32, name_ptr: *const u8, name_len: usize) -> isize {
    let s = state();

    if s.node_count >= MAX_NODES {
        console_print!("Error: Maximum node capacity reached.");
        return -1;
    }

    if name_ptr.is_null() {
        console_print!("Null ptr deref.");
        return -1;
    }

    let name_slice = unsafe { core::slice::from_raw_parts(name_ptr, name_len) };
    let name_str = match core::str::from_utf8(name_slice) {
        Ok(s) => s,
        Err(_) => {
            console_print!("Invalid UTF-8 in node name");
            return -1;
        }
    };

    let kind = match NodeKind::from_title(name_str) {
        Some(n) => n,
        None => {
            console_print!("Error: Unknown node title requested.");
            return -1;
        }
    };

    let new_idx = s.node_count;
    s.nodes[new_idx] = Node::new(kind, x, y);
    s.node_count += 1;

    s.version += 1;
    render();

    new_idx as isize
}

trait PackPtr {
    fn ptr_64(&self) -> u64;
    fn len_64(&self) -> u64;
    fn pack(&self) -> u64 {
        ((self.ptr_64()) << 32) | (self.len_64())
    }
}

#[repr(C)]
pub struct SerializationResult {
    ptr: *mut u8,
    len: usize,
}

impl PackPtr for SerializationResult {
    fn ptr_64(&self) -> u64 {
        self.ptr as u64
    }
    fn len_64(&self) -> u64 {
        self.len as u64
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn serialize_graph() -> u64 {
    let s = state();

    match s.serialize() {
        Ok(buf) => {
            let mut boxed_slice = buf.into_boxed_slice();
            let ptr = boxed_slice.as_mut_ptr();
            let len = boxed_slice.len();

            core::mem::forget(boxed_slice);
            SerializationResult { ptr, len }.pack()
        }
        Err(_) => {
            console_print!("Error: Failed to serialize graph state.");
            SerializationResult {
                ptr: core::ptr::null_mut(),
                len: 0,
            }
            .pack()
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn free_buffer(ptr: *mut u8, len: usize) {
    if !ptr.is_null() && len > 0 {
        unsafe {
            let _ = alloc::boxed::Box::from_raw(core::ptr::slice_from_raw_parts_mut(ptr, len));
        };
    }
}

/// # Safety
///
/// Allocates a chunk of heap memory of `len` bytes for JavaScript to write into.
/// The JavaScript side must pass this exact pointer back into `patch_graph`
/// to ensure the memory is properly freed and not leaked.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn allocate_patch_buffer(len: usize) -> *mut u8 {
    let mut buf = alloc::vec![0u8; len].into_boxed_slice();
    let ptr = buf.as_mut_ptr();

    core::mem::forget(buf);
    ptr
}

/// # Safety
///
/// This function is unsafe because it dereferences the raw pointer `buf_ptr`.
/// The caller must guarantee that `buf_ptr` points to `buf_len` contiguous bytes of
/// valid, initialized memory containing valid Postcard-serialized data.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn patch_graph(buf_ptr: *mut u8, buf_len: usize) -> i32 {
    if buf_ptr.is_null() || buf_len == 0 {
        return -1;
    }

    let bytes_slice = unsafe { core::slice::from_raw_parts_mut(buf_ptr, buf_len) };
    let _boxed_buffer = unsafe { alloc::boxed::Box::from_raw(bytes_slice) };

    let s = state();
    match postcard::from_bytes::<GraphSnapshot>(bytes_slice) {
        Ok(snapshot) => {
            s.patch(snapshot);
            0
        }
        Err(_) => {
            console_print!("Error: Failed to deserialize snapshot payload.");
            -1
        }
    }
}

fn pack(a: f32, b: f32) -> u64 {
    ((a.to_bits() as u64) << 32) | (b.to_bits() as u64)
}

#[unsafe(no_mangle)]
pub extern "C" fn node_average_pos() -> u64 {
    let s = state();

    let avg = s
        .nodes
        .iter()
        .filter(|n| n.x != 0.0 && n.y != 0.0)
        .map(|n| (n.x, n.y))
        .fold((0.0, 0.0, 0), |(sx, sy, n), (x, y)| (sx + x, sy + y, n + 1));

    let (sx, sy, n) = avg;
    let avg = (sx / n as f32, sy / n as f32);

    pack(avg.0, avg.1)
}

#[repr(C)]
pub struct BufferFrame {
    ptr: *const u8,
    len: usize,
}

impl PackPtr for BufferFrame {
    fn ptr_64(&self) -> u64 {
        self.ptr as u64
    }
    fn len_64(&self) -> u64 {
        self.len as u64
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn get_generated_frame() -> u64 {
    let s = state();

    for i in 0..s.node_count {
        if let NodeKind::Output = s.nodes[i].kind {
            if let Some(ref bufs) = s.buffers
                && i < bufs.len()
            {
                let buffer_slice = bufs[i].as_slice();

                let frame = BufferFrame {
                    ptr: buffer_slice.as_ptr() as *const u8,
                    len: core::mem::size_of_val(buffer_slice),
                };

                return frame.pack();
            }
            break;
        }
    }

    BufferFrame {
        ptr: core::ptr::null(),
        len: 0,
    }
    .pack()
}
