#![allow(dead_code)] // ponytail: UI-side helpers (label, drag, reset) not wired yet
use libm::{exp, log, round};

#[derive(Clone, Copy)]
enum Kind {
    Linear(f64, f64),
    Log(f64, f64),
    Int(i32, i32),
    Enum(&'static [&'static str]),
}

#[derive(Clone, Copy)]
enum Init {
    Norm(f64),
    Denorm(f64),
}

/// Knob metadata + value. `value` is the 0..1 slider position (what the UI/arena stores);
/// `denorm()` is the real-world value (Hz, dB, index...) that DSP should read.
#[derive(Clone, Copy)]
pub struct Param {
    name: &'static str,
    kind: Kind,
    value: f64,
    default: Init,
    unit: Option<&'static str>,
}

fn sym_log(v: f64) -> f64 {
    v.signum() * log(v.abs() + 1.0)
}

fn sym_exp(v: f64) -> f64 {
    v.signum() * (exp(v.abs()) - 1.0)
}

impl Param {
    const fn new(name: &'static str, kind: Kind) -> Self {
        Self {
            name,
            kind,
            value: f64::NAN,
            default: Init::Norm(0.0),
            unit: None,
        }
    }

    pub const fn new_linear(name: &'static str, min: f64, max: f64) -> Self {
        Self::new(name, Kind::Linear(min, max))
    }

    pub const fn new_log(name: &'static str, min: f64, max: f64) -> Self {
        Self::new(name, Kind::Log(min, max))
    }

    pub const fn new_int(name: &'static str, min: i32, max: i32) -> Self {
        Self::new(name, Kind::Int(min, max))
    }

    pub const fn new_enum(name: &'static str, data: &'static [&'static str]) -> Self {
        Self::new(name, Kind::Enum(data))
    }

    pub const fn with_unit(mut self, unit: &'static str) -> Self {
        self.unit = Some(unit);
        self
    }

    pub const fn with_default_norm(mut self, v: f64) -> Self {
        self.default = Init::Norm(v);
        self
    }

    pub const fn with_default_denorm(mut self, v: f64) -> Self {
        self.default = Init::Denorm(v);
        self
    }

    pub fn default_norm(&self) -> f64 {
        match self.default {
            Init::Norm(n) => n,
            Init::Denorm(d) => self.normalize(d),
        }
    }

    pub const fn name(&self) -> &'static str {
        self.name
    }

    pub const fn unit(&self) -> Option<&'static str> {
        self.unit
    }

    /// Current 0..1 position; the default until something sets it.
    pub fn value(&self) -> f64 {
        if self.value.is_nan() {
            self.default_norm()
        } else {
            self.value
        }
    }

    pub fn set_norm(&mut self, v: f64) {
        self.value = v.clamp(0.0, 1.0);
    }

    pub fn set_denorm(&mut self, d: f64) {
        self.set_norm(self.normalize(d));
    }

    pub fn reset(&mut self) {
        self.value = f64::NAN;
    }

    pub fn denorm(&self) -> f64 {
        self.denormalize(self.value())
    }

    /// Enum label for the current value (empty for non-enum params).
    pub fn label(&self) -> &'static str {
        match self.kind {
            Kind::Enum(d) => d.get(self.denorm() as usize).copied().unwrap_or(""),
            _ => "",
        }
    }

    pub fn denormalize(&self, n: f64) -> f64 {
        match self.kind {
            Kind::Linear(lo, hi) => lo + n * (hi - lo),
            Kind::Log(lo, hi) => {
                let (a, b) = (sym_log(lo), sym_log(hi));
                sym_exp(a + n * (b - a))
            }
            Kind::Int(lo, hi) => round(lo as f64 + n * (hi - lo) as f64),
            Kind::Enum(_) => round(n * self.last()),
        }
    }

    pub fn normalize(&self, d: f64) -> f64 {
        let (v, lo, hi) = match self.kind {
            Kind::Linear(lo, hi) => (d, lo, hi),
            Kind::Log(lo, hi) => (sym_log(d), sym_log(lo), sym_log(hi)),
            Kind::Int(lo, hi) => (round(d), lo as f64, hi as f64),
            Kind::Enum(_) => (d, 0.0, self.last()),
        };
        if hi == lo {
            0.0
        } else {
            ((v - lo) / (hi - lo)).clamp(0.0, 1.0)
        }
    }

    pub fn drag_from(&mut self, start: f64, delta_px: f64, precise: bool) {
        let mul = if precise { 0.01 } else { 1.0 };
        self.set_norm(start + delta_px * mul / self.drag_range_px());
    }

    fn drag_range_px(&self) -> f64 {
        match self.kind {
            Kind::Enum(_) => 12.0 * self.last().max(1.0),
            _ => 150.0,
        }
    }

    fn last(&self) -> f64 {
        match self.kind {
            Kind::Enum(d) => (d.len().max(1) - 1) as f64,
            _ => 0.0,
        }
    }
}

/// `params![Param::..., ...]` -> `[Option<Param>; MAX_PARAMS]`. Const-evaluable.
#[macro_export]
macro_rules! params {
    ($($p:expr),+ $(,)?) => {{
        let mut a: [Option<$crate::graph::Param>; $crate::graph::MAX_PARAMS] =
            [None; $crate::graph::MAX_PARAMS];
        let mut i = 0;
        $( a[i] = Some($p); i += 1; )+
        let _ = i;
        a
    }};
}
