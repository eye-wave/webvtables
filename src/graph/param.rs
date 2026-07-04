use core::fmt::{Display, Write};
use core::ops::Deref;

use crate::graph::FixedStr;

trait ParamLogic {
    type ParamType: Display;

    fn name(&self) -> &'static str;
    fn value(&self) -> f64;
    fn set_value(&mut self, val: f64);

    fn denormalize(&self, val: f64) -> Self::ParamType;

    fn format_value<const N: usize>(&self, buf: &mut FixedStr<N>) {
        let val: Self::ParamType = self.denormalize(self.value());
        let _ = write!(buf, "{}", val);
    }
}

#[derive(Clone, Copy)]
pub struct FloatParam {
    name: &'static str,
    value: f64,
    r_min: f32,
    r_max: f32,
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
    Float(FloatParam),
    Int(IntParam),
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

    pub fn new_int(name: &'static str, value: f64, r_min: i32, r_max: i32) -> Self {
        Self(ParamTypes::Int(IntParam {
            name,
            value,
            r_min,
            r_max,
        }))
    }

    pub fn new_enum(name: &'static str, value: u8, data: &'static [&'static str]) -> Self {
        Self(ParamTypes::Enum(EnumParam { name, value, data }))
    }
}

impl ParamTypes {
    pub fn name(&self) -> &'static str {
        match self {
            Self::Float(p) => p.name,
            Self::Int(p) => p.name,
            Self::Enum(p) => p.name,
        }
    }

    pub fn value(&self) -> f64 {
        match self {
            Self::Float(p) => p.value,
            Self::Int(p) => p.value,
            Self::Enum(p) => p.value as f64,
        }
    }

    pub fn set_value(&mut self, val: f64) {
        match self {
            Self::Float(p) => p.value = val,
            Self::Int(p) => p.value = val,
            Self::Enum(p) => p.value = val as u8,
        }
    }

    pub fn format_value(&self, buf: &mut FixedStr<16>) {
        match self {
            Self::Float(p) => p.format_value(buf),
            Self::Int(p) => p.format_value(buf),
            Self::Enum(p) => p.format_value(buf),
        }
    }
}

impl ParamLogic for FloatParam {
    type ParamType = f32;

    fn name(&self) -> &'static str {
        self.name
    }

    fn value(&self) -> f64 {
        self.value
    }

    fn set_value(&mut self, val: f64) {
        self.value = val;
    }

    fn denormalize(&self, n: f64) -> Self::ParamType {
        let min = self.r_min;
        let max = self.r_max;

        min + (n as f32) * (max - min)
    }

    fn format_value<const N: usize>(&self, buf: &mut FixedStr<N>) {
        let _ = write!(buf, "{:.2}", self.value);
    }
}

impl ParamLogic for IntParam {
    type ParamType = i32;

    fn name(&self) -> &'static str {
        self.name
    }

    fn value(&self) -> f64 {
        self.value
    }

    fn set_value(&mut self, val: f64) {
        self.value = val
    }

    fn denormalize(&self, n: f64) -> i32 {
        let min = self.r_min;
        let max = self.r_max;

        (min as f64 + n * (max - min) as f64) as i32
    }
}

impl ParamLogic for EnumParam {
    type ParamType = &'static str;

    fn name(&self) -> &'static str {
        self.name
    }

    fn value(&self) -> f64 {
        self.value as f64
    }

    fn set_value(&mut self, val: f64) {
        self.value = val as u8
    }

    fn denormalize(&self, val: f64) -> Self::ParamType {
        let idx = val as usize;
        self.data.get(idx).unwrap_or(&"")
    }
}
