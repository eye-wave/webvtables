use alloc::boxed::Box;
use alloc::vec::Vec;

use heapless::vec::Vec as HVec;

mod buffer;
mod keyframes;
mod link;
mod node;
mod param;
mod serialize;
mod socket;
mod ui;

pub use buffer::*;
pub use keyframes::*;
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
    pub const MAX_NODE_INPUTS: usize = 4;
    pub const MAX_NODE_OUTPUTS: usize = 4;

    /// Wavetable morph axis: one rendered frame per keyframe-ruler position.
    pub const MAX_FRAMES: usize = 256;

    pub const SOCKET_R: f32 = 5.0;
    pub const SOCKET_HIT_R2: f32 = 10.0 * 10.0;
    pub const LINK_HIT_DIST2: f32 = 6.0 * 6.0;
}

pub use consts::*;

use crate::FixedStr;

pub struct GraphState {
    pub nodes: HVec<Node, MAX_NODES>,
    pub links: HVec<Link, MAX_LINKS>,
    pub dragging_node: Option<usize>,
    pub drag_offset: (f32, f32),
    pub dragging_param: Option<(usize, usize)>,
    pub drag_param_start_y: f32,
    pub drag_param_start_value: f64,
    pub buttons: [Button; 1],
    pub knobs: [Knob; 2],
    pub lanes: HVec<KeyframeLane, 10>,
    pub keyframes: Vec<Keyframe>,
    pub dragging_keyframe: Option<usize>,
    /// (lane, timestamp) of the last keyframe-toggle mousedown, used to
    /// debounce double/duplicate hits (e.g. a fast double-click or the
    /// synthetic re-hit-test from `on_dbl_click`) that would otherwise
    /// toggle the lane on and immediately back off.
    pub last_keyframe_toggle: Option<(KeyframeLane, f64)>,
    /// Global playhead position (0..255), shown as the draggable green
    /// dot in the keyframe ruler.
    pub current_frame: u8,
    pub dragging_playhead: bool,
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
    /// Each node's most recently computed single-cycle output frame.
    /// heap-allocated (see `init()`) instead of a static array, so
    /// it doesn't inflate the binary; `None` only before init() runs.
    pub buffers: Option<Box<[[Buffer; MAX_NODE_OUTPUTS]]>>,
    /// Baked wavetable: `MAX_FRAMES` single-cycle frames, one per morph
    /// position, each `BUFFER_LEN` samples. Heap-allocated in `init()`
    /// like `buffers`. Only rebuilt on `bake_wavetable()`, not on every
    /// param drag tick — see that function's doc comment.
    pub wavetable: Option<Box<[Buffer]>>,
}

pub const SYM_LOG_10: f64 = 2.3978952727983707;
pub const SYM_LOG_12000: f64 = 9.392745258631441;

static mut STATE: GraphState = GraphState {
    nodes: HVec::new(),
    links: HVec::new(),
    dragging_node: None,
    drag_offset: (0.0, 0.0),
    dragging_param: None,
    drag_param_start_y: 0.0,
    drag_param_start_value: 0.0,
    buttons: [Button {
        x: 5.0,
        y: 10.0,
        w: 50.0,
        h: 20.0,
        color: [240, 80, 90],
        txt_color: [255, 255, 255],
        text: FixedStr::from_str("Play"),
    }],
    knobs: [
        Knob {
            x: 90.0,
            y: 15.0,
            r: 13.0,
            color: [140, 200, 140],
            param: Param::new_linear("", 0.0, 100.0).with_unit("%"),
        },
        Knob {
            x: 160.0,
            y: 15.0,
            r: 13.0,
            color: [140, 200, 200],
            param: Param::new_log_const("", SYM_LOG_10, SYM_LOG_12000).with_unit("hz"),
        },
    ],
    lanes: HVec::new(),
    keyframes: Vec::new(),
    dragging_keyframe: None,
    last_keyframe_toggle: None,
    current_frame: 0,
    dragging_playhead: false,
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
    buffers: None,
    wavetable: None,
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
    /// At most one `Output` node may exist in the graph — it's the single
    /// sink `bake_wavetable()` reads from. Enforced at every node-creation
    /// site (`add_node`, graph deserialize).
    pub fn has_output_node(&self) -> bool {
        self.nodes.iter().any(|n| n.kind == NodeKind::Output)
    }

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
