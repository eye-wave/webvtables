mod link;
mod node;
mod param;
mod socket;

pub use link::*;
pub use node::*;
pub use param::*;
pub use socket::*;

mod consts {
    pub const MAX_NODES: usize = 8;
    pub const MAX_LINKS: usize = 16;
    pub const MAX_PARAMS: usize = 4;

    pub const SOCKET_R: f32 = 5.0;
    pub const SOCKET_HIT_R2: f32 = 10.0 * 10.0;
    pub const LINK_HIT_DIST2: f32 = 6.0 * 6.0;
}

pub use consts::*;

pub struct GraphState {
    pub nodes: [Node; MAX_NODES],
    pub node_count: usize,
    pub links: [Option<Link>; MAX_LINKS],
    pub dragging_node: Option<usize>,
    pub drag_offset: (f32, f32),
    pub dragging_param: Option<(usize, usize)>,
    pub drag_param_start_y: f32,
    pub drag_param_start_value: f64,
    pub pending_link_from: Option<usize>,
    pub hovered_link: Option<usize>,
    pub hovered_socket: Option<(usize, SocketKind)>,
    pub mouse: (f32, f32),
    /// Bumped whenever link topology changes. Lets JS cheaply detect
    /// if the audio graph need rebuilding.
    pub version: u32,
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
