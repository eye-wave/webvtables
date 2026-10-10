#![allow(static_mut_refs)]
#![cfg_attr(target_arch = "wasm32", feature(wasm_numeric_instr))]
#![cfg_attr(not(test), no_std)]

use crate::graph::{NodeKind, keyframes, state};

mod ffi;
mod graph;
mod log;

extern crate alloc;

#[cfg(not(test))]
#[global_allocator]
static ALLOC: dlmalloc::GlobalDlmalloc = dlmalloc::GlobalDlmalloc;

#[cfg(not(test))]
#[panic_handler]
fn panic(info: &core::panic::PanicInfo) -> ! {
    use core::fmt::Write;

    static mut BUF: log::Buf<256> = log::Buf::new();
    let buf = unsafe { &mut BUF };
    buf.clear();
    let _ = write!(buf, "panic: {info}");
    crate::console_print!(buf.as_str());
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
pub extern "C" fn remove_node(idx: u16) {
    state().remove_node(idx as usize)
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
pub extern "C" fn data_alloc(idx: u16, frames: u16) -> i32 {
    state()
        .data_alloc(idx as usize, frames as usize)
        .map_or(-1, |p| p as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn data_free(idx: u16) {
    state().data_free(idx as usize)
}

#[unsafe(no_mangle)]
pub extern "C" fn data_frames(idx: u16) -> u32 {
    state().data_frames(idx as usize) as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn data_ptr(idx: u16) -> i32 {
    state()
        .data_of(idx as usize)
        .map_or(-1, |d| d.as_ptr() as i32)
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
pub extern "C" fn rope_cfg(i: i32, v: f64) {
    state().rope_cfg(i, v)
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
pub extern "C" fn scope_begin() {
    graph::scope::begin(state())
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
pub extern "C" fn node_kind(idx: u16) -> i32 {
    state().kind(idx as usize).map_or(-1, |k| k as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn kf_apply(frame: f32) -> u32 {
    state().apply_keyframes(frame) as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn kf_driven_ptr() -> i32 {
    keyframes::driven_ptr() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn lane_dump() -> u32 {
    state().lane_dump() as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn lane_dump_ptr() -> i32 {
    keyframes::dump_ptr() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn lane_curve(lane: u16) -> u32 {
    state().lane_curve(lane as usize) as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn lane_curve_ptr() -> i32 {
    keyframes::curve_ptr() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn lane_targets(lane: u16) -> u32 {
    state().lane_targets(lane as usize) as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn lane_targets_ptr() -> i32 {
    keyframes::targets_ptr() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn lane_add(kind: u8) -> i32 {
    state().lane_add(kind).map_or(-1, |i| i as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn lane_mode(lane: u16, mode: u8) -> bool {
    state().lane_mode(lane as usize, mode)
}

#[unsafe(no_mangle)]
pub extern "C" fn mix_ptr() -> i32 {
    keyframes::mix_ptr() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn mix(mode: u8, m: f32) {
    keyframes::mix(mode, m)
}

#[unsafe(no_mangle)]
pub extern "C" fn lane_remove(lane: u16) {
    state().lane_remove(lane as usize)
}

#[unsafe(no_mangle)]
pub extern "C" fn lane_link(lane: u16, node_addr: u32, param: u8, on: bool) -> bool {
    state().lane_link(lane as usize, node_addr as usize, param, on)
}

#[unsafe(no_mangle)]
pub extern "C" fn lane_rename(lane: u16, len: u32) -> bool {
    let name = unsafe { &keyframes::NAME };
    state().lane_rename(lane as usize, &name[..(len as usize).min(name.len())])
}

#[unsafe(no_mangle)]
pub extern "C" fn lane_name(lane: u16) -> u32 {
    let Some(l) = state().keyframes.lanes.get(lane as usize) else {
        return 0;
    };
    let buf = unsafe { &mut keyframes::NAME };
    buf[..l.name.len()].copy_from_slice(l.name.as_bytes());
    l.name.len() as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn lane_name_ptr() -> i32 {
    keyframes::name_ptr() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn key_add(lane: u16, t: u8, v: f32) -> i32 {
    state()
        .key_add(lane as usize, t, v)
        .map_or(-1, |i| i as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn key_set(lane: u16, idx: u16, t: u8, v: f32) -> bool {
    state().key_set(lane as usize, idx as usize, t, v)
}

#[unsafe(no_mangle)]
pub extern "C" fn key_curve(lane: u16, idx: u16, c: f32) -> bool {
    state().key_curve(lane as usize, idx as usize, c)
}

#[unsafe(no_mangle)]
pub extern "C" fn key_remove(lane: u16, idx: u16) {
    state().key_remove(lane as usize, idx as usize)
}

#[unsafe(no_mangle)]
pub extern "C" fn lfo_set(lane: u16, j: u8, v: f32) -> bool {
    state().lfo_set(lane as usize, j as usize, v)
}

// Text projects are parsed in JS and replayed through the calls above onto a fresh state.
#[unsafe(no_mangle)]
pub extern "C" fn project_new() {
    *state() = graph::State::new();
}

#[unsafe(no_mangle)]
pub extern "C" fn param_text(idx: u16, i: u8) -> u32 {
    state().param_text(idx as usize, i as usize) as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn param_denorm(idx: u16, i: u8, n: f64) -> f64 {
    state().param_denorm(idx as usize, i as usize, n)
}

#[unsafe(no_mangle)]
pub extern "C" fn param_norm(idx: u16, i: u8, d: f64) -> f64 {
    state().param_norm(idx as usize, i as usize, d)
}

#[unsafe(no_mangle)]
pub extern "C" fn param_set_denorm(idx: u16, i: u8, v: f64) -> bool {
    state().param_set_denorm(idx as usize, i as usize, v)
}

#[unsafe(no_mangle)]
pub extern "C" fn param_text_ptr() -> i32 {
    graph::param_text_ptr() as i32
}
