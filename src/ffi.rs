macro_rules! wasm_imports {
    (
        $(
            fn $name:ident(
                $($arg:ident: $argty:ty),* $(,)?
            ) $(-> $ret:ty)?;
        )*
    ) => {
        mod import {
            #[link(wasm_import_module = "env")]
            unsafe extern "C" {
                $(
                    pub(super) fn $name(
                        $($arg: $argty),*
                    ) $(-> $ret)?;
                )*
            }
        }

        $(
            #[allow(clippy::too_many_arguments, dead_code)]
            pub fn $name(
                $($arg: $argty),*
            ) $(-> $ret)? {
                unsafe { import::$name($($arg),*) }
            }
        )*
    };
}

wasm_imports! {
    fn log_str(ptr: *const u8, len: usize);
    fn log_bool(val: bool);
    fn log_i32(val: i32);
    fn log_f64(val: f64);
    fn log_flush();

    fn log(x: f64) -> f64;
    fn exp(x: f64) -> f64;
    fn sin(x: f64) -> f64;
    fn round(x: f64) -> f64;
    fn pow(x: f64,y:f64) -> f64;

    fn atan2f(x: f32,y:f32) -> f32;
    fn powf(x: f32,y:f32) -> f32;
    fn roundf(x: f32) -> f32;
    fn sinf(x: f32) -> f32;
    fn cosf(x: f32) -> f32;
    fn tanhf(x: f32) -> f32;
    fn log2f(x: f32) -> f32;
    fn log10f(x: f32) -> f32;
}

pub use libm::hypot;

#[inline]
pub fn sqrtf(x: f32) -> f32 {
    #[cfg(target_arch = "wasm32")]
    {
        core::arch::wasm32::f32_sqrt(x)
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        x.sqrt()
    }
}

#[inline]
pub fn floor(x: f64) -> f64 {
    #[cfg(target_arch = "wasm32")]
    {
        core::arch::wasm32::f64_floor(x)
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        x.floor()
    }
}
