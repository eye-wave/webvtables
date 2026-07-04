use crate::js;

pub trait LogArg {
    fn log(&self);
}

impl LogArg for &str {
    fn log(&self) {
        let bytes = self.as_bytes();
        js::log_str(bytes.as_ptr(), bytes.len());
    }
}

macro_rules! impl_int_log {
    ($($t:ty),*) => {
        $(impl LogArg for $t {
            fn log(&self) { js::log_i32(*self as i32); }
        })*
    };
}
impl_int_log!(i8, i16, i32, u8, u16, u32);

macro_rules! impl_wide_int_log {
    ($($t:ty),*) => {
        $(impl LogArg for $t {
            fn log(&self) { js::log_f64(*self as f64); }
        })*
    };
}

impl_wide_int_log!(i64, u64, isize, usize);

impl LogArg for f32 {
    fn log(&self) {
        js::log_f64(*self as f64);
    }
}
impl LogArg for f64 {
    fn log(&self) {
        js::log_f64(*self);
    }
}

#[macro_export]
macro_rules! console_print {
    ($($arg:expr),* $(,)?) => {{
        $( $crate::log::LogArg::log(&$arg); )*
        $crate::js::log_flush();
    }};
}
