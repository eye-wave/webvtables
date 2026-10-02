use core::mem::{align_of, size_of};
use core::slice::{from_raw_parts, from_raw_parts_mut};

const CAP: usize = 64 * 1024;

#[repr(C, align(16))]
pub struct Arena {
    buf: [u8; CAP],
    top: usize,
}

impl Arena {
    pub const fn new() -> Self {
        Self {
            buf: [0; CAP],
            top: 0,
        }
    }

    pub fn base(&self) -> usize {
        self.buf.as_ptr() as usize
    }

    pub fn alloc<T>(&mut self, n: usize) -> Option<u32> {
        let start = self.top.next_multiple_of(align_of::<T>());
        let end = start.checked_add(size_of::<T>().checked_mul(n)?)?;
        if end > CAP {
            return None;
        }
        self.top = end;
        Some(start as u32)
    }

    pub fn slice<T>(&self, off: u32, n: usize) -> &[T] {
        unsafe { from_raw_parts(self.buf.as_ptr().add(off as usize).cast(), n) }
    }

    pub fn slice_mut<T>(&mut self, off: u32, n: usize) -> &mut [T] {
        unsafe { from_raw_parts_mut(self.buf.as_mut_ptr().add(off as usize).cast(), n) }
    }
}
