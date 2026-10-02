#![allow(static_mut_refs)]
#![cfg_attr(not(test), no_std)]

use crate::graph::{NodeKind, state};

mod ffi;
mod graph;
mod log;

extern crate alloc;

#[cfg(not(test))]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[cfg(not(test))]
#[panic_handler]
fn panic(info: &core::panic::PanicInfo) -> ! {
    use crate::log::LogArg;
    use core::fmt::{Result, Write};
    struct W;
    impl Write for W {
        fn write_str(&mut self, s: &str) -> Result {
            s.log();
            Ok(())
        }
    }
    let _ = write!(W, "{info}");
    crate::console_print!();
    core::arch::wasm32::unreachable()
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
pub extern "C" fn add_link(s1: u16, s2: u8, t1: u16, t2: u8) -> i32 {
    state().link((s1, s2), (t1, t2)).map_or(-1, |i| i as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn remove_link(idx: u16) {
    let links = &mut state().links;
    if (idx as usize) < links.len() {
        links.swap_remove(idx as usize);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn node_sockets(idx: u16) -> i32 {
    state()
        .sockets(idx as usize)
        .map_or(-1, |(i, o)| (i as i32) | ((o as i32) << 8))
}

#[unsafe(no_mangle)]
pub extern "C" fn node_has_widget(idx: u16) -> bool {
    state()
        .kind(idx as usize)
        .is_some_and(|k| k.as_node().has_widget())
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
pub extern "C" fn add_node(kind: u8, x: f32, y: f32, w: f32, h: f32) -> i32 {
    let s = state();
    NodeKind::from_u8(kind)
        .and_then(|k| s.add_node(k, [x, y], [w, h]))
        .map(|off| (s.arena.base() + off as usize) as i32)
        .unwrap_or(-1)
}

#[unsafe(no_mangle)]
pub extern "C" fn rope_pin(id: i32, ax: f64, ay: f64, bx: f64, by: f64) {
    state().rope_pin(id, [ax, ay], [bx, by])
}

#[unsafe(no_mangle)]
pub extern "C" fn rope_drop(id: i32) {
    state().rope_drop(id)
}

#[unsafe(no_mangle)]
pub extern "C" fn rope_rename(from: i32, to: i32) {
    state().rope_rename(from, to)
}

#[unsafe(no_mangle)]
pub extern "C" fn rope_step(dt: f64) -> bool {
    state().rope_step(dt)
}

#[unsafe(no_mangle)]
pub extern "C" fn rope_hit(x: f64, y: f64, r: f64) -> i32 {
    state().rope_hit(x, y, r)
}

#[unsafe(no_mangle)]
pub extern "C" fn rope_segments(hot: i32) -> u32 {
    state().rope_segments(hot) as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn rope_out() -> i32 {
    state().rope_out.as_ptr() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn scope_fill(node: u16, widget: u8) -> u32 {
    graph::scope::fill(state(), node as usize, widget) as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn scope_ptr() -> i32 {
    graph::scope::buf() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn param_text(idx: u16, i: u8) -> u32 {
    state().param_text(idx as usize, i as usize) as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn param_text_ptr() -> i32 {
    graph::param_text_ptr() as i32
}
