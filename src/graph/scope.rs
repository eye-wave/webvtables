use crate::ffi;
use crate::graph::{NodeKind, State};
use core::f64::consts::TAU;

const N: usize = 2048;
const MAX_DEPTH: u8 = 16;

static mut BUF: [f32; N] = [0.0; N];

pub fn buf() -> usize {
    (&raw const BUF) as usize
}

pub fn fill(s: &State, node: usize, widget: u8) -> usize {
    let buf = unsafe { &mut BUF };
    match (widget, s.kind(node)) {
        (0, Some(_)) => {
            eval(s, node, 0, buf);
            N
        }
        (1, Some(NodeKind::Output)) => {
            eval(s, node, 0, buf);
            spectrum(buf);
            N / 2
        }
        _ => 0,
    }
}

fn input(s: &State, node: usize, depth: u8, out: &mut [f32; N]) {
    let src = s
        .links
        .iter()
        .find(|l| l.target as usize == node && l.target_socket == 0);
    if let Some(l) = src {
        eval(s, l.source as usize, depth + 1, out);
    }
}

fn eval(s: &State, node: usize, depth: u8, out: &mut [f32; N]) {
    out.fill(0.0);
    let Some(kind) = s.kind(node).filter(|_| depth < MAX_DEPTH) else {
        return;
    };
    let p = s.params(node);
    let par = |i: usize| p.get(i).copied().unwrap_or(0.0);
    match kind {
        NodeKind::BasicShapes => {
            let shape = ((par(0) * 4.0) as usize).min(3);
            let cycles = 1.0 + (par(1) * 63.0) as u32 as f64;
            for (i, o) in out.iter_mut().enumerate() {
                let t = i as f64 / N as f64 * cycles + par(2) as f64;
                let x = t - (t as u64) as f64;
                let v: f64 = match shape {
                    0 => ffi::sin(TAU * x),
                    1 => {
                        if x < 0.5 {
                            1.0
                        } else {
                            -1.0
                        }
                    }
                    2 => 2.0 * x - 1.0,
                    _ => 1.0 - 4.0 * (x - 0.5).abs(),
                };
                *o = v as f32;
            }
        }
        NodeKind::Output => input(s, node, depth, out),
        NodeKind::Transform => {
            input(s, node, depth, out);
            let (g, off) = (1.0 + 3.0 * par(0), par(1));
            for v in out.iter_mut() {
                *v = *v * g + off;
            }
        }
    }
}

fn spectrum(re: &mut [f32; N]) {
    let bins = microfft::real::rfft_2048(re);
    bins[0].im = 0.0;
    let mut out = [0.0; N / 2];
    for (k, (o, b)) in out.iter_mut().zip(bins.iter()).enumerate() {
        let m = ffi::hypot(b.re as f64, b.im as f64) * if k == 0 { 1.0 } else { 2.0 } / N as f64;

        *o = (1.0 + 0.217147 * ffi::ln(m.max(1e-4))) as f32;
    }
    re[..N / 2].copy_from_slice(&out);
}
