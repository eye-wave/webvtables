use alloc::vec;
use alloc::vec::Vec;

pub use self::arena::Arena;
pub use self::link::Link;
pub use self::node::NodeKind;

mod arena;
mod link;
mod node;

pub struct State {
    pub links: Vec<Link>,
    pub nodes: Vec<u32>,
    pub arena: Arena,
}

impl State {
    pub const fn new() -> Self {
        Self {
            links: vec![],
            nodes: vec![],
            arena: Arena::new(),
        }
    }
}

static mut STATE: State = State::new();

#[inline]
pub fn state() -> &'static mut State {
    unsafe { &mut STATE }
}
