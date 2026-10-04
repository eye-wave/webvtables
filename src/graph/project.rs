use super::keyframes::{Key, LFO_PARAMS, Lane, NAME_MAX, Source};
use super::node::{Node, NodeFlags};
use super::{Link, NodeKind, State};
use alloc::{string::String, vec::Vec};
use serde::Serialize;

static mut FILE: Vec<u8> = Vec::new();

pub fn file_ptr() -> usize {
    unsafe { (&raw const FILE).as_ref().unwrap().as_ptr() as usize }
}

pub fn buffer(len: usize) -> usize {
    let f = unsafe { &mut FILE };
    *f = alloc::vec![0; len];
    f.as_ptr() as usize
}

// The file is a logical description (not an arena dump): nodes by stable id, params by position,
// links and lane targets by node index. Written with postcard, read with `Rd` below.
#[derive(Serialize)]
struct SNode {
    id: [u8; 8],
    pos: [f32; 2],
    size: [f32; 2],
    flags: u8,
    params: Vec<f32>,
}

#[derive(Serialize)]
struct SLane<'a> {
    name: &'a str,
    mode: u8,
    source: &'a Source,
    targets: Vec<(u16, u8)>,
}

#[derive(Serialize)]
struct Out<'a> {
    nodes: Vec<SNode>,
    links: &'a [Link],
    lanes: Vec<SLane<'a>>,
}

pub fn encode(s: &State) -> Vec<u8> {
    let nodes = (0..s.nodes.len())
        .map(|i| {
            let n = &s.arena.slice::<Node>(s.nodes[i], 1)[0];
            let mut id = [0; 8];
            id[..n.kind.id().len()].copy_from_slice(n.kind.id().as_bytes());
            SNode {
                id,
                pos: n.position,
                size: n.size,
                flags: n.flags,
                params: s.params(i).into(),
            }
        })
        .collect();
    let lanes = s
        .keyframes
        .lanes
        .iter()
        .map(|l| SLane {
            name: &l.name,
            mode: l.mode,
            source: &l.source,
            targets: l
                .targets
                .iter()
                .filter_map(|t| Some((s.nodes.iter().position(|&o| o == t.0)? as u16, t.1)))
                .collect(),
        })
        .collect();
    postcard::to_allocvec(&Out {
        nodes,
        links: &s.links,
        lanes,
    })
    .unwrap_or_default()
}

pub fn save(s: &State) -> usize {
    let f = unsafe { &mut FILE };
    *f = encode(s);
    f.len()
}

// Forgiving reader over postcard bytes: running out of data yields zeros and sets `dry`.
struct Rd<'a> {
    b: &'a [u8],
    dry: bool,
}

impl Rd<'_> {
    fn u8(&mut self) -> u8 {
        match self.b.split_first() {
            Some((&x, rest)) => (self.b = rest, x).1,
            None => (self.dry = true, 0).1,
        }
    }
    fn var(&mut self) -> u32 {
        let (mut v, mut shift) = (0u32, 0);
        loop {
            let b = self.u8();
            if shift < 32 {
                v |= ((b & 0x7f) as u32) << shift;
            }
            shift += 7;
            if b & 0x80 == 0 || self.dry {
                return v;
            }
        }
    }
    fn f32(&mut self) -> f32 {
        f32::from_le_bytes([self.u8(), self.u8(), self.u8(), self.u8()])
    }
    // Element count, capped by the bytes left (every element takes at least one).
    fn len(&mut self) -> usize {
        (self.var() as usize).min(self.b.len())
    }
}

fn finite(v: f32, or: f32) -> f32 {
    if v.is_finite() { v } else { or }
}

