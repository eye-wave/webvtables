use alloc::vec;
use alloc::vec::Vec;

pub use self::arena::Arena;
pub use self::keyframes::Keyframes;
pub use self::label::{Label, Labels, label, labels};
pub use self::link::Link;
pub use self::node::NodeKind;
pub use self::param::{Param, text_ptr as param_text_ptr};
use self::rope::{Phys, Rope};

mod arena;
pub mod keyframes;
mod label;
mod link;
mod node;
mod param;
pub mod project;
mod rope;
pub mod scope;

pub const MAX_PARAMS: usize = 8;

pub struct State {
    pub links: Vec<Link>,
    pub nodes: Vec<u32>,
    pub arena: Arena,
    pub keyframes: Keyframes,
    pub ropes: Vec<Rope>,
    pub rope_acc: f64,
    pub phys: Phys,
    pub rope_out: Vec<f32>,
}

impl State {
    pub const fn new() -> Self {
        Self {
            links: vec![],
            nodes: vec![],
            arena: Arena::new(),
            keyframes: Keyframes::new(),
            ropes: vec![],
            rope_acc: 0.0,
            phys: Phys::DEFAULT,
            rope_out: vec![],
        }
    }
}

static mut STATE: State = State::new();

#[inline]
pub fn state() -> &'static mut State {
    unsafe { &mut STATE }
}
