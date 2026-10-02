use crate::graph::State;

#[repr(u8)]
#[derive(Clone, Copy)]
pub enum NodeKind {
    BasicShapes,
    Output,
}

impl NodeKind {
    pub fn from_u8(n: u8) -> Option<Self> {
        match n {
            0 => Some(Self::BasicShapes),
            1 => Some(Self::Output),
            _ => None,
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

    pub fn params(&self, p: NodeParams) -> &[f32] {
        self.arena.slice(p.start, p.len as usize)
    }

    pub fn params_mut(&mut self, p: NodeParams) -> &mut [f32] {
        self.arena.slice_mut(p.start, p.len as usize)
    }
}
