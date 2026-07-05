use alloc::boxed::Box;

mod buffer;
mod link;
mod node;
mod param;
mod socket;

pub use buffer::*;
pub use link::*;
pub use node::*;
pub use param::*;
use serde::{Deserialize, Serialize};
pub use socket::*;

mod consts {
    pub const MAX_NODES: usize = 100;
    pub const MAX_LINKS: usize = 100;
    pub const MAX_PARAMS: usize = 5;
    /// Per-node scratch state (e.g. a filter's IIR history) that must
    /// survive across process() calls instead of resetting every frame.
    pub const MAX_NODE_STATE: usize = 4;
    /// Cap on input sockets a single node kind can have (Add uses 2 today).
    pub const MAX_NODE_INPUTS: usize = 4;

    pub const SOCKET_R: f32 = 5.0;
    pub const SOCKET_HIT_R2: f32 = 10.0 * 10.0;
    pub const LINK_HIT_DIST2: f32 = 6.0 * 6.0;
}

pub use consts::*;

use crate::render;

pub struct GraphState {
    pub nodes: [Node; MAX_NODES],
    pub node_count: usize,
    pub links: [Option<Link>; MAX_LINKS],
    pub dragging_node: Option<usize>,
    pub drag_offset: (f32, f32),
    pub dragging_param: Option<(usize, usize)>,
    pub drag_param_start_y: f32,
    pub drag_param_start_value: f64,
    pub pending_link_from: Option<(usize, usize)>,
    pub hovered_link: Option<usize>,
    pub hovered_socket: Option<SocketRef>,
    pub mouse: (f32, f32),
    /// Bumped whenever link topology changes. Lets Host cheaply detect
    /// if the audio graph need rebuilding.
    pub version: u32,
    /// Each node's most recently computed single-cycle output frame.
    /// heap-allocated (see `init()`) instead of a static array, so
    /// it doesn't inflate the binary; `None` only before init() runs.
    pub buffers: Option<Box<[Buffer]>>,
}

#[derive(Serialize, Deserialize)]
pub struct GraphSnapshot {
    node_count: usize,
    nodes: heapless::Vec<NodeSnapshot, MAX_NODES>,
    links: heapless::Vec<Option<Link>, MAX_LINKS>,
}

impl From<&GraphState> for GraphSnapshot {
    fn from(state: &GraphState) -> Self {
        let mut nodes = heapless::Vec::new();

        for i in 0..state.node_count {
            let _ = nodes.push(state.nodes[i].into());
        }

        let mut links = heapless::Vec::new();
        for slot in state.links.iter() {
            let _ = links.push(*slot);
        }

        GraphSnapshot {
            node_count: state.node_count,
            nodes,
            links,
        }
    }
}

impl GraphState {
    pub fn serialize(&self) -> Result<alloc::vec::Vec<u8>, postcard::Error> {
        let snapshot: GraphSnapshot = self.into();
        postcard::to_allocvec(&snapshot)
    }

    pub fn patch(&mut self, snapshot: GraphSnapshot) {
        self.node_count = snapshot.node_count;
        for i in 0..MAX_NODES {
            if i < snapshot.nodes.len() {
                self.nodes[i] = snapshot.nodes[i].clone().into();
            } else {
                self.nodes[i] = EMPTY_NODE;
            }
        }

        for i in 0..MAX_LINKS {
            if i < snapshot.links.len() {
                self.links[i] = snapshot.links[i];
            } else {
                self.links[i] = None;
            }
        }

        self.dragging_node = None;
        self.drag_offset = (0.0, 0.0);
        self.dragging_param = None;
        self.drag_param_start_y = 0.0;
        self.drag_param_start_value = 0.0;
        self.pending_link_from = None;
        self.hovered_link = None;
        self.hovered_socket = None;

        self.version += 1;
        render();
    }
}

static mut STATE: GraphState = GraphState {
    nodes: [EMPTY_NODE; MAX_NODES],
    node_count: 0,
    links: [None; MAX_LINKS],
    dragging_node: None,
    drag_offset: (0.0, 0.0),
    dragging_param: None,
    drag_param_start_y: 0.0,
    drag_param_start_value: 0.0,
    pending_link_from: None,
    hovered_link: None,
    hovered_socket: None,
    mouse: (0.0, 0.0),
    version: 0,
    buffers: None,
};

pub fn state() -> &'static mut GraphState {
    unsafe { &mut STATE }
}

pub fn creates_cycle(s: &GraphState, from: usize, to: usize) -> bool {
    let mut visited = [false; MAX_NODES];
    let mut stack = [0usize; MAX_NODES];
    let mut sp = 0;
    stack[sp] = to;
    sp += 1;
    visited[to] = true;
    while sp > 0 {
        sp -= 1;
        let cur = stack[sp];
        if cur == from {
            return true;
        }
        for slot in s.links.iter() {
            if let Some(l) = slot
                && l.from == cur
                && !visited[l.to]
            {
                visited[l.to] = true;
                stack[sp] = l.to;
                sp += 1;
            }
        }
    }
    false
}

pub fn is_valid_target(s: &GraphState, from: usize, to: usize) -> bool {
    to != from && !creates_cycle(s, from, to)
}
