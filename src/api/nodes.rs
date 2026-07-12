use heapless::Vec as HVec;

use crate::console_print;
use crate::draw::camera;
use crate::graph::*;
use crate::process;
use crate::render;

#[unsafe(no_mangle)]
pub extern "C" fn node_count() -> usize {
    state().nodes.len()
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

#[unsafe(no_mangle)]
pub extern "C" fn remove_node(target_idx: usize) {
    let s = state();

    if target_idx >= s.nodes.len() {
        return;
    }

    // Drop links touching the removed node, reindex the rest.
    let old_links = core::mem::replace(&mut s.links, HVec::new());
    for mut l in old_links {
        if l.from == target_idx || l.to == target_idx {
            continue;
        }
        l.from -= (l.from > target_idx) as usize;
        l.to -= (l.to > target_idx) as usize;
        // Can't exceed original capacity since we only ever remove entries.
        let _ = s.links.push(l);
    }

    // Lanes and keyframes both carry the (node_id, param_id) they belong to
    // directly, so removing a node is the same "shift ids past target_idx
    // down by one" pass as for links — no index remapping table needed.
    let old_lanes = core::mem::replace(&mut s.lanes, HVec::new());
    for mut lane in old_lanes {
        if lane.node_id == target_idx as u16 {
            continue;
        }
        if lane.node_id > target_idx as u16 {
            lane.node_id -= 1;
        }
        let _ = s.lanes.push(lane);
    }

    let old_keyframes = core::mem::take(&mut s.keyframes);
    for mut keyframe in old_keyframes {
        if keyframe.lane.node_id == target_idx as u16 {
            continue;
        }
        if keyframe.lane.node_id > target_idx as u16 {
            keyframe.lane.node_id -= 1;
        }
        s.keyframes.push(keyframe);
    }

    // shift the remaining nodes down
    for i in target_idx..(s.nodes.len() - 1) {
        s.nodes[i] = s.nodes[i + 1];
    }
    s.nodes.pop();

    s.dragging_node = None;
    s.dragging_param = None;
    s.dragging_keyframe = None;
    s.pending_link_from = None;

    render();
}

#[unsafe(no_mangle)]
pub extern "C" fn remove_all_nodes() {
    let s = state();

    s.nodes.clear();
    s.links.clear();

    s.dragging_node = None;
    s.dragging_param = None;
    s.pending_link_from = None;
    s.hovered_link = None;
    s.hovered_socket = None;

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

    if s.nodes.is_full() {
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

    if kind == NodeKind::Output && s.has_output_node() {
        console_print!("Error: Only one Output node is allowed.");
        return -1;
    }

    let new_idx = s.nodes.len();
    if s.nodes.push(Node::new(kind, x, y)).is_err() {
        console_print!("Error: Maximum node capacity reached.");
        return -1;
    }

    render();

    new_idx as isize
}

#[unsafe(no_mangle)]
pub extern "C" fn output_node_present() -> bool {
    state().has_output_node()
}

pub fn pack_f32_pair(a: f32, b: f32) -> u64 {
    ((a.to_bits() as u64) << 32) | (b.to_bits() as u64)
}

#[unsafe(no_mangle)]
pub extern "C" fn average_node_pos() {
    let s = state();
    let c = camera();

    let (sx, sy, n) = s
        .nodes
        .iter()
        .filter(|n| n.x != 0.0 && n.y != 0.0)
        .map(|n| (n.x, n.y))
        .fold((0.0, 0.0, 0), |(sx, sy, n), (x, y)| (sx + x, sy + y, n + 1));

    let inv_n = 1.0 / (n as f32);

    c.x = sx * inv_n;
    c.y = sy * inv_n - 260.0;
    c.zoom = 1.0;

    render();
}

#[unsafe(no_mangle)]
pub extern "C" fn auto_align_nodes() {
    let s = state();

    s.auto_layout();
    render();
}

#[unsafe(no_mangle)]
pub extern "C" fn set_node_value(node_id: usize, param_id: usize, val_denorm: f64) {
    let s = state();

    let Some(node) = s.nodes.get_mut(node_id) else {
        return;
    };

    let Some(param) = node.params.get_mut(param_id).and_then(|p| p.as_mut()) else {
        return;
    };

    param.set_value_denorm(val_denorm);
    process();
    render();
}

#[unsafe(no_mangle)]
pub extern "C" fn get_node_type_count() -> usize {
    NodeKind::count()
}

#[unsafe(no_mangle)]
pub extern "C" fn get_node_names() -> *const u32 {
    const STRIDE: usize = 2 + 2 * MAX_CATEGORIES;
    const BUF_SIZE: usize = NodeKind::count() * STRIDE;

    static mut MAIN_BUF: [u32; BUF_SIZE] = [0; BUF_SIZE];

    unsafe {
        for (slot, node) in MAIN_BUF.chunks_exact_mut(STRIDE).zip(NodeKind::iter()) {
            let title = node.title();
            slot[0] = title.as_ptr() as u32;
            slot[1] = title.len() as u32;

            let cat_slots = &mut slot[2..];
            cat_slots.fill(0);

            for (chunk, cat) in cat_slots
                .chunks_exact_mut(2)
                .zip(node.as_node().category().iter())
            {
                let cat_str = cat.as_str();
                chunk[0] = cat_str.as_ptr() as u32;
                chunk[1] = cat_str.len() as u32;
            }
        }

        MAIN_BUF.as_ptr()
    }
}
