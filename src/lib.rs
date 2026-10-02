#![allow(static_mut_refs)]
#![no_std]

use alloc::vec;
use alloc::vec::Vec;

extern crate alloc;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[repr(C)]
struct Link {
    source: u16,
    source_socket: u8,
    target: u16,
    target_socket: u8,
}

struct State {
    links: Vec<Link>,
}

impl State {
    pub const fn new() -> Self {
        Self { links: vec![] }
    }
}

static mut STATE: State = State::new();

#[inline]
fn state() -> &'static mut State {
    unsafe { &mut STATE }
}

#[unsafe(no_mangle)]
pub extern "C" fn links_len() -> u16 {
    state().links.len() as u16
}

#[unsafe(no_mangle)]
pub extern "C" fn get_link(idx: u16) -> i32 {
    state()
        .links
        .get(idx as usize)
        .map(|link| link as *const _ as i32)
        .unwrap_or(-1)
}

#[unsafe(no_mangle)]
pub extern "C" fn add_link(s1: u16, s2: u8, t1: u16, t2: u8) {
    state().links.push(Link {
        source: s1,
        source_socket: s2,
        target: t1,
        target_socket: t2,
    });
}
