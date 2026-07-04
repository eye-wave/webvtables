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

use crate::js;

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

    fn push_byte(&mut self, b: u8) {
        if self.len < N {
            self.buf[self.len] = b;
            self.len += 1;
        }
    }

    fn push_str(&mut self, s: &str) {
        let bytes = s.as_bytes();
        let end = (self.len + bytes.len()).min(N);
        self.buf[self.len..end].copy_from_slice(&bytes[..end - self.len]);
        self.len = end;
    }

    /// Writes a signed decimal integer. Replaces `write!("{}", v)`.
    fn push_int(&mut self, mut v: i64) {
        if v < 0 {
            self.push_byte(b'-');
            v = -v;
        }
        let mut digits = [0u8; 20];
        let mut n = 0;
        if v == 0 {
            digits[0] = b'0';
            n = 1;
        }
        while v > 0 {
            digits[n] = b'0' + (v % 10) as u8;
            v /= 10;
            n += 1;
        }
        for i in (0..n).rev() {
            self.push_byte(digits[i]);
        }
    }

    fn push_fixed2(&mut self, v: f64) {
        let scaled = js::round(v * 100.0) as i64;
        let (neg, scaled) = if scaled < 0 {
            (true, -scaled)
        } else {
            (false, scaled)
        };
        if neg {
            self.push_byte(b'-');
        }
        self.push_int(scaled / 100);
        self.push_byte(b'.');
        let frac = (scaled % 100) as u8;
        self.push_byte(b'0' + frac / 10);
        self.push_byte(b'0' + frac % 10);
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
