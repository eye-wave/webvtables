use core::ops::{Deref, DerefMut};

use crate::{FixedStr, ffi};

trait ParamLogic {
    fn name(&self) -> &'static str;
    fn value(&self) -> f64;
    fn set_value(&mut self, val: f64);
    fn drag_range_px(&self) -> f64 {
        150.0
    }

    fn normalize(&self, denorm: f64) -> f64;
}

trait ParamWriteDenorm {
    type ParamType;
    fn denormalize(&self, val: f64) -> Self::ParamType;
    fn write_denorm_value<const N: usize>(&self, buf: &mut FixedStr<N>);
}

#[derive(Clone, Copy)]
pub struct LinearParam {
    name: &'static str,
    value: f64,
    r_min: f64,
    r_max: f64,
}

#[derive(Clone, Copy)]
pub struct LogParam {
    name: &'static str,
    value: f64,
    log_min: f64,
    log_max: f64,
}

#[derive(Clone, Copy)]
pub struct IntParam {
    name: &'static str,
    value: f64,
    r_min: i32,
    r_max: i32,
}

#[derive(Clone, Copy)]
pub struct EnumParam {
    name: &'static str,
    value: u8,
    data: &'static [&'static str],
}

#[derive(Clone, Copy)]
pub enum ParamTypes {
    Linear(LinearParam),
    Log(LogParam),
    Int(IntParam),
    Enum(EnumParam),
}

#[derive(Clone, Copy)]
pub struct Param {
    default: f64,
    inner: ParamTypes,
    unit: Option<&'static str>,
}

impl Deref for Param {
    type Target = ParamTypes;

    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl DerefMut for Param {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.inner
    }
}

#[inline]
fn sym_log(val: f64) -> f64 {
    val.signum() * ffi::ln(val.abs() + 1.0)
}

#[inline]
fn sym_exp(val: f64) -> f64 {
    val.signum() * (ffi::exp(val.abs()) - 1.0)
}

struct ParamWidget {
    node_id: usize,
    param_id: usize,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    zoom: f32,
    value: f64,
}

impl ParamWidget {
    fn fill_buf(&self, buffer: &mut [u8]) {
        buffer[0..4].copy_from_slice(&(self.node_id as u32).to_le_bytes());
        buffer[4..8].copy_from_slice(&(self.param_id as u32).to_le_bytes());

        buffer[8..12].copy_from_slice(&self.x.to_le_bytes());
        buffer[12..16].copy_from_slice(&self.y.to_le_bytes());
        buffer[16..20].copy_from_slice(&self.w.to_le_bytes());
        buffer[20..24].copy_from_slice(&self.h.to_le_bytes());
        buffer[24..28].copy_from_slice(&self.zoom.to_le_bytes());

        buffer[28..36].copy_from_slice(&self.value.to_le_bytes());
    }
}

enum ParamWidgetType {
    Number {
        inner: ParamWidget,
        min: f64,
        max: f64,
    },
    Enum {
        inner: ParamWidget,
        ptr: u32,
        len: usize,
    },
}

impl ParamWidgetType {
    pub fn open_widget(&self) {
        match self {
            Self::Number { inner, min, max } => {
                let mut buffer = [0u8; 52];

                inner.fill_buf(&mut buffer);

                buffer[36..44].copy_from_slice(&(min).to_le_bytes());
                buffer[44..52].copy_from_slice(&(max).to_le_bytes());

                ffi::open_float_param(buffer.as_ptr());
            }
            Self::Enum { inner, ptr, len } => {
                let mut buffer = [0u8; 40];

                inner.fill_buf(&mut buffer);

                buffer[36..40].copy_from_slice(&(*ptr as usize).to_le_bytes());

                ffi::open_enum_param(buffer.as_ptr(), *len);
            }
        }
    }
}

impl Param {
    pub const fn new_linear(name: &'static str, r_min: f64, r_max: f64) -> Self {
        Self {
            default: 0.0,
            inner: ParamTypes::Linear(LinearParam {
                name,
                value: 0.0,
                r_min,
                r_max,
            }),
            unit: None,
        }
    }

    pub fn new_log(name: &'static str, r_min: f64, r_max: f64) -> Self {
        Self {
            default: 0.0,
            inner: ParamTypes::Log(LogParam {
                name,
                value: 0.0,
                log_min: sym_log(r_min),
                log_max: sym_log(r_max),
            }),
            unit: None,
        }
    }

    pub const fn new_log_const(name: &'static str, log_min: f64, log_max: f64) -> Self {
        Self {
            default: 0.0,
            inner: ParamTypes::Log(LogParam {
                name,
                value: 0.0,
                log_min,
                log_max,
            }),
            unit: None,
        }
    }

    pub const fn new_int(name: &'static str, r_min: i32, r_max: i32) -> Self {
        Self {
            default: 0.0,
            inner: ParamTypes::Int(IntParam {
                name,
                value: 0.0,
                r_min,
                r_max,
            }),
            unit: None,
        }
    }

