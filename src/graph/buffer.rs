use alloc::vec;
use alloc::vec::Vec;

use super::{
    GraphState, KeyframeLane, MAX_FRAMES, MAX_NODE_INPUTS, MAX_NODES, NodeKind, NodeLogic,
};

pub const BUFFER_LEN: usize = 2048;
pub const BUFFER_LEN_F32: f32 = BUFFER_LEN as f32;
pub const BUFFER_LEN_F64: f64 = BUFFER_LEN as f64;

pub type Buffer = [f32; BUFFER_LEN];
pub const ZERO_BUFFER: Buffer = [0.0; BUFFER_LEN];

pub fn process_graph(s: &mut GraphState) {
    let mut done = [false; MAX_NODES];
    for i in 0..s.nodes.len() {
        eval_node(s, i, &mut done);
    }
}

fn eval_node(s: &mut GraphState, idx: usize, done: &mut [bool; MAX_NODES]) {
    if done[idx] {
        return;
    }
    done[idx] = true;

    let mut sources: [Option<usize>; MAX_NODE_INPUTS] = [None; MAX_NODE_INPUTS];
    for l in s.links.iter() {
        if l.to == idx && l.to_socket < MAX_NODE_INPUTS {
            sources[l.to_socket] = Some(l.from);
        }
    }

    for src in sources.iter().flatten() {
        eval_node(s, *src, done);
    }

    let input_count = s.nodes[idx].kind.input_count().min(MAX_NODE_INPUTS);
    let mut inputs: Vec<Buffer> = vec![ZERO_BUFFER; input_count];
    for (slot_idx, src) in sources.iter().enumerate().take(input_count) {
        if let Some(src) = src {
            inputs[slot_idx] = s.buffers.as_ref().unwrap()[*src];
        }
    }
    let input_refs: Vec<&Buffer> = inputs.iter().collect();

    let mut out = ZERO_BUFFER;
    let node = &mut s.nodes[idx];
    node.kind
        .process(&input_refs, &node.params, &mut node.state, &mut out);
    s.buffers.as_mut().unwrap()[idx] = out;
}

/// Bakes the full `MAX_FRAMES`-frame wavetable: for each morph position,
/// pins every keyframed param to its interpolated value at that frame,
/// runs the graph once, and stores the `Output` node's buffer.
///
/// This is O(frames * nodes) and touches every node's `process()`, so it
/// is NOT called on every mousemove during a param/keyframe drag — that
/// path already gets a cheap live preview from `process()` (single
/// frame, current_frame only, see `on_mouse_move`/`api/input.rs`).
/// Call `bake_wavetable()` on drag *release* (`on_mouse_up`) or after a
/// keyframe add/remove instead, so it runs once per gesture, not once
/// per pixel of drag.
/// ponytail: full O(frames*nodes) rebuild every call, no dirty-range
/// tracking. 256 frames * ~100 cheap DSP nodes is trivial on wasm; add
/// per-lane dirty-frame-range invalidation only if profiling says so.
pub fn bake_wavetable(s: &mut GraphState) {
    let Some(out_idx) = s.nodes.iter().position(|n| n.kind == NodeKind::Output) else {
        return;
    };

    // Snapshot live param values so the bake can pin them per-frame
    // without disturbing what's currently shown/edited on screen.
    let live_params: Vec<_> = s.nodes.iter().map(|n| n.params).collect();

    for frame in 0..MAX_FRAMES as u16 {
        let frame = frame as u8;

        for (i, node) in s.nodes.iter_mut().enumerate() {
            for (p, param) in node.params.iter_mut().enumerate() {
                let Some(param) = param else { continue };
                if let Some(v) = KeyframeLane::new(i, p).value_at_frame(frame) {
                    param.set_value_norm(v);
                }
            }
        }

        process_graph(s);

        s.wavetable.as_mut().unwrap()[frame as usize] = s.buffers.as_ref().unwrap()[out_idx];
    }

    // Restore whatever was live before the bake (current knob/param
    // values, unaffected by the frame sweep above).
    for (node, saved) in s.nodes.iter_mut().zip(live_params) {
        node.params = saved;
    }
    process_graph(s);
}
