macro_rules! wasm_imports {
    (
        $(
            fn $name:ident($arg:ident: $argty:ty) -> $ret:ty;
        )*
    ) => {
        mod import {
            #[link(wasm_import_module = "env")]
            unsafe extern "C" {
                $(
                    pub(super) fn $name($arg: $argty) -> $ret;
                )*
            }
        }

        $(
            pub fn $name($arg: $argty) -> $ret {
                unsafe { import::$name($arg) }
            }
        )*
    };
}

wasm_imports! {
    fn sinf(x: f32) -> f32;
    fn floorf(x: f32) -> f32;
    fn fabsf(x: f32) -> f32;
}
