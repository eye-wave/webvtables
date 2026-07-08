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
    fn log_bool(val: bool);
    fn log_i32(val: i32);
    fn log_f64(val: f64);
    fn log_flush();

    fn ln(x: f64) -> f64;
    fn exp(x: f64) -> f64;
    fn round(x: f64) -> f64;
    fn sin(x: f64) -> f64;
    fn floor(x: f64) -> f64;

    fn atan2f(x: f32,y:f32) -> f32;
    fn powf(x: f32,y:f32) -> f32;
    fn expf(x: f32) -> f32;
    fn roundf(x: f32) -> f32;
    fn sinf(x: f32) -> f32;
    fn cosf(x: f32) -> f32;
    fn tanhf(x: f32) -> f32;
    fn sqrtf(x: f32) -> f32;
    fn log2f(x: f32) -> f32;
    fn log10f(x: f32) -> f32;

    fn click_btn(id: usize);
    fn open_context_menu(x:f32,y:f32,hit:u32);
    fn open_node_picker(x:f32,y:f32);
    fn push_node_name(title: *const u8, len: usize, category: *const u8, len2: usize);
    fn draw_flush(ptr: *const u8, len: usize);
}
