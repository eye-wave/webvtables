use crate::graph::State;

#[repr(u8)]
#[derive(Clone, Copy)]
pub enum NodeKind {
    BasicShapes,
    Output,
    Transform,
}

impl NodeKind {
    pub fn from_u8(n: u8) -> Option<Self> {
        match n {
            0 => Some(Self::BasicShapes),
            1 => Some(Self::Output),
            2 => Some(Self::Transform),
            _ => None,
        }
    }

    pub fn sockets(self) -> (u8, u8) {
        match self {
            Self::BasicShapes => (0, 1),
            Self::Output => (1, 0),
            Self::Transform => (1, 1),
        }
    }
}

#[repr(C)]
pub struct Node {
    pub position: [f32; 2],
    pub size: [f32; 2],
    pub kind: NodeKind,
    pub flags: u8,
    pub params: NodeParams,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct NodeParams {
    start: u32,
    len: u8,
}

impl State {
    pub fn add_node(
        &mut self,
        kind: NodeKind,
        position: [f32; 2],
        size: [f32; 2],
        n_params: u8,
    ) -> Option<u32> {
        let start = self.arena.alloc::<f32>(n_params as usize)?;
        let off = self.arena.alloc::<Node>(1)?;
        self.arena.slice_mut::<Node>(off, 1)[0] = Node {
            position,
            size,
            kind,
            flags: 0,
            params: NodeParams {
                start,
                len: n_params,
            },
        };
        self.nodes.push(off);
        Some(off)
    }

    pub fn kind(&self, idx: usize) -> Option<NodeKind> {
        Some(self.arena.slice::<Node>(*self.nodes.get(idx)?, 1)[0].kind)
    }

    pub fn params(&self, idx: usize) -> &[f32] {
        let Some(&off) = self.nodes.get(idx) else {
            return &[];
        };
        let p = self.arena.slice::<Node>(off, 1)[0].params;
        self.arena.slice(p.start, p.len as usize)
    }

    pub fn sockets(&self, idx: usize) -> Option<(u8, u8)> {
        let off = *self.nodes.get(idx)?;
        Some(self.arena.slice::<Node>(off, 1)[0].kind.sockets())
    }

    pub fn param_addr(&self, idx: usize, i: usize) -> Option<usize> {
        let p = self.arena.slice::<Node>(*self.nodes.get(idx)?, 1)[0].params;
        (i < p.len as usize).then(|| self.arena.base() + p.start as usize + i * 4)
    }
}
