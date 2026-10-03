use super::State;
use alloc::vec::Vec;

static mut FILE: Vec<u8> = Vec::new();

pub fn file_ptr() -> usize {
    unsafe { (&raw const FILE).as_ref().unwrap().as_ptr() as usize }
}

pub fn save(s: &State) -> usize {
    let f = unsafe { &mut FILE };
    *f = postcard::to_allocvec(s).unwrap_or_default();
    f.len()
}

pub fn buffer(len: usize) -> usize {
    let f = unsafe { &mut FILE };
    *f = alloc::vec![0; len];
    f.as_ptr() as usize
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

pub fn load(len: usize) -> bool {
    let f = unsafe { &FILE };
    match postcard::from_bytes::<State>(&f[..len.min(f.len())]) {
        Ok(s) if s.valid() => {
            *super::state() = s;
            true
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::{NodeKind, state};

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
        s
    }

    #[test]
    fn roundtrip_and_apply() {
        *state() = sample();
        let n = save(state());
        let want = postcard::to_allocvec(state()).unwrap();
        *state() = State::new();
        let p = buffer(n);
        unsafe { core::ptr::copy_nonoverlapping(want.as_ptr(), p as *mut u8, n) };
        assert!(load(n));
        assert_eq!(postcard::to_allocvec(state()).unwrap(), want);
        let s = state();
        assert_eq!(
            (s.nodes.len(), s.links.len(), s.keyframes.lanes.len()),
            (2, 1, 2)
        );
        assert_eq!(s.apply_keyframes(105.0), 1);
        let slot = s.param_slot(s.nodes[0], 0).unwrap();
        assert!(
            (s.arena.slice::<f32>(slot, 1)[0] - 0.5).abs() < 0.01,
            "halfway between the keys"
        );
    }

    #[test]
    fn hostile_files_never_load_broken_state() {
        let good = postcard::to_allocvec(&sample()).unwrap();
        for i in 0..good.len() {
            for b in [0x00, 0x7f, 0xff] {
                let mut bad = good.clone();
                bad[i] = b;
                if let Ok(s) = postcard::from_bytes::<State>(&bad) {
                    if s.valid() {
                        let mut s = s;
                        s.apply_keyframes(77.0);
                        s.lane_dump();
                        (0..s.keyframes.lanes.len()).for_each(|l| {
                            s.lane_curve(l);
                        });
                        (0..s.nodes.len()).for_each(|n| {
                            s.kind(n).unwrap();
                            s.params(n);
                        });
                    }
                }
            }
        }
        for len in 0..good.len() {
            assert!(
                postcard::from_bytes::<State>(&good[..len])
                    .map_or(true, |s| !s.valid() || len == good.len())
            );
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

    #[test]
    fn lane_with_several_targets_survives_until_its_last_node_goes() {
        let mut s = sample();
        let kind = s.kind(0).unwrap();
        s.add_node(kind, [0.0; 2], [0.0; 2]).unwrap();
        let (n0, n2) = (
            s.arena.base() + s.nodes[0] as usize,
            s.arena.base() + s.nodes[2] as usize,
        );
        assert!(s.lane_link(0, n2, 0, true));
        assert_eq!(s.keyframes.lanes[0].targets.len(), 2);
        assert!(s.valid());
        s.remove_node(0);
        assert_eq!(
            s.keyframes.lanes.len(),
            2,
            "one target left, the lane stays"
        );
        assert_eq!(s.keyframes.lanes[0].targets.len(), 1);
        s.remove_node(1);
        assert_eq!(
            s.keyframes.lanes.len(),
            1,
            "its last target went with the node"
        );
        assert!(s.lane_link(0, n0, 0, true) == false);
        let _ = n2;
    }
}
