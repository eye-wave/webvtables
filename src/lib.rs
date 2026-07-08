#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]
#![allow(static_mut_refs)]

extern crate alloc;

#[cfg(all(target_arch = "wasm32", not(test)))]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

#[cfg(all(not(target_arch = "wasm32"), not(test)))]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    loop {}
}

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

mod api;
mod draw;
mod ffi;
mod geom;
mod graph;
mod log;
mod str;

use draw::{Draw, drawbuf};
use graph::*;

pub use str::*;

#[unsafe(no_mangle)]
pub extern "C" fn init() {
    let s = state();

    // heap-allocated once here instead of a static array, to keep it out of the binary.
    s.buffers = Some(alloc::vec![ZERO_BUFFER; MAX_NODES].into_boxed_slice());

    s.nodes[0] = Node::new(NodeKind::BasicShapes, 40.0, 40.0);
    s.nodes[1] = Node::new(NodeKind::Output, 340.0, 40.0);

    s.nodes[0].params[0].as_mut().unwrap().set_value_norm(1.0);

    s.node_count = 2;

    s.links[0] = Some(Link::new(0, 0, 1, 0));

    s.version += 1;
    render();
}

#[unsafe(no_mangle)]
pub extern "C" fn iter_all_nodes() {
    for node in NodeKind::iter() {
        let title = node.title();

        for cat in node.as_node().category() {
            let cat = cat.as_str();

            ffi::push_node_name(title.as_ptr(), title.len(), cat.as_ptr(), cat.len());
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn render() {
    let s = state();
    s.viewport_bounds = (
        0.0,
        HEADER_HEIGHT,
        s.viewport.0,
        s.viewport.1 * KEYFRAME_POS_PERCENT,
    );

    process_graph(s);

    let ctx = drawbuf();
    ctx.begin_frame();

    for (i, slot) in s.links.iter().enumerate() {
        if let Some(link) = slot {
            link.draw(i, s, ctx);
        }
    }

    if let Some((from, from_socket)) = s.pending_link_from {
        let (fx, fy) = output_pos(&s.nodes[from], from_socket);

        ctx.stroke_style([210, 180, 60]);
        ctx.line_width(2.0);

        ctx.stroke_line(fx, fy, s.mouse.0, s.mouse.1, true);
    }

    for (i, node) in s.nodes.iter().take(s.node_count).enumerate() {
        if geom::is_out_of_bounds(node.x, node.y, node.x + Node::W, node.y + node.height()) {
            continue;
        }

        node.draw(i, s, ctx);
    }

    CameraWidget.draw(0, s, ctx);
    Header.draw(0, s, ctx);
    KeyframeRuler.draw(0, s, ctx);
    KeyframeLanes.draw(0, s, ctx);

    let (ptr, len) = ctx.as_ptr_len();
    ffi::draw_flush(ptr, len);
}
