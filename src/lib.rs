#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]
#![allow(static_mut_refs)]

extern crate alloc;

#[cfg(all(target_arch = "wasm32", not(test)))]
#[panic_handler]
fn panic(info: &core::panic::PanicInfo) -> ! {
    struct FixedBuf<'a> {
        buf: &'a mut [u8],
        pos: usize,
    }

    impl<'a> core::fmt::Write for FixedBuf<'a> {
        fn write_str(&mut self, s: &str) -> core::fmt::Result {
            let bytes = s.as_bytes();
            let remaining = self.buf.len() - self.pos;
            let n = bytes.len().min(remaining);
            self.buf[self.pos..self.pos + n].copy_from_slice(&bytes[..n]);
            self.pos += n;
            Ok(())
        }
    }

    use core::fmt::Write;

    let mut buf = [0u8; 256];
    let pos = {
        let mut w = FixedBuf {
            buf: &mut buf,
            pos: 0,
        };
        let _ = write!(w, "{}", info);
        w.pos
    };

    let msg = core::str::from_utf8(&buf[..pos]).unwrap_or("panic (invalid utf8)");
    console_print!(msg);

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

use crate::draw::RENDER_STATS;

#[unsafe(no_mangle)]
pub extern "C" fn init() {
    let s = state();

    s.buffers = Some(alloc::vec![[ZERO_BUFFER;MAX_NODE_OUTPUTS]; MAX_NODES].into_boxed_slice());
    s.wavetable = Some(alloc::vec![ZERO_BUFFER; MAX_FRAMES].into_boxed_slice());

    let _ = s.nodes.push(Node::new(NodeKind::BasicShapes, 240.0, 240.0));
    let _ = s.nodes.push(Node::new(NodeKind::Output, 500.0, 240.0));

    let _ = s.links.push(Link::new(0, 0, 1, 0));

    let _ = s.lanes.push(KeyframeLane {
        node_id: 0,
        param_id: 0,
    });

    process();
    render();
}

/// Runs node processing, recomputing each node's single-cycle
/// output frame.
#[unsafe(no_mangle)]
pub extern "C" fn process() {
    process_graph(state());
    render();
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

    for (i, node) in s.nodes.iter().enumerate() {
        if geom::is_out_of_bounds(node.x, node.y, node.x + Node::W, node.y + node.height()) {
            continue;
        }

        node.draw(i, s, ctx);
    }

    CameraWidget.draw(0, s, ctx);
    RendererWidget.draw(0, s, ctx);
    Header.draw(0, s, ctx);

    for (i, btn) in s.buttons.iter().enumerate() {
        btn.draw(i, s, ctx);
    }

    for (i, knob) in s.knobs.iter().enumerate() {
        knob.draw(i, s, ctx);
    }

    KeyframeRuler.draw(0, s, ctx);
    KeyframeLanes.draw(0, s, ctx);

    for (i, lane) in s.lanes.iter().enumerate() {
        lane.draw(i, s, ctx);
    }

    for (i, keyframe) in s.keyframes.iter().enumerate() {
        keyframe.draw(i, s, ctx);
    }

    WavetableWidget.draw(0, s, ctx);

    let (ptr, len) = ctx.as_ptr_len();
    ffi::draw_flush(ptr, len);

    unsafe {
        RENDER_STATS.refresh();
    }
}
