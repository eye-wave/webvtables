#![allow(static_mut_refs)]
#![no_std]

use crate::graph::{Link, NodeKind, state};

mod ffi;
mod graph;
mod log;

extern crate alloc;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

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
    state().links.push(Link::new(s1, s2, t1, t2));
}

#[unsafe(no_mangle)]
pub extern "C" fn nodes_len() -> u16 {
    state().nodes.len() as u16
}

/// Address of node `idx` in wasm memory (stable: the arena is static), or -1.
#[unsafe(no_mangle)]
pub extern "C" fn get_node(idx: u16) -> i32 {
    let s = state();
    s.nodes
        .get(idx as usize)
        .map(|&off| (s.arena.base() + off as usize) as i32)
        .unwrap_or(-1)
}

/// Returns the node's address, or -1 on bad kind / arena full.
#[unsafe(no_mangle)]
pub extern "C" fn add_node(kind: u8, x: f32, y: f32, w: f32, h: f32, n_params: u8) -> i32 {
    let s = state();
    NodeKind::from_u8(kind)
        .and_then(|k| s.add_node(k, [x, y], [w, h], n_params))
        .map(|off| (s.arena.base() + off as usize) as i32)
        .unwrap_or(-1)
}
