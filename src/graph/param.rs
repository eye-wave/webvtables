#![allow(dead_code)]
use crate::graph::{Label, Labels, State, label, labels};
use libm::{exp, log, round};

#[derive(Clone, Copy)]
enum Kind {
    Linear(f64, f64),
    Log(f64, f64),
    Int(i32, i32),
    Enum(u8),
}

#[derive(Clone, Copy)]
enum Init {
    Norm(f64),
    Denorm(f64),
}

#[derive(Clone, Copy)]
pub struct Param {
    name: Label,
    kind: Kind,
    value: f64,
    default: Init,
    unit: Option<Label>,
    options: Option<Labels>,
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
            name: label(name),
            kind,
            value: f64::NAN,
            default: Init::Norm(0.0),
            unit: None,
            options: None,
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
        let mut p = Self::new(name, Kind::Enum(data.len() as u8));
        p.options = Some(labels(data));
        p
    }

    pub const fn with_unit(mut self, unit: &'static str) -> Self {
        self.unit = Some(label(unit));
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
            Kind::Enum(n) => (n.max(1) - 1) as f64,
            _ => 0.0,
        }
    }
}

#[cfg(test)]
impl Param {
    pub fn ts(&self) -> alloc::string::String {
        use alloc::format;
        let mut s = format!("{{ name: {:?}", self.name);
        if let Some(o) = self.options {
            s += &format!(", options: {o:?}");
        }
        s += &format!(", default: {}", self.default_norm());
        if let Some(u) = self.unit {
            s += &format!(", unit: {u:?}");
        }
        s + " }"
    }
}

const TEXT_CAP: usize = 24;
static mut TEXT: [u8; TEXT_CAP] = [0; TEXT_CAP];

pub fn text_ptr() -> usize {
    (&raw const TEXT) as usize
}

impl State {
    pub fn param_text(&self, idx: usize, i: usize) -> usize {
        let param = self
            .kind(idx)
            .and_then(|k| k.as_node().default_params().get(i).copied().flatten());
        let (Some(p), Some(&v)) = (param, self.params(idx).get(i)) else {
            return 0;
        };
        write_num(p.denormalize(v as f64), unsafe { &mut TEXT })
    }
}

fn write_num(v: f64, out: &mut [u8; TEXT_CAP]) -> usize {
    let a = v.abs().min(1e9);
    let decimals: usize = match a {
        a if a >= 100.0 => 0,
        a if a >= 10.0 => 1,
        a if a >= 1.0 => 2,
        a if a >= 0.1 => 3,
        _ => 4,
    };
    let mut x = round(a * [1.0, 10.0, 100.0, 1e3, 1e4][decimals]) as u64;
    let mut n = 0;
    if v < 0.0 && x != 0 {
        out[0] = b'-';
        n = 1;
    }
    let mut digits = [0u8; 16];
    let mut d = 0;
    loop {
        digits[d] = b'0' + (x % 10) as u8;
        d += 1;
        x /= 10;
        if x == 0 && d > decimals {
            break;
        }
    }
    for k in (decimals..d).rev() {
        out[n] = digits[k];
        n += 1;
    }
    let lo = digits[..decimals]
        .iter()
        .take_while(|&&c| c == b'0')
        .count();
    if lo < decimals {
        out[n] = b'.';
        n += 1;
        for k in (lo..decimals).rev() {
            out[n] = digits[k];
            n += 1;
        }
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::NodeKind;

    fn num(v: f64) -> alloc::string::String {
        let mut b = [0; TEXT_CAP];
        let n = write_num(v, &mut b);
        alloc::string::String::from_utf8(b[..n].to_vec()).unwrap()
    }

    #[test]
    fn formats_numbers() {
        for (v, s) in [
            (0.0, "0"),
            (-12.5, "-12.5"),
            (440.0, "440"),
            (0.025, "0.025"),
            (7.0, "7"),
            (99.96, "100"),
            (-0.00001, "0"),
            (3.14159, "3.14"),
            (2048.0, "2048"),
            (-0.5, "-0.5"),
            (0.0001, "0.0001"),
        ] {
            assert_eq!(num(v), s, "{v}");
        }
    }

    #[test]
    fn param_text_reads_arena_value() {
        let mut s = State::new();
        s.add_node(NodeKind::Gain, [0.0; 2], [0.0; 2]).unwrap();
        s.arena.slice_mut::<f32>(
            s.param_addr(0, 0).unwrap() as u32 - s.arena.base() as u32,
            1,
        )[0] = 1.0;
        let n = s.param_text(0, 0);
        assert_eq!(unsafe { &TEXT[..n] }, b"30");
        assert_eq!(s.param_text(0, 1), 0);
    }
}

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
