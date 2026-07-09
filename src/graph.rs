use alloc::boxed::Box;
use heapless::vec::Vec;

mod buffer;
mod link;
mod node;
mod param;
mod serialize;
mod socket;
mod ui;

pub use buffer::*;
pub use link::*;
pub use node::*;
pub use param::*;
pub use serialize::SerializeGraph;
pub use socket::*;
pub use ui::*;

mod consts {
    pub const MAX_NODES: usize = 100;
    pub const MAX_LINKS: usize = 100;
    pub const MAX_PARAMS: usize = 5;
    /// Per-node scratch state (e.g. a filter's IIR history) that must
    /// survive across process() calls instead of resetting every frame.
    pub const MAX_NODE_STATE: usize = 4;
    pub const MAX_NODE_INPUTS: usize = 4;

    pub const SOCKET_R: f32 = 5.0;
    pub const SOCKET_HIT_R2: f32 = 10.0 * 10.0;
    pub const LINK_HIT_DIST2: f32 = 6.0 * 6.0;
}

pub use consts::*;

pub struct GraphState {
    pub nodes: Vec<Node, MAX_NODES>,
    pub links: Vec<Link, MAX_LINKS>,
    pub dragging_node: Option<usize>,
    pub drag_offset: (f32, f32),
    pub dragging_param: Option<(usize, usize)>,
    pub drag_param_start_y: f32,
    pub drag_param_start_value: f64,
    pub buttons: Vec<Button, 2>,
    pub knobs: Vec<Knob, 2>,
    pub dragging_knob: Option<usize>,
    pub drag_knob_start_y: f32,
    pub drag_knob_start_value: f32,
    pub pending_link_from: Option<(usize, usize)>,
    pub hovered_link: Option<usize>,
    pub hovered_socket: Option<SocketRef>,
    pub viewport: (f32, f32),
    pub viewport_bounds: (f32, f32, f32, f32),
    pub mouse: (f32, f32),
    pub last_pan: (f32, f32),
    pub is_panning: bool,
    /// Bumped whenever link topology changes. Lets Host cheaply detect
    /// if the audio graph need rebuilding.
    pub version: u32,
    /// Each node's most recently computed single-cycle output frame.
    /// heap-allocated (see `init()`) instead of a static array, so
    /// it doesn't inflate the binary; `None` only before init() runs.
    pub buffers: Option<Box<[Buffer]>>,
}

static mut STATE: GraphState = GraphState {
    nodes: Vec::new(),
    links: Vec::new(),
    dragging_node: None,
    drag_offset: (0.0, 0.0),
    dragging_param: None,
    drag_param_start_y: 0.0,
    drag_param_start_value: 0.0,
    buttons: Vec::new(),
    knobs: Vec::new(),
    dragging_knob: None,
    drag_knob_start_y: 0.0,
    drag_knob_start_value: 0.0,
    pending_link_from: None,
    hovered_link: None,
    hovered_socket: None,
    viewport: (480.0, 360.0),
    viewport_bounds: (0.0, 0.0, 360.0, 480.0),
    mouse: (0.0, 0.0),
    last_pan: (0.0, 0.0),
    is_panning: false,
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
        for l in s.links.iter() {
            if l.from == cur && !visited[l.to] {
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

impl GraphState {
    pub fn auto_layout(&mut self) {
        let num_nodes = self.nodes.len();
        if num_nodes == 0 {
            return;
        }

        let mut layers = [0usize; MAX_NODES];

        let mut changed = true;
        let mut passes = 0;

        while changed && passes < num_nodes {
            changed = false;
            for link in self.links.iter() {
                if link.from < num_nodes && link.to < num_nodes {
                    let source_layer = layers[link.from];
                    let target_layer = layers[link.to];

                    if target_layer <= source_layer {
                        layers[link.to] = source_layer + 1;
                        changed = true;
                    }
                }
            }
            passes += 1;
        }

        let mut max_layer = 0;
        for l in layers.iter().take(num_nodes) {
            if *l > max_layer {
                max_layer = *l;
            }
        }

        const X_SPACING: f32 = 260.0;
        const Y_SPACING: f32 = 40.0;
        let start_x = 100.0;
        let start_y = 100.0;

        for current_layer in 0..=max_layer {
            let current_x = start_x + (current_layer as f32 * X_SPACING);
            let mut current_y = start_y;

            for (i, l) in layers.iter().enumerate().take(num_nodes) {
                if *l == current_layer {
                    let node = &mut self.nodes[i];
                    node.x = current_x;
                    node.y = current_y;

                    current_y += node.height() + Y_SPACING;
                }
            }
        }
    }
}
