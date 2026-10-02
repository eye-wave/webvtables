use super::node::{Buffer, N, NodeFlags, zeroed};
use crate::graph::{MAX_PARAMS, NodeKind, Param, State};
use alloc::{boxed::Box, vec, vec::Vec};

// ponytail: per-call memo, every node evaluated once, so shared inputs and cycles are cheap
type Memo = Vec<Option<Box<[f32]>>>;

static mut BUF: Buffer = [0.0; N];

pub fn buf() -> usize {
    (&raw const BUF) as usize
}

pub fn fill(s: &State, node: usize, widget: u8) -> usize {
    let Some(kind) = s.kind(node) else {
        return 0;
    };
    let buf = unsafe { &mut BUF };
    let mut memo: Memo = vec![None; s.nodes.len()];
    match widget {
        0 => {
            eval(s, node, 0, &mut memo, buf);
            N
        }
        1 if kind.as_node().has_widget() => {
            let ins = inputs(s, node, kind, &mut memo);
            let refs: Vec<&Buffer> = ins.as_chunks::<N>().0.iter().collect();
            kind.as_node()
                .fill_widget(&refs, &params(s, node, kind), buf)
        }
        _ => 0,
    }
}

fn eval(s: &State, node: usize, sock: usize, memo: &mut Memo, dst: &mut Buffer) {
    dst.fill(0.0);
    let Some(kind) = s.kind(node) else {
        return;
    };
    if memo[node].is_none() {
        memo[node] = Some(zeroed(0)); // in progress: a cycle reads silence
        let no = kind.sockets().1;
        let ins = inputs(s, node, kind, memo);
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
        outs.as_chunks_mut::<N>().0.iter_mut().for_each(|o| post(o, f));
        memo[node] = Some(outs);
    }
    if let Some(o) = memo[node].as_ref().and_then(|o| o.as_chunks::<N>().0.get(sock)) {
        dst.copy_from_slice(&o[..]);
    }
}

fn inputs(s: &State, node: usize, kind: NodeKind, memo: &mut Memo) -> Box<[f32]> {
    let mut ins = zeroed(kind.sockets().0 as usize);
    for (i, b) in ins.as_chunks_mut::<N>().0.iter_mut().enumerate() {
        let src = s
            .links
            .iter()
            .find(|l| l.target as usize == node && l.target_socket as usize == i);
        if let Some(l) = src {
            eval(s, l.source as usize, l.source_socket as usize, memo, b);
        }
    }
    ins
}

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

#[cfg(test)]
mod tests {
    use super::*;

    fn add(s: &mut State) -> u16 {
        s.add_node(NodeKind::Add, [0.0; 2], [0.0; 2]).unwrap();
        (s.nodes.len() - 1) as u16
    }

    #[test]
    fn shared_inputs_and_cycles_terminate() {
        let mut s = State::new();
        let mut prev = add(&mut s);
        for _ in 0..40 {
            let (g, m) = (add(&mut s), add(&mut s));
            s.link((prev, 0), (g, 0));
            s.link((prev, 0), (m, 0));
            s.link((g, 0), (m, 1));
            prev = m;
        }
        assert_eq!(fill(&s, prev as usize, 0), N);
        let (a, b) = (add(&mut s), add(&mut s));
        s.link((a, 0), (b, 0));
        s.link((b, 0), (a, 0));
        assert_eq!(fill(&s, a as usize, 0), N);
    }
}
