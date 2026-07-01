#![allow(static_mut_refs)]
#![no_std]
#![no_main]

#[cfg(not(test))]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    unreachable!()
}

mod js;

const FRAME: usize = 128;
const MAX_NODES: usize = 32;
const SAMPLE_RATE: f32 = 44100.0;
const RECORD_LEN: usize = 5; // 1 byte type tag + 4 byte f32 param, little-endian

const TYPE_PHASOR: u8 = 0;
const TYPE_SINE: u8 = 1;
const TYPE_SQUARE: u8 = 2;
const TYPE_SAW: u8 = 3;
const TYPE_TRIANGLE: u8 = 4;
const TYPE_GAIN: u8 = 5;
const TYPE_OUTPUT: u8 = 6;

// ponytail: fixed static buffers instead of an allocator. no_std + no alloc
// keeps the wasm binary tiny and the JS side needs no bindgen glue, just
// pointer/length across the wasm boundary.
static mut INPUT_BUF: [u8; MAX_NODES * RECORD_LEN] = [0; MAX_NODES * RECORD_LEN];
static mut OUTPUT_BUF: [f32; FRAME] = [0.0; FRAME];
static mut PHASE: [f32; MAX_NODES] = [0.0; MAX_NODES];

#[unsafe(no_mangle)]
pub extern "C" fn input_ptr() -> *mut u8 {
    unsafe { INPUT_BUF.as_mut_ptr() }
}

#[unsafe(no_mangle)]
pub extern "C" fn input_capacity() -> u32 {
    (MAX_NODES * RECORD_LEN) as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn output_ptr() -> *const f32 {
    unsafe { OUTPUT_BUF.as_ptr() }
}

#[unsafe(no_mangle)]
pub extern "C" fn output_len() -> u32 {
    FRAME as u32
}

/// `len` is the number of valid bytes JS wrote into INPUT_BUF (node_count * 5).
/// Nodes are a flat chain in evaluation order: source first, output last.
#[unsafe(no_mangle)]
pub extern "C" fn render(len: u32) {
    let node_count = ((len as usize) / RECORD_LEN).min(MAX_NODES);

    unsafe {
        for s in 0..FRAME {
            let mut value = 0.0f32;
            for i in 0..node_count {
                let off = i * RECORD_LEN;
                let ty = INPUT_BUF[off];
                let param = f32::from_le_bytes([
                    INPUT_BUF[off + 1],
                    INPUT_BUF[off + 2],
                    INPUT_BUF[off + 3],
                    INPUT_BUF[off + 4],
                ]);
                value = eval_node(ty, param, value, &mut PHASE[i]);
            }
            OUTPUT_BUF[s] = value;
        }
    }
}

fn eval_node(ty: u8, param: f32, input: f32, phase: &mut f32) -> f32 {
    match ty {
        TYPE_PHASOR => {
            let p = *phase;
            let next = *phase + param / SAMPLE_RATE;
            *phase = next - js::floorf(next); // wrap to [0, 1)
            p
        }
        TYPE_SINE => js::sinf(input * core::f32::consts::TAU),
        TYPE_SQUARE => {
            if input < 0.5 {
                1.0
            } else {
                -1.0
            }
        }
        TYPE_SAW => input * 2.0 - 1.0,
        TYPE_TRIANGLE => 4.0 * js::fabsf(input - 0.5) - 1.0,
        TYPE_GAIN => input * param,
        TYPE_OUTPUT => input,
        _ => input,
    }
}
