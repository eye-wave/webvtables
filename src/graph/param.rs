use core::ops::Deref;

use crate::{FixedStr, js};

trait ParamLogic {
    fn name(&self) -> &'static str;

    fn value(&self) -> f64;
    fn set_value(&mut self, val: f64);
    fn drag_range_px(&self) -> f64;
}

trait ParamWriteDenorm {
    type ParamType;

    /// `val` is the normalized 0..1
    fn denormalize(&self, val: f64) -> Self::ParamType;
    fn write_denorm_value<const N: usize>(&self, buf: &mut FixedStr<N>);
}

#[derive(Clone, Copy)]
pub struct FloatParam {
    name: &'static str,
    value: f64,
    r_min: f32,
    r_max: f32,
}

#[derive(Clone, Copy)]
pub struct EnumParam {
    name: &'static str,
    value: u8,
    data: &'static [&'static str],
}

#[derive(Clone, Copy)]
pub enum ParamTypes {
    Float(FloatParam),
    Enum(EnumParam),
}

#[derive(Clone, Copy)]
pub struct Param(ParamTypes);

impl Deref for Param {
    type Target = ParamTypes;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Param {
    pub fn new_float(name: &'static str, value: f64, r_min: f32, r_max: f32) -> Self {
        Self(ParamTypes::Float(FloatParam {
            name,
            value,
            r_min,
            r_max,
        }))
    }

    pub fn new_enum(name: &'static str, value: u8, data: &'static [&'static str]) -> Self {
        Self(ParamTypes::Enum(EnumParam { name, value, data }))
    }

    pub fn drag_from(&mut self, start_value: f64, delta_px: f32) {
        self.0.drag_from(start_value, delta_px);
    }
}

impl ParamTypes {
    pub fn name(&self) -> &'static str {
        self.as_param().name()
    }

    pub fn value(&self) -> f64 {
        self.as_param().value()
    }

    pub fn format_value(&self, buf: &mut FixedStr<16>) {
        match self {
            Self::Float(p) => p.write_denorm_value(buf),
            Self::Enum(p) => p.write_denorm_value(buf),
        }
    }

    fn drag_from(&mut self, start_value: f64, delta_px: f32) {
        let range_px = self.as_param().drag_range_px();
        let delta_norm = delta_px as f64 / range_px;
        let val = (start_value + delta_norm).clamp(0.0, 1.0);

        self.as_param_mut().set_value(val);
    }

    #[inline]
    fn as_param(&self) -> &dyn ParamLogic {
        match self {
            Self::Float(p) => p,
            Self::Enum(p) => p,
        }
    }

    #[inline]
    fn as_param_mut(&mut self) -> &mut dyn ParamLogic {
        match self {
            Self::Float(p) => p,
            Self::Enum(p) => p,
        }
    }
}

impl ParamLogic for FloatParam {
    fn name(&self) -> &'static str {
        self.name
    }

    fn value(&self) -> f64 {
        self.value
    }

    fn set_value(&mut self, val: f64) {
        self.value = val;
    }

    fn drag_range_px(&self) -> f64 {
        150.0
    }
}

impl ParamWriteDenorm for FloatParam {
    type ParamType = f32;

    fn denormalize(&self, n: f64) -> Self::ParamType {
        let min = self.r_min;
        let max = self.r_max;

        min + (n as f32) * (max - min)
    }

    fn write_denorm_value<const N: usize>(&self, buf: &mut FixedStr<N>) {
        let val = self.denormalize(self.value);
        buf.push_fixed2(val as f64);
    }
}

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
        self.value = js::round(val * self.last_index()) as u8;
    }

    fn drag_range_px(&self) -> f64 {
        const PX_PER_STEP: f64 = 12.0;
        PX_PER_STEP * self.last_index().max(1.0)
    }
}

impl ParamWriteDenorm for EnumParam {
    type ParamType = &'static str;

    fn denormalize(&self, val: f64) -> Self::ParamType {
        let idx = js::round(val * self.last_index()) as usize;
        self.data.get(idx).unwrap_or(&"")
    }

    fn write_denorm_value<const N: usize>(&self, buf: &mut FixedStr<N>) {
        let val = self.denormalize(self.value());
        buf.push_str(val);
    }
}