pub fn decode(bytes: &[u8]) -> (State, bool) {
    let mut r = Rd {
        b: bytes,
        dry: false,
    };
    let mut s = State::new();
    // file node index -> index in the new state (None: unknown kind, ignored)
    let mut map: Vec<Option<u16>> = Vec::new();

    for _ in 0..r.len() {
        let id: [u8; 8] = core::array::from_fn(|_| r.u8());
        let pos = [r.f32(), r.f32()];
        let size = [r.f32(), r.f32()];
        let flags = r.u8();
        let vals: Vec<f32> = (0..r.len()).map(|_| r.f32()).collect();
        if r.dry {
            break;
        }
        let id = &id[..id.iter().position(|&b| b == 0).unwrap_or(8)];
        let Some(kind) = NodeKind::from_id(id) else {
            map.push(None);
            continue;
        };
        let Some(off) = s.add_node(
            kind,
            pos.map(|v| finite(v, 0.0)),
            size.map(|v| finite(v, 0.0)),
        ) else {
            break;
        };
        s.arena.slice_mut::<Node>(off, 1)[0].flags = NodeFlags::from_bits_truncate(flags).bits();
        // Missing params keep their defaults, extra ones are ignored.
        for (i, v) in vals.iter().enumerate().filter(|(_, v)| v.is_finite()) {
            if let Some(slot) = s.param_slot(off, i) {
                s.arena.slice_mut::<f32>(slot, 1)[0] = v.clamp(0.0, 1.0);
            }
        }
        map.push(Some((s.nodes.len() - 1) as u16));
    }
    let node = |i: u32| map.get(i as usize).copied().flatten();

    for _ in 0..r.len() {
        let (a, sa, b, sb) = (r.var(), r.u8(), r.var(), r.u8());
        if r.dry {
            break;
        }
        if let (Some(a), Some(b)) = (node(a), node(b)) {
            s.link((a, sa), (b, sb));
        }
    }

    for _ in 0..r.len() {
        let name = r.len();
        let name =
            String::from_utf8_lossy(&(0..name).map(|_| r.u8()).collect::<Vec<_>>()).into_owned();
        let mode = r.u8().min(2);
        let source = match r.var() {
            0 => {
                let mut keys: Vec<Key> = (0..r.len())
                    .map(|_| Key {
                        t: r.u8(),
                        v: finite(r.f32(), 0.0),
                        c: finite(r.f32(), 0.5).clamp(0.0, 1.0),
                    })
                    .collect();
                keys.sort_by_key(|k| k.t);
                keys.dedup_by_key(|k| k.t);
                Source::Points(keys)
            }
            1 => Source::Lfo(core::array::from_fn::<_, LFO_PARAMS, _>(|_| {
                finite(r.f32(), 0.0)
            })),
            _ => break,
        };
        let targets: Vec<(u32, u8)> = (0..r.len()).map(|_| (r.var(), r.u8())).collect();
        if r.dry {
            break;
        }
        let mut name = name;
        while name.len() > NAME_MAX {
            name.pop();
        }
        let mut lane = Lane {
            name,
            mode,
            source,
            targets: Vec::new(),
        };
        for (n, p) in targets {
            let Some(off) = node(n).map(|n| s.nodes[n as usize]) else {
                continue;
            };
            let t = (off, p);
            let taken = lane.targets.contains(&t)
                || s.keyframes.lanes.iter().any(|l| l.targets.contains(&t));
            if !taken && s.param_slot(off, p as usize).is_some() {
                lane.targets.push(t);
            }
        }
        s.keyframes.lanes.push(lane);
    }

    // A readable file that yields nothing at all is more likely garbage than a project.
    let ok = s.valid() && (!s.nodes.is_empty() || !r.dry && r.b.is_empty());
    (s, ok)
}

pub fn load(len: usize) -> bool {
    let f = unsafe { &FILE };
    let (s, ok) = decode(&f[..len.min(f.len())]);
    if ok {
        *super::state() = s;
    }
    ok
}

