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

    s.buffers = Some(alloc::vec![ZERO_BUFFER; MAX_NODES].into_boxed_slice());

    let _ = s.nodes.push(Node::new(NodeKind::BasicShapes, 240.0, 240.0));
    let _ = s.nodes.push(Node::new(NodeKind::Output, 500.0, 240.0));

    s.node_count = 2;

    let _ = s.links.push(Link::new(0, 0, 1, 0));

    let mut text = FixedStr::new();
    text.push_str("Play");
    let btn = Button {
        x: 5.0,
        y: 5.0,
        w: 50.0,
        h: 20.0,
        color: [240, 80, 90],
        txt_color: [255, 255, 255],
        text,
    };

    let _ = s.buttons.push(btn);

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

    Background.draw(0, s, ctx);

    for (i, link) in s.links.iter().enumerate() {
        link.draw(i, s, ctx);
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

    for (i, btn) in s.buttons.iter().enumerate() {
        btn.draw(i, s, ctx);
    }

    KeyframeRuler.draw(0, s, ctx);
    KeyframeLanes.draw(0, s, ctx);

    let (ptr, len) = ctx.as_ptr_len();
    ffi::draw_flush(ptr, len);
}
