use super::node::{Buffer, N, NodeFlags, zeroed};
use crate::graph::{MAX_PARAMS, NodeKind, Param, State};
use alloc::{boxed::Box, vec::Vec};

const MAX_DEPTH: u8 = 16;

static mut BUF: Buffer = [0.0; N];

pub fn buf() -> usize {
    (&raw const BUF) as usize
}

/// widget 0: the node's waveform. widget 1: its `fill_widget` points (spectrum, filter curve...).
pub fn fill(s: &State, node: usize, widget: u8) -> usize {
    let Some(kind) = s.kind(node) else {
        return 0;
    };
    let buf = unsafe { &mut BUF };
    match widget {
        0 => {
            eval(s, node, 0, 0, buf);
            N
        }
        1 if kind.as_node().has_widget() => {
            let ins = inputs(s, node, kind, 0);
            let refs: Vec<&Buffer> = ins.as_chunks::<N>().0.iter().collect();
            kind.as_node()
                .fill_widget(&refs, &params(s, node, kind), buf)
        }
        _ => 0,
    }
}

/// Writes output `sock` of `node` into `dst`. Sinks (no outputs) expose their inputs instead
/// (ponytail: lets widgets read them). Unlinked inputs are silent; depth-capped so cycles terminate.
/// All working buffers live on the heap and nothing 8KB-sized is returned by value: wasm's stack is small.
fn eval(s: &State, node: usize, sock: usize, depth: u8, dst: &mut Buffer) {
    dst.fill(0.0);
    let Some(kind) = s.kind(node).filter(|_| depth < MAX_DEPTH) else {
        return;
    };
    let no = kind.sockets().1;
    let ins = inputs(s, node, kind, depth);
    let mut outs = if no == 0 {
        ins
    } else {
        let mut outs = zeroed(no as usize);
        let refs: Vec<&Buffer> = ins.as_chunks::<N>().0.iter().collect();
        let ps = params(s, node, kind);
        kind.as_node()
            .process(&refs, &ps, outs.as_chunks_mut::<N>().0);
        outs
    };
    let f = s.flags(node);
    let outs = outs.as_chunks_mut::<N>().0;
    outs.iter_mut().for_each(|o| post(o, f));
    if let Some(o) = outs.get(sock) {
        dst.copy_from_slice(&o[..]);
    }
}

/// Evaluates whatever feeds each input socket of `node` (silence if unlinked).
fn inputs(s: &State, node: usize, kind: NodeKind, depth: u8) -> Box<[f32]> {
    let mut ins = zeroed(kind.sockets().0 as usize);
    for (i, b) in ins.as_chunks_mut::<N>().0.iter_mut().enumerate() {
        let src = s
            .links
            .iter()
            .find(|l| l.target as usize == node && l.target_socket as usize == i);
        if let Some(l) = src {
            eval(s, l.source as usize, l.source_socket as usize, depth + 1, b);
        }
    }
    ins
}

/// Node defaults overlaid with the 0..1 values JS keeps in the arena.
fn params(s: &State, node: usize, kind: NodeKind) -> [Option<Param>; MAX_PARAMS] {
    let mut ps = kind.as_node().default_params();
    for (p, v) in ps.iter_mut().zip(s.params(node)) {
        if let Some(p) = p {
            p.set_norm(*v as f64);
        }
    }
    ps
}

fn post(b: &mut Buffer, f: NodeFlags) {
    if f.contains(NodeFlags::REMOVE_DC) {
        let m = b.iter().sum::<f32>() / N as f32;
        b.iter_mut().for_each(|v| *v -= m);
    }
    if f.contains(NodeFlags::NORMALIZE) {
        let m = b.iter().fold(0.0f32, |a, v| a.max(v.abs()));
        if m > 1e-9 {
            b.iter_mut().for_each(|v| *v /= m);
        }
    }
    if f.contains(NodeFlags::HARD_CLIP) {
        b.iter_mut().for_each(|v| *v = v.clamp(-1.0, 1.0));
    }
}
