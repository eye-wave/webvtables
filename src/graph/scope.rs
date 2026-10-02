use super::node::{Buffer, N, NodeFlags};
use crate::ffi;
use crate::graph::{MAX_PARAMS, NodeKind, Param, State};
use alloc::{vec, vec::Vec};

const MAX_DEPTH: u8 = 16;

static mut BUF: Buffer = [0.0; N];

pub fn buf() -> usize {
    (&raw const BUF) as usize
}

pub fn fill(s: &State, node: usize, widget: u8) -> usize {
    let n = match (widget, s.kind(node)) {
        (0, Some(_)) => N,
        (1, Some(NodeKind::Output)) => N / 2,
        _ => return 0,
    };
    let Some(b) = eval(s, node, 0).into_iter().next() else {
        return 0;
    };
    let buf = unsafe { &mut BUF };
    *buf = b;
    if widget == 1 {
        spectrum(buf);
    }
    n
}

/// Output buffers of `node`. Sinks (no outputs) return their inputs instead (ponytail: lets widgets read them).
/// Unlinked inputs are silent; depth-capped so cycles terminate.
fn eval(s: &State, node: usize, depth: u8) -> Vec<Buffer> {
    let Some(kind) = s.kind(node).filter(|_| depth < MAX_DEPTH) else {
        return vec![];
    };
    let (ni, no) = kind.sockets();
    let ins: Vec<Buffer> = (0..ni)
        .map(|i| {
            s.links
                .iter()
                .find(|l| l.target as usize == node && l.target_socket == i)
                .and_then(|l| {
                    let outs = eval(s, l.source as usize, depth + 1);
                    outs.into_iter().nth(l.source_socket as usize)
                })
                .unwrap_or([0.0; N])
        })
        .collect();
    let mut outs = if no == 0 {
        ins
    } else {
        let mut outs = vec![[0.0; N]; no as usize];
        let refs: Vec<&Buffer> = ins.iter().collect();
        kind.as_node()
            .process(&refs, &params(s, node, kind), &mut outs);
        outs
    };
    let f = s.flags(node);
    outs.iter_mut().for_each(|o| post(o, f));
    outs
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

fn spectrum(re: &mut [f32; N]) {
    let bins = microfft::real::rfft_2048(re);
    bins[0].im = 0.0;
    let mut out = [0.0; N / 2];
    for (k, (o, b)) in out.iter_mut().zip(bins.iter()).enumerate() {
        let m = ffi::hypot(b.re as f64, b.im as f64) * if k == 0 { 1.0 } else { 2.0 } / N as f64;

        *o = (1.0 + 0.217147 * ffi::log(m.max(1e-4))) as f32;
    }
    re[..N / 2].copy_from_slice(&out);
}
