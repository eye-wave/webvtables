use alloc::vec;
use alloc::vec::Vec;

pub use self::arena::Arena;
pub use self::link::Link;
pub use self::node::NodeKind;
pub use self::param::Param;
use self::rope::Rope;

mod arena;
mod link;
mod node;
mod param;
mod rope;
pub mod scope;

pub const MAX_PARAMS: usize = 8;

pub struct State {
    pub links: Vec<Link>,
    pub nodes: Vec<u32>,
    pub arena: Arena,
    pub ropes: Vec<Rope>,
    pub rope_acc: f64,
    pub rope_out: Vec<f32>,
}

impl State {
    pub const fn new() -> Self {
        Self {
            links: vec![],
            nodes: vec![],
            arena: Arena::new(),
            ropes: vec![],
            rope_acc: 0.0,
            rope_out: vec![],
        }
    }
}

static mut STATE: State = State::new();

#[inline]
pub fn state() -> &'static mut State {
    unsafe { &mut STATE }
}
