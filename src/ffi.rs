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
    fn log_i32(val: i32);
    fn log_f64(val: f64);
    fn log_flush();

    fn ln(x: f64) -> f64;
    fn exp(x: f64) -> f64;
    fn round(x: f64) -> f64;
    fn sin(x: f64) -> f64;
    fn cos(x: f64) -> f64;
    fn sqrt(x: f64) -> f64;
    fn floor(x: f64) -> f64;

    fn powf(x: f32,y:f32) -> f32;
    fn roundf(x: f32) -> f32;
    fn sinf(x: f32) -> f32;
    fn cosf(x: f32) -> f32;
    fn tanhf(x: f32) -> f32;

    fn draw_flush(ptr: *const u8, len: usize);
}
