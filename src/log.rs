use crate::ffi;

#[allow(unused)]
pub trait LogArg {
    fn log(&self);
}

impl LogArg for &str {
    fn log(&self) {
        let bytes = self.as_bytes();
        ffi::log_str(bytes.as_ptr(), bytes.len());
    }
}

impl LogArg for bool {
    fn log(&self) {
        ffi::log_bool(*self)
    }
}

macro_rules! impl_int_log {
    ($($t:ty),*) => {
        $(impl LogArg for $t {
            fn log(&self) { ffi::log_i32(*self as i32); }
        })*
    };
}
impl_int_log!(i8, i16, i32, u8, u16, u32);

macro_rules! impl_wide_int_log {
    ($($t:ty),*) => {
        $(impl LogArg for $t {
            fn log(&self) { ffi::log_f64(*self as f64); }
        })*
    };
}

impl_wide_int_log!(i64, u64, isize, usize);

impl LogArg for f32 {
    fn log(&self) {
        ffi::log_f64(*self as f64);
    }
}
impl LogArg for f64 {
    fn log(&self) {
        ffi::log_f64(*self);
    }
}

#[macro_export]
macro_rules! console_print {
    ($($arg:expr),* $(,)?) => {{
        $( $crate::log::LogArg::log(&$arg); )*
        $crate::ffi::log_flush();
    }};
}

pub struct Buf<const N: usize> {
    b: [u8; N],
    n: usize,
}

impl<const N: usize> Buf<N> {
    pub const fn new() -> Self {
        Self { b: [0; N], n: 0 }
    }

    pub fn clear(&mut self) {
        self.n = 0;
    }

    pub fn as_str(&self) -> &str {
        core::str::from_utf8(&self.b[..self.n]).unwrap_or("?")
    }
}

impl<const N: usize> core::fmt::Write for Buf<N> {
    fn write_str(&mut self, s: &str) -> core::fmt::Result {
        for c in s.chars() {
            if self.n + c.len_utf8() > N {
                break;
            }
            self.n += c.encode_utf8(&mut self.b[self.n..]).len();
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::Buf;
    use core::fmt::Write;

    #[test]
    fn buf_truncates_on_char_boundary() {
        let mut b = Buf::<8>::new();
        write!(b, "ab{}é{}", 1, "xyzzy").unwrap();
        assert_eq!(b.as_str(), "ab1éxyz");
        b.clear();
        write!(b, "é").unwrap();
        assert_eq!(b.as_str(), "é");
    }
}
