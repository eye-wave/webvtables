use alloc::vec;
use alloc::vec::Vec;

use super::consts::*;
use super::{GraphState, NodeFlags, NodeLogic};

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

    let mut sources: [Option<(usize, usize)>; MAX_NODE_INPUTS] = [None; MAX_NODE_INPUTS];
    for l in s.links.iter() {
        if l.to == idx && l.to_socket < MAX_NODE_INPUTS && l.from_socket < MAX_NODE_OUTPUTS {
            sources[l.to_socket] = Some((l.from, l.from_socket));
        }
    }

    for src in sources.iter().flatten() {
        eval_node(s, src.0, done);
    }

    let input_count = s.nodes[idx].kind.input_count().min(MAX_NODE_INPUTS);
    let mut inputs: Vec<Buffer> = vec![ZERO_BUFFER; input_count];
    for (slot_idx, src) in sources.iter().enumerate().take(input_count) {
        if let Some((from, from_socket)) = src {
            inputs[slot_idx] = s.buffers.as_ref().unwrap()[*from][*from_socket];
        }
    }
    let input_refs: Vec<&Buffer> = inputs.iter().collect();

    let output_count = s.nodes[idx].kind.output_count().min(MAX_NODE_OUTPUTS);
    let mut outs = [ZERO_BUFFER; MAX_NODE_OUTPUTS];
    let node = &mut s.nodes[idx];
    node.kind
        .process(&input_refs, &node.params, &mut outs[..output_count]);

    let flags = node.flags;
    for buf in outs[..output_count].iter_mut() {
        if flags.contains(NodeFlags::REMOVE_DC) {
            remove_dc(buf);
        }
        if flags.contains(NodeFlags::NORMALIZE) {
            normalize(buf);
        }
        if flags.contains(NodeFlags::HARD_CLIP) {
            hard_clip(buf);
        }
    }

    s.buffers.as_mut().unwrap()[idx] = outs;
}

fn remove_dc(buf: &mut [f32]) {
    let sum = buf.iter().filter(|x| x.is_finite()).sum::<f32>();
    let dc = sum * (1.0 / buf.len() as f32);

    for sample in buf.iter_mut() {
        *sample -= dc;
    }
}

fn normalize(buf: &mut [f32]) {
    let peak = buf.iter().fold(0.0f32, |max, &x| max.max(x.abs()));
    if peak > 0.0 {
        let gain = 1.0 / peak;

        for x in buf.iter_mut() {
            *x *= gain;
        }
    }
}

fn hard_clip(buf: &mut [f32]) {
    for sample in buf.iter_mut() {
        *sample = sample.clamp(-1.0, 1.0)
    }
}
