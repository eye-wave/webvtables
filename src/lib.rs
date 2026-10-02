#![allow(static_mut_refs)]
#![no_std]

use crate::graph::{NodeKind, state};

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
pub extern "C" fn add_link(s1: u16, s2: u8, t1: u16, t2: u8) -> i32 {
    state().link((s1, s2), (t1, t2)).map_or(-1, |i| i as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn node_sockets(idx: u16) -> i32 {
    state()
        .sockets(idx as usize)
        .map_or(-1, |(i, o)| (i as i32) | ((o as i32) << 8))
}

#[unsafe(no_mangle)]
pub extern "C" fn nodes_len() -> u16 {
    state().nodes.len() as u16
}

#[unsafe(no_mangle)]
pub extern "C" fn get_node(idx: u16) -> i32 {
    let s = state();
    s.nodes
        .get(idx as usize)
        .map(|&off| (s.arena.base() + off as usize) as i32)
        .unwrap_or(-1)
}

#[unsafe(no_mangle)]
pub extern "C" fn get_param(idx: u16, i: u8) -> i32 {
    state()
        .param_addr(idx as usize, i as usize)
        .map_or(-1, |a| a as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn add_node(kind: u8, x: f32, y: f32, w: f32, h: f32, n_params: u8) -> i32 {
    let s = state();
    NodeKind::from_u8(kind)
        .and_then(|k| s.add_node(k, [x, y], [w, h], n_params))
        .map(|off| (s.arena.base() + off as usize) as i32)
        .unwrap_or(-1)
}