    pub const fn new_enum(name: &'static str, data: &'static [&'static str]) -> Self {
        Self {
            default: 0.0,
            inner: ParamTypes::Enum(EnumParam {
                name,
                value: 0,
                data,
            }),
            unit: None,
        }
    }

    pub fn new_bool(
        name: &'static str,
        value: bool,
        data: Option<&'static [&'static str; 2]>,
    ) -> Self {
        const DEFAULT_NAMES: &[&str; 2] = &["No", "Yes"];

        Self {
            default: 0.0,
            inner: ParamTypes::Enum(EnumParam {
                name,
                value: value as u8,
                data: data.unwrap_or(DEFAULT_NAMES),
            }),
            unit: None,
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn open_param_widget(
        &self,
        node_id: usize,
        param_id: usize,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        zoom: f32,
    ) {
        let inner = ParamWidget {
            node_id,
            param_id,
            x,
            y,
            w,
            h,
            zoom,
            value: 0.0,
        };

        match self.inner {
            ParamTypes::Int(p) => ParamWidgetType::Number {
                inner: ParamWidget {
                    value: self.denorm(),
                    ..inner
                },
                min: p.r_min as f64,
                max: p.r_max as f64,
            }
            .open_widget(),
            ParamTypes::Linear(p) => ParamWidgetType::Number {
                inner: ParamWidget {
                    value: self.denorm(),
                    ..inner
                },
                min: p.r_min,
                max: p.r_max,
            }
            .open_widget(),
            ParamTypes::Log(p) => ParamWidgetType::Number {
                inner: ParamWidget {
                    value: self.denorm(),
                    ..inner
                },
                min: p.denormalize(0.0),
                max: p.denormalize(1.0),
            }
            .open_widget(),
            ParamTypes::Enum(p) => ParamWidgetType::Enum {
                inner: ParamWidget {
                    value: self.denorm(),
                    ..inner
                },
                len: p.data.len(),
                ptr: (p.data.as_ptr() as u32),
            }
            .open_widget(),
        };
    }

    pub const fn with_unit(mut self, unit: &'static str) -> Self {
        self.unit = Some(unit);
        self
    }

    pub fn with_value(mut self, value: f64) -> Self {
        self.inner.as_param_mut().set_value(value);
        self
    }

    pub fn with_default_norm(mut self, v: f64) -> Self {
        self.default = v;
        self.as_param_mut().set_value(v);
        self
    }

    pub fn with_default_denorm(mut self, v: f64) -> Self {
        self.inner.set_denorm(v);
        self.default = self.inner.value();
        self
    }

    pub fn reset_to_default(&mut self) {
        let val = self.default;
        self.as_param_mut().set_value(val);
    }

    pub fn format_value(&self, buf: &mut FixedStr<16>) {
        match self.inner {
            ParamTypes::Linear(p) => p.write_denorm_value(buf),
            ParamTypes::Log(p) => p.write_denorm_value(buf),
            ParamTypes::Int(p) => p.write_denorm_value(buf),
            ParamTypes::Enum(p) => p.write_denorm_value(buf),
        }

        if let Some(unit) = self.unit {
            buf.push_str(" ");
            buf.push_str(unit);
        }
    }

    pub fn drag_from(&mut self, start_value: f64, delta_px: f64, precise: bool) {
        let mul = 1.0 - 0.99 * (precise as u8 as f64);
        self.inner.drag_from(start_value, delta_px * mul);
    }

    pub fn set_value_norm(&mut self, val: f64) {
        self.as_param_mut().set_value(val);
    }

    pub fn set_value_denorm(&mut self, val: f64) {
        let val = self.as_param().normalize(val);
        self.as_param_mut().set_value(val);
    }

    /// The param's real-world (denormalized) numeric value — Hz, dB, etc.
    /// for Linear/Log params, or the selected index for Enum params. This is
    /// what DSP code should read; `value()` is the raw 0..1 slider position.
    pub fn denorm(&self) -> f64 {
        match self.inner {
            ParamTypes::Linear(p) => p.denormalize(p.value),
            ParamTypes::Log(p) => p.denormalize(p.value),
            ParamTypes::Int(p) => p.denormalize(p.value) as f64,
            ParamTypes::Enum(p) => p.value as f64,
        }
    }
}

impl ParamTypes {
    pub fn name(&self) -> &'static str {
        self.as_param().name()
    }

    pub fn value(&self) -> f64 {
        self.as_param().value()
    }

    fn drag_from(&mut self, start_value: f64, delta_px: f64) {
        let range_px = self.as_param().drag_range_px();
        let delta_norm = delta_px / range_px;
        let val = (start_value + delta_norm).clamp(0.0, 1.0);

        self.as_param_mut().set_value(val);
    }

    fn set_denorm(&mut self, denorm: f64) {
        match self {
            Self::Linear(p) => {
                let n = p.normalize(denorm);
                p.set_value(n);
            }
            Self::Log(p) => {
                let n = p.normalize(denorm);
                p.set_value(n);
            }
            Self::Int(p) => {
                let n = p.normalize(ffi::round(denorm));
                p.set_value(n);
            }
            Self::Enum(p) => {
                let idx = (denorm.max(0.0) as usize).min(p.data.len().saturating_sub(1));
                p.value = idx as u8;
            }
        }
    }

    #[inline]
    fn as_param(&self) -> &dyn ParamLogic {
        match self {
            Self::Linear(p) => p,
            Self::Log(p) => p,
            Self::Int(p) => p,
            Self::Enum(p) => p,
        }
    }

    #[inline]
    fn as_param_mut(&mut self) -> &mut dyn ParamLogic {
        match self {
            Self::Linear(p) => p,
            Self::Log(p) => p,
            Self::Int(p) => p,
            Self::Enum(p) => p,
        }
    }
}

// --- Linear Param ---
impl ParamLogic for LinearParam {
    fn name(&self) -> &'static str {
        self.name
    }
    fn value(&self) -> f64 {
        self.value
    }
    fn set_value(&mut self, val: f64) {
        self.value = val;
    }
    fn normalize(&self, denorm: f64) -> f64 {
        let range = self.r_max - self.r_min;
        if range == 0.0 {
            0.0
        } else {
            ((denorm - self.r_min) / range).clamp(0.0, 1.0)
        }
    }
}

