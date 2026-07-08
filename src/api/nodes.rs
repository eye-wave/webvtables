use heapless::Vec;

use crate::console_print;
use crate::graph::*;
use crate::render;

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

#[unsafe(no_mangle)]
pub extern "C" fn graph_version() -> u32 {
    state().version
}

/// Where an index lands after `target` is removed from a contiguous list:
/// gone if it *was* target, shifted down by one if it came after.
fn reindex_after_removal(idx: usize, target: usize) -> Option<usize> {
    match idx {
        i if i == target => None,
        i if i > target => Some(i - 1),
        i => Some(i),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn remove_node(target_idx: usize) {
    let s = state();

    if target_idx >= s.nodes.len() {
        return;
    }

    // Drop links touching the removed node, reindex the rest. `links` is now
    // a dense Vec (no Option holes), so we rebuild it rather than nulling slots.
    let old_links = core::mem::replace(&mut s.links, Vec::new());
    for mut l in old_links {
        if l.from == target_idx || l.to == target_idx {
            continue;
        }
        l.from -= (l.from > target_idx) as usize;
        l.to -= (l.to > target_idx) as usize;
        // Can't exceed original capacity since we only ever remove entries.
        let _ = s.links.push(l);
    }

    // shift the remaining nodes down to fill the gap, then drop the tail slot
    for i in target_idx..(s.nodes.len() - 1) {
        s.nodes[i] = s.nodes[i + 1];
    }
    s.nodes.pop();
    s.node_count -= 1;

    // reindex (or drop) any in-flight interaction pointing at shifted nodes
    s.dragging_node = s
        .dragging_node
        .and_then(|i| reindex_after_removal(i, target_idx));
    s.dragging_param = s
        .dragging_param
        .and_then(|(i, p)| reindex_after_removal(i, target_idx).map(|i| (i, p)));
    s.pending_link_from = s
        .pending_link_from
        .and_then(|(i, o)| reindex_after_removal(i, target_idx).map(|i| (i, o)));

    s.version += 1;
    render();
}

#[unsafe(no_mangle)]
pub extern "C" fn remove_all_nodes() {
    let s = state();

    s.nodes.clear();
    s.node_count = 0;
    s.links.clear();

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

    let new_idx = s.nodes.len();
    if s.nodes.push(Node::new(kind, x, y)).is_err() {
        console_print!("Error: Maximum node capacity reached.");
        return -1;
    }
    s.node_count += 1;

    s.version += 1;
    render();

    new_idx as isize
}

pub fn pack_f32_pair(a: f32, b: f32) -> u64 {
    ((a.to_bits() as u64) << 32) | (b.to_bits() as u64)
}

#[unsafe(no_mangle)]
pub extern "C" fn node_average_pos() -> u64 {
    let s = state();

    let (sx, sy, n) = s
        .nodes
        .iter()
        .filter(|n| n.x != 0.0 && n.y != 0.0)
        .map(|n| (n.x, n.y))
        .fold((0.0, 0.0, 0), |(sx, sy, n), (x, y)| (sx + x, sy + y, n + 1));

    pack_f32_pair(sx / n as f32, sy / n as f32)
}
