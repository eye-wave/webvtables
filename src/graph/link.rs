use crate::graph::State;

#[repr(C)]
pub struct Link {
    pub source: u16,
    pub source_socket: u8,
    pub target: u16,
    pub target_socket: u8,
}

impl Link {
    pub fn new(source: u16, source_socket: u8, target: u16, target_socket: u8) -> Self {
        Self {
            source,
            source_socket,
            target,
            target_socket,
        }
    }
}

impl State {
    pub fn link(&mut self, s: (u16, u8), t: (u16, u8)) -> Option<usize> {
        if s.0 == t.0
            || s.1 >= self.sockets(s.0 as usize)?.1
            || t.1 >= self.sockets(t.0 as usize)?.0
        {
            return None;
        }
        let new = Link::new(s.0, s.1, t.0, t.1);
        match self
            .links
            .iter()
            .position(|l| (l.target, l.target_socket) == t)
        {
            Some(i) => {
                self.links[i] = new;
                Some(i)
            }
            None => {
                self.links.push(new);
                Some(self.links.len() - 1)
            }
        }
    }
}

impl State {
    // A follower param mirrors its master (custom-node params fan out to inner params).
    // `Some((master, inverted))`: the follower is 1 - master when inverted. `None` un-follows.
    // One master per follower.
    pub fn follow(&mut self, f: (u32, u8), m: Option<((u32, u8), bool)>) -> bool {
        let ok =
            |(o, p): (u32, u8)| self.nodes.contains(&o) && self.param_slot(o, p as usize).is_some();
        if m.is_some_and(|(m, _)| m == f || !ok(m) || !ok(f)) {
            return false;
        }
        self.follows.retain(|x| x.0 != f);
        self.follows.extend(m.map(|(m, inv)| (f, m, inv)));
        true
    }

    // Runs once per evaluation, after keyframes (the master wins over a lane on the follower).
    pub fn propagate(&mut self) {
        let follows = core::mem::take(&mut self.follows);
        for &((fo, fp), (mo, mp), inv) in &follows {
            if let (Some(f), Some(m)) = (
                self.param_slot(fo, fp as usize),
                self.param_slot(mo, mp as usize),
            ) {
                let v = self.arena.slice::<f32>(m, 1)[0];
                self.arena.slice_mut::<f32>(f, 1)[0] = if inv { 1.0 - v } else { v };
            }
        }
        self.follows = follows;
    }
}

impl State {
    pub fn remove_node(&mut self, idx: usize) {
        if idx >= self.nodes.len() {
            return;
        }
        let off = self.nodes.remove(idx);
        self.data.retain(|d| d.0 != off);
        self.follows.retain(|x| x.0.0 != off && x.1.0 != off);

        self.keyframes.lanes.retain_mut(|l| {
            let had = !l.targets.is_empty();
            l.targets.retain(|t| t.0 != off);
            !had || !l.targets.is_empty()
        });
        self.links
            .retain(|l| l.source as usize != idx && l.target as usize != idx);
        for l in &mut self.links {
            l.source -= (l.source as usize > idx) as u16;
            l.target -= (l.target as usize > idx) as u16;
        }
        self.rope_clear_links();
    }
}

#[cfg(test)]
mod tests {
    use crate::graph::{NodeKind, State};

    #[test]
    fn remove_node_drops_and_reindexes_links() {
        let mut s = State::new();
        for _ in 0..3 {
            s.add_node(NodeKind::Add, [0.0; 2], [0.0; 2]).unwrap();
        }
        s.link((0, 0), (1, 0));
        s.link((1, 0), (2, 0));
        s.link((0, 0), (2, 1));
        s.remove_node(1);
        assert_eq!(s.nodes.len(), 2);
        assert_eq!(s.links.len(), 1);
        let l = &s.links[0];
        assert_eq!((l.source, l.target, l.target_socket), (0, 1, 1));
    }

    #[test]
    fn followers_mirror_their_master_until_removed() {
        let mut s = State::new();
        for _ in 0..3 {
            s.add_node(NodeKind::Gain, [0.0; 2], [0.0; 2]).unwrap();
        }
        let o = s.nodes.clone();
        assert!(s.follow((o[1], 0), Some(((o[0], 0), false))));
        assert!(s.follow((o[2], 0), Some(((o[0], 0), true))));
        assert!(
            !s.follow((o[0], 0), Some(((o[0], 0), false))),
            "not its own master"
        );
        let slot = |s: &State, i: usize| s.param_slot(o[i], 0).unwrap();
        let m = slot(&s, 0);
        s.arena.slice_mut::<f32>(m, 1)[0] = 0.25;
        s.propagate();
        assert_eq!(s.arena.slice::<f32>(slot(&s, 1), 1)[0], 0.25);
        assert_eq!(s.arena.slice::<f32>(slot(&s, 2), 1)[0], 0.75);
        assert!(s.follow((o[2], 0), None));
        s.arena.slice_mut::<f32>(m, 1)[0] = 0.5;
        s.propagate();
        assert_eq!(s.arena.slice::<f32>(slot(&s, 1), 1)[0], 0.5);
        assert_eq!(
            s.arena.slice::<f32>(slot(&s, 2), 1)[0],
            0.75,
            "no longer follows"
        );
        s.remove_node(0);
        assert!(s.follows.is_empty());
    }

    #[test]
    fn removing_a_node_removes_its_lanes() {
        let mut s = State::new();
        s.add_node(NodeKind::Gain, [0.0; 2], [0.0; 2]).unwrap();
        let lane = s.lane_add(0).unwrap();
        let addr = s.arena.base() + s.nodes[0] as usize;
        assert!(s.lane_link(lane, addr, 0, true));
        s.remove_node(0);
        assert!(s.keyframes.lanes.is_empty());
    }
}