impl ParamWriteDenorm for LinearParam {
    type ParamType = f64;

    fn denormalize(&self, n: f64) -> Self::ParamType {
        self.r_min + n * (self.r_max - self.r_min)
    }

    fn write_denorm_value<const N: usize>(&self, buf: &mut FixedStr<N>) {
        let val = self.denormalize(self.value);
        buf.push_fixed2(val);
    }
}

// --- Log Param ---
impl ParamLogic for LogParam {
    fn name(&self) -> &'static str {
        self.name
    }
    fn value(&self) -> f64 {
        self.value
    }
    fn set_value(&mut self, val: f64) {
        self.value = val;
    }
    fn normalize(&self, denorm: f64) -> f64 {
        let log_val = sym_log(denorm);
        let range = self.log_max - self.log_min;
        if range == 0.0 {
            0.0
        } else {
            ((log_val - self.log_min) / range).clamp(0.0, 1.0)
        }
    }
}

impl ParamWriteDenorm for LogParam {
    type ParamType = f64;

    fn denormalize(&self, n: f64) -> Self::ParamType {
        let log_val = self.log_min + n * (self.log_max - self.log_min);
        sym_exp(log_val)
    }

    fn write_denorm_value<const N: usize>(&self, buf: &mut FixedStr<N>) {
        let val = self.denormalize(self.value);
        buf.push_fixed2(val);
    }
}

// --- Int Param ---
impl ParamLogic for IntParam {
    fn name(&self) -> &'static str {
        self.name
    }
    fn value(&self) -> f64 {
        self.value
    }
    fn set_value(&mut self, val: f64) {
        self.value = val;
    }
    fn normalize(&self, denorm: f64) -> f64 {
        let range = (self.r_max - self.r_min) as f64;
        if range == 0.0 {
            0.0
        } else {
            ((denorm as i32 - self.r_min) as f64 / range).clamp(0.0, 1.0)
        }
    }
}

impl ParamWriteDenorm for IntParam {
    type ParamType = i32;

    fn denormalize(&self, n: f64) -> Self::ParamType {
        let range = (self.r_max - self.r_min) as f64;
        let denorm_f64 = self.r_min as f64 + (n * range);
        ffi::round(denorm_f64) as i32
    }

    fn write_denorm_value<const N: usize>(&self, buf: &mut FixedStr<N>) {
        let val = self.denormalize(self.value);
        buf.push_int(val);
    }
}

// --- Enum Param ---
impl EnumParam {
    fn last_index(&self) -> f64 {
        (self.data.len().max(1) - 1) as f64
    }
}

impl ParamLogic for EnumParam {
    fn name(&self) -> &'static str {
        self.name
    }
    fn value(&self) -> f64 {
        let last = self.last_index();
        if last == 0.0 {
            0.0
        } else {
            self.value as f64 / last
        }
    }
    fn set_value(&mut self, val: f64) {
        self.value = ffi::round(val * self.last_index()) as u8;
    }
    fn normalize(&self, denorm: f64) -> f64 {
        if self.data.is_empty() {
            return 0.0;
        }

        denorm / self.last_index()
    }
    fn drag_range_px(&self) -> f64 {
        const PX_PER_STEP: f64 = 12.0;
        PX_PER_STEP * self.last_index().max(1.0)
    }
}

impl ParamWriteDenorm for EnumParam {
    type ParamType = &'static str;

    fn denormalize(&self, val: f64) -> Self::ParamType {
        let idx = ffi::round(val * self.last_index()) as usize;
        self.data.get(idx).unwrap_or(&"")
    }

    fn write_denorm_value<const N: usize>(&self, buf: &mut FixedStr<N>) {
        let val = self.denormalize(self.value());
        buf.push_str(val);
    }
}
