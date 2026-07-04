use core::fmt::Write;

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

pub struct FixedStr<const N: usize> {
    buf: [u8; N],
    len: usize,
}

impl<const N: usize> FixedStr<N> {
    fn new() -> Self {
        Self {
            buf: [0; N],
            len: 0,
        }
    }

    fn as_str(&self) -> &str {
        core::str::from_utf8(&self.buf[..self.len]).unwrap_or("")
    }
}

impl<const N: usize> Write for FixedStr<N> {
    fn write_str(&mut self, s: &str) -> core::fmt::Result {
        let bytes = s.as_bytes();
        let end = (self.len + bytes.len()).min(N);
        self.buf[self.len..end].copy_from_slice(&bytes[..end - self.len]);
        self.len = end;
        Ok(())
    }
}

pub struct GraphState {
    pub nodes: [Node; MAX_NODES],
    pub node_count: usize,
    pub links: [Option<Link>; MAX_LINKS],
    pub dragging_node: Option<usize>,
    pub drag_offset: (f32, f32),
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
    pending_link_from: None,
    hovered_link: None,
    hovered_socket: None,
    mouse: (0.0, 0.0),
    version: 0,
};

pub fn state() -> &'static mut GraphState {
    unsafe { &mut STATE }
}

pub fn point_in_rect(px: f32, py: f32, x: f32, y: f32, w: f32, h: f32) -> bool {
    px >= x && px <= x + w && py >= y && py <= y + h
}

pub fn point_segment_dist2(px: f32, py: f32, x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
    let (dx, dy) = (x2 - x1, y2 - y1);
    let len2 = dx * dx + dy * dy;
    let t = if len2 > 0.0 {
        (((px - x1) * dx + (py - y1) * dy) / len2).clamp(0.0, 1.0)
    } else {
        0.0
    };
    dist2(px, py, x1 + dx * t, y1 + dy * t)
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
