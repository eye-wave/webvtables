use crate::graph::*;

// Was: a `PackPtr` trait + `SerializationResult`/`BufferFrame` structs, both
// implementing it identically. Both call sites just want (ptr, len) packed
// into a u64 for the FFI boundary - one function does it.
fn pack_ptr_len(ptr_addr: u64, len: usize) -> u64 {
    (ptr_addr << 32) | (len as u64)
}

#[unsafe(no_mangle)]
pub extern "C" fn serialize_graph() -> u64 {
    let s = state();

    let buf = s.serialize();
    let mut boxed_slice = buf.into_boxed_slice();
    let ptr = boxed_slice.as_mut_ptr();
    let len = boxed_slice.len();

    core::mem::forget(boxed_slice);
    pack_ptr_len(ptr as u64, len)
}

#[unsafe(no_mangle)]
pub extern "C" fn free_buffer(ptr: *mut u8, len: usize) {
    if !ptr.is_null() && len > 0 {
        unsafe {
            let _ = alloc::boxed::Box::from_raw(core::ptr::slice_from_raw_parts_mut(ptr, len));
        };
    }
}

/// # Safety
///
/// Allocates a chunk of heap memory of `len` bytes for JavaScript to write into.
/// The JavaScript side must pass this exact pointer back into `patch_graph`
/// to ensure the memory is properly freed and not leaked.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn allocate_patch_buffer(len: usize) -> *mut u8 {
    let mut buf = alloc::vec![0u8; len].into_boxed_slice();
    let ptr = buf.as_mut_ptr();

    core::mem::forget(buf);
    ptr
}

/// # Safety
///
/// This function is unsafe because it dereferences the raw pointer `buf_ptr`.
/// The caller must guarantee that `buf_ptr` points to `buf_len` contiguous bytes of
/// valid, initialized memory containing valid serialized data.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn patch_graph(buf_ptr: *mut u8, buf_len: usize) -> i8 {
    if buf_ptr.is_null() || buf_len == 0 {
        return -1;
    }

    let bytes_slice = unsafe { core::slice::from_raw_parts_mut(buf_ptr, buf_len) };
    let _boxed_buffer = unsafe { alloc::boxed::Box::from_raw(bytes_slice) };

    let s = state();
    s.patch_from_bytes(bytes_slice)
}

#[unsafe(no_mangle)]
pub extern "C" fn get_generated_frame() -> u64 {
    let s = state();

    for (i, node) in s.nodes.iter().enumerate() {
        if let NodeKind::Output = node.kind {
            if let Some(ref bufs) = s.buffers
                && i < bufs.len()
            {
                let buffer_slice = bufs[i].as_slice();
                return pack_ptr_len(
                    buffer_slice.as_ptr() as u64,
                    core::mem::size_of_val(buffer_slice),
                );
            }
            break;
        }
    }

    pack_ptr_len(0, 0)
}
