use alloc::vec;
use alloc::vec::Vec;
use serde::{Deserialize, Serialize};

pub use self::arena::Arena;
pub use self::keyframes::Keyframes;
pub use self::label::{Label, Labels, label, labels};
pub use self::link::Link;
pub use self::node::NodeKind;
pub use self::param::{Param, text_ptr as param_text_ptr};
use self::rope::Rope;

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

#[derive(Serialize, Deserialize)]
pub struct State {
    pub links: Vec<Link>,
    pub nodes: Vec<u32>,
    pub arena: Arena,
    pub keyframes: Keyframes,
    #[serde(skip)]
    pub ropes: Vec<Rope>,
    #[serde(skip)]
    pub rope_acc: f64,
    #[serde(skip)]
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
            rope_out: vec![],
        }
    }
}

static mut STATE: State = State::new();

#[inline]
pub fn state() -> &'static mut State {
    unsafe { &mut STATE }
}
