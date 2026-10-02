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
