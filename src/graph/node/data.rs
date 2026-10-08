use super::helpers;
use super::{Buffer, MAX_PARAMS, N, NodeCategory, NodeKind, NodeLogic, NodeParamDef, Param, State};
use super::{Label, label};
use crate::ffi;
use crate::graph::{scope::CURRENT, state};
use alloc::vec::Vec;

pub struct DataNode;

impl NodeParamDef for DataNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_linear("Frame", 0.0, 255.0),
        Param::new_enum("Interpolation", &["Time", "Spectral"]),
    ];
}

impl NodeLogic for DataNode {
    fn title(&self) -> Label {
        label("Data")
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Inputs]
    }

    fn input_count(&self) -> usize {
        0
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        Self::PARAMS
    }

    fn process(
        &self,
        _inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let frame = helpers::param(params, 0, 0.0) as f32;
        let spectral = helpers::param(params, 1, 0.0) as u8 == 1;
        let off = unsafe { CURRENT };
        if let Some((_, d)) = state().data.iter().find(|(o, _)| *o == off) {
            pick(d, frame, spectral, &mut outs[0]);
        }
    }
}

fn frame_at(d: &[f32], k: usize) -> &Buffer {
    d[k * N..][..N].try_into().unwrap()
}

// A fractional frame crossfades the two frames around it, either sample by sample or per
// frequency bin (magnitude and phase blended separately). Past the last frame holds the last
// frame; no data leaves `out` as silence.
fn pick(d: &[f32], frame: f32, spectral: bool, out: &mut Buffer) {
    let frames = d.len() / N;
    if frames == 0 {
        return;
    }
    let f = frame.clamp(0.0, (frames - 1) as f32);
    let (i, t) = (f as usize, f - (f as usize) as f32);
    let (a, b) = (frame_at(d, i), frame_at(d, (i + 1).min(frames - 1)));
    if t == 0.0 {
        out.copy_from_slice(a);
    } else if spectral {
        helpers::fft_combine(a, b, out, |ar, ai, br, bi| polar_mix(ar, ai, br, bi, t));
    } else {
        for ((o, x), y) in out.iter_mut().zip(a).zip(b) {
            *o = x + (y - x) * t;
        }
    }
}

// Blends two complex values by magnitude and phase, taking the short way round the circle.
// A silent side has no phase of its own, so it borrows the other's.
fn polar_mix(ar: f32, ai: f32, br: f32, bi: f32, t: f32) -> (f32, f32) {
    use core::f32::consts::{PI, TAU};
    let (ma, mb) = (ffi::sqrtf(ar * ar + ai * ai), ffi::sqrtf(br * br + bi * bi));
    let (pa, pb) = (ffi::atan2f(ai, ar), ffi::atan2f(bi, br)); // JS Math.atan2(y, x)
    let mut d = pb - pa;
    if d > PI {
        d -= TAU;
    } else if d < -PI {
        d += TAU;
    }
    let p = if ma < 1e-9 {
        pb
    } else if mb < 1e-9 {
        pa
    } else {
        pa + d * t
    };
    let m = ma + (mb - ma) * t;
    (m * ffi::cosf(p), m * ffi::sinf(p))
}

impl State {
    pub fn data_of(&self, idx: usize) -> Option<&[f32]> {
        let off = *self.nodes.get(idx)?;
        self.data.iter().find(|d| d.0 == off).map(|d| &d.1[..])
    }

    pub fn data_frames(&self, idx: usize) -> usize {
        self.data_of(idx).map_or(0, |d| d.len() / N)
    }

    /// Allocates zeroed storage for `frames` frames and returns its address.
    /// Returns None for invalid nodes, frame counts, or allocation failure.
    /// Frees a Data node's buffer.
    pub fn data_free(&mut self, idx: usize) {
        if let Some(&off) = self.nodes.get(idx) {
            self.data.retain(|d| d.0 != off);
        }
    }

    pub fn data_alloc(&mut self, idx: usize, frames: usize) -> Option<usize> {
        let off = *self.nodes.get(idx)?;
        if self.kind(idx)? != NodeKind::Data || !(1..=256).contains(&frames) {
            return None;
        }
        let mut v = Vec::new();
        v.try_reserve_exact(frames * N).ok()?;
        v.resize(frames * N, 0.0);
        let ptr = v.as_ptr() as usize;
        self.data.retain(|d| d.0 != off);
        self.data.push((off, v));
        Some(ptr)
    }
}
