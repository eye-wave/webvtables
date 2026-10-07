use super::keyframes::{MORPHS, blend};
use super::node::{Buffer, N, NodeFlags, zeroed};
use crate::graph::{MAX_PARAMS, NodeKind, Param, State};
use alloc::{boxed::Box, vec::Vec};

type Memo = Vec<Option<Box<[f32]>>>;

static mut BUF: Buffer = [0.0; N];
// Arena offset of the node whose `process` is running (nodes are otherwise stateless).
pub static mut CURRENT: u32 = 0;
static mut MEMO: Memo = Vec::new();

pub fn begin(s: &State) {
    let memo = unsafe { &mut MEMO };
    memo.clear();
    memo.resize(s.nodes.len(), None);
}

pub fn buf() -> usize {
    (&raw const BUF) as usize
}

pub fn fill(s: &State, node: usize, widget: u8) -> usize {
    let Some(kind) = s.kind(node) else {
        return 0;
    };
    let buf = unsafe { &mut BUF };
    let memo = unsafe { &mut MEMO };
    if memo.len() != s.nodes.len() {
        begin(s);
    }
    match widget {
        0 => {
            eval(s, node, 0, memo, buf);
            N
        }
        1 if kind.as_node().has_widget() => {
            let ins = inputs(s, node, kind, memo);
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
        memo[node] = Some(zeroed(0));
        let no = kind.sockets().1;
        let ins = inputs(s, node, kind, memo);
        let mut outs = if no == 0 {
            ins
        } else {
            let mut outs = zeroed(no as usize);
            let refs: Vec<&Buffer> = ins.as_chunks::<N>().0.iter().collect();
            let ps = params(s, node, kind);
            let nd = kind.as_node();
            let off = s.nodes[node];
            unsafe { CURRENT = off };
            let es: Vec<_> = unsafe { MORPHS.iter() }
                .filter(|e| e.0 == off && ps.get(e.1 as usize).is_some_and(Option::is_some))
                .collect();
            let call = |ov: Option<(u8, f32)>| {
                let mut p = ps;
                if let Some((j, v)) = ov {
                    p[j as usize].as_mut().unwrap().set_norm(v as f64);
                }
                let mut o = zeroed(no as usize);
                nd.process(&refs, &p, o.as_chunks_mut::<N>().0);
                o
            };
            if es.is_empty() {
                outs = call(None);
            } else {
                // k morph params = 2k+1 process calls; each blend adds a delta to the base result.
                // Exact for k=1, approximate when params interact.
                let base = (es.len() > 1).then(|| call(None));
                for &&(_, j, mode, va, vb, m) in &es {
                    let (a, b) = (call(Some((j, va))), call(Some((j, vb))));
                    for (i, ((o, a), b)) in outs
                        .as_chunks_mut::<N>()
                        .0
                        .iter_mut()
                        .zip(a.as_chunks::<N>().0)
                        .zip(b.as_chunks::<N>().0)
                        .enumerate()
                    {
                        let mut t = [0.0; N];
                        blend(mode, m, a, b, &mut t);
                        match &base {
                            None => *o = t,
                            Some(base) => {
                                let d = &base.as_chunks::<N>().0[i];
                                o.iter_mut()
                                    .zip(t.iter().zip(d))
                                    .for_each(|(o, (t, d))| *o += t - d)
                            }
                        }
                    }
                }
                if let Some(base) = &base {
                    // outs started at zero: add the base once
                    outs.iter_mut().zip(base.iter()).for_each(|(o, d)| *o += d);
                }
            }
            outs
        };
        let f = s.flags(node);
        outs.as_chunks_mut::<N>()
            .0
            .iter_mut()
            .for_each(|o| post(o, f));
        memo[node] = Some(outs);
    }
    if let Some(o) = memo[node]
        .as_ref()
        .and_then(|o| o.as_chunks::<N>().0.get(sock))
    {
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
        begin(&s);
        assert_eq!(fill(&s, prev as usize, 0), N);
        let (a, b) = (add(&mut s), add(&mut s));
        s.link((a, 0), (b, 0));
        s.link((b, 0), (a, 0));
        begin(&s);
        assert_eq!(fill(&s, a as usize, 0), N);
    }

    #[test]
    fn long_chain_all_scopes_share_one_memo() {
        let mut s = State::new();
        let mut prev = add(&mut s);
        for _ in 0..600 {
            let g = add(&mut s);
            s.link((prev, 0), (g, 0));
            prev = g;
        }
        begin(&s);

        let t = std::time::Instant::now();
        (0..s.nodes.len()).for_each(|i| assert_eq!(fill(&s, i, 0), N));
        assert!(t.elapsed().as_millis() < 500, "{:?}", t.elapsed());
    }

    #[test]
    fn random_graphs_never_panic() {
        let mut seed = 0x9E37_79B9_7F4A_7C15u64;
        let mut rnd = move || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };
        let kinds: Vec<NodeKind> = (0..).map_while(NodeKind::from_u8).collect();
        let mut bad = 0;
        for round in 0..400 {
            let mut s = State::new();
            for _ in 0..2 + rnd() % 14 {
                s.add_node(kinds[rnd() as usize % kinds.len()], [0.0; 2], [0.0; 2]);
            }
            let n = s.nodes.len();
            for i in 0..n {
                for j in 0..s.params(i).len() {
                    let v = [0.0, 1.0, (rnd() % 1000) as f32 / 999.0][(rnd() % 3) as usize];
                    unsafe { *(s.param_addr(i, j).unwrap() as *mut f32) = v };
                }
                let f = rnd() as u8 & 7;
                unsafe { *((s.arena.base() + s.nodes[i] as usize + 17) as *mut u8) = f };
            }
            for _ in 0..rnd() % 24 {
                let (a, b) = ((rnd() % n as u64) as u16, (rnd() % n as u64) as u16);
                let (_, o) = s.sockets(a as usize).unwrap();
                let (i, _) = s.sockets(b as usize).unwrap();
                if o > 0 && i > 0 {
                    s.link((a, (rnd() % o as u64) as u8), (b, (rnd() % i as u64) as u8));
                }
            }
            for frame in [0.0, 100.5, 255.0] {
                s.apply_keyframes(frame);
                begin(&s);
                for i in 0..n {
                    for w in 0..2 {
                        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            fill(&s, i, w)
                        }));
                        if r.is_err() {
                            bad += 1;
                            println!(
                                "PANIC round {round}: node {i} {} widget {w}",
                                s.kind(i).unwrap().ident()
                            );
                        }
                    }
                }
            }
        }
        assert_eq!(bad, 0);
    }
}
