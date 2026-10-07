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
    pub fn remove_node(&mut self, idx: usize) {
        if idx >= self.nodes.len() {
            return;
        }
        let off = self.nodes.remove(idx);
        self.data.retain(|d| d.0 != off);

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
    fn removing_a_node_removes_its_lanes() {
        let mut s = State::new();
        s.add_node(NodeKind::Gain, [0.0; 2], [0.0; 2]).unwrap();
        let lane = s.lane_add(false).unwrap();
        let addr = s.arena.base() + s.nodes[0] as usize;
        assert!(s.lane_link(lane, addr, 0, true));
        s.remove_node(0);
        assert!(s.keyframes.lanes.is_empty());
    }
}