impl State {
    pub fn valid(&self) -> bool {
        self.nodes_valid()
            && self.links.iter().all(|l| {
                self.sockets(l.source as usize)
                    .is_some_and(|(_, o)| l.source_socket < o)
                    && self
                        .sockets(l.target as usize)
                        .is_some_and(|(i, _)| l.target_socket < i)
            })
            && self.keyframes.valid(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::state;

    fn sample() -> State {
        let mut s = State::new();
        let kind = (0..64)
            .filter_map(NodeKind::from_u8)
            .find(|k| k.as_node().default_params()[0].is_some())
            .unwrap();
        s.add_node(kind, [1.0, 2.0], [3.0, 4.0]).unwrap();
        s.add_node(NodeKind::Output, [5.0, 6.0], [7.0, 8.0])
            .unwrap();
        s.link((0, 0), (1, 0)).unwrap();
        let a = s.lane_add(false).unwrap();
        s.key_add(a, 10, 0.25);
        s.key_add(a, 200, 0.75);
        let b = s.lane_add(true).unwrap();
        let node = s.arena.base() + s.nodes[0] as usize;
        assert!(s.lane_link(a, node, 0, true));
        assert!(!s.lane_link(b, node, 0, true), "a param has one lane");
        s.lfo_set(b, 3, 0.5);
        assert!(s.lane_mode(a, 2));
        s
    }

    #[test]
    fn roundtrip_and_apply() {
        *state() = sample();
        let want = encode(state());
        let (s, ok) = decode(&want);
        assert!(ok);
        assert_eq!(encode(&s), want);
        assert_eq!(
            (s.nodes.len(), s.links.len(), s.keyframes.lanes.len()),
            (2, 1, 2)
        );
        let mut s = s;
        assert_eq!(s.apply_keyframes(105.0), 1);
        let slot = s.param_slot(s.nodes[0], 0).unwrap();
        assert!((s.arena.slice::<f32>(slot, 1)[0] - 0.5).abs() < 0.01);
    }

    #[test]
    fn hostile_files_always_recover_something_valid() {
        let good = encode(&sample());
        let poke = |s: &mut State| {
            s.apply_keyframes(77.0);
            s.lane_dump();
            (0..s.keyframes.lanes.len()).for_each(|l| {
                s.lane_curve(l);
            });
            (0..s.nodes.len()).for_each(|n| {
                s.kind(n).unwrap();
                s.params(n);
            });
        };
        for i in 0..good.len() {
            for b in [0x00, 0x7f, 0xff] {
                let mut bad = good.clone();
                bad[i] = b;
                let (mut s, ok) = decode(&bad);
                if ok {
                    assert!(s.valid());
                    poke(&mut s);
                }
            }
        }
        for len in 0..good.len() {
            let (mut s, ok) = decode(&good[..len]);
            if ok {
                assert!(s.valid());
                poke(&mut s);
            }
        }
    }

    #[test]
    fn short_params_get_defaults_and_unknown_nodes_are_dropped() {
        let mut o = encode(&sample());
        // node 0: id(8) pos(8) size(8) flags(1) then the param count
        let at = 1 + 8 + 8 + 8 + 1;
        assert_eq!(o[at], sample().params(0).len() as u8);
        let want = sample().params(0).len();
        o[at] = 0; // claim no params; the bytes that follow are then read as later fields (garbage)
        let (s, _) = decode(&o);
        assert!(s.valid());
        assert!(want > 0);

        // unknown id: node 0 vanishes, the link to it goes with it, node 1 survives as index 0
        let mut o = encode(&sample());
        o[1..9].copy_from_slice(b"nosuchid");
        let (s, ok) = decode(&o);
        assert!(ok && s.valid());
        assert_eq!((s.nodes.len(), s.links.len()), (1, 0));
        assert_eq!(s.keyframes.lanes[0].targets.len(), 0);
    }

    #[test]
    fn node_ids_are_unique() {
        let ids: Vec<_> = (0..64)
            .filter_map(NodeKind::from_u8)
            .map(|k| k.id())
            .collect();
        for (i, a) in ids.iter().enumerate() {
            assert!(!ids[..i].contains(a));
            assert_eq!(NodeKind::from_id(a.as_bytes()).unwrap().id(), *a);
        }
    }

    #[test]
    fn removing_a_node_removes_its_lanes() {
        let mut s = sample();
        s.remove_node(0);
        assert_eq!(s.keyframes.lanes.len(), 1);
        assert!(s.keyframes.lanes[0].targets.is_empty());
        assert!(s.valid());
    }
}
