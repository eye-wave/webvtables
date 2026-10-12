use super::helpers;
use super::waveshaper::MAX_POINTS;
use super::{Buffer, MAX_PARAMS, N, NodeCategory, NodeKind, NodeLogic, NodeParamDef, Param, State};
use super::{Label, label};
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
        if let Some(d) = current() {
            pick(d, frame, spectral, &mut outs[0]);
        }
    }
}

// The stored floats of the node whose `process` is running (a Data node's frames, a Waveshaper's points).
pub fn current() -> Option<&'static [f32]> {
    let off = unsafe { CURRENT };
    state().data.iter().find(|d| d.0 == off).map(|d| &d.1[..])
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
        helpers::fft_combine(a, b, out, |ar, ai, br, bi| {
            helpers::polar_mix(ar, ai, br, bi, t)
        });
    } else {
        for ((o, x), y) in out.iter_mut().zip(a).zip(b) {
            *o = x + (y - x) * t;
        }
    }
}

impl State {
    pub fn data_of(&self, idx: usize) -> Option<&[f32]> {
        let off = *self.nodes.get(idx)?;
        self.data.iter().find(|d| d.0 == off).map(|d| &d.1[..])
    }

    pub fn data_frames(&self, idx: usize) -> usize {
        self.data_of(idx).map_or(0, |d| d.len() / N)
    }

    /// Frees a node's buffer.
    pub fn data_free(&mut self, idx: usize) {
        if let Some(&off) = self.nodes.get(idx) {
            self.data.retain(|d| d.0 != off);
        }
    }

    /// Allocates zeroed storage for `len` floats and returns its address: whole frames (1..=256)
    /// for Data, x y pairs for Waveshaper. None for invalid nodes, lengths, or allocation failure.
    pub fn data_alloc(&mut self, idx: usize, len: usize) -> Option<usize> {
        let off = *self.nodes.get(idx)?;
        let ok = match self.kind(idx)? {
            NodeKind::Data => len.is_multiple_of(N) && (1..=256).contains(&(len / N)),
            NodeKind::Waveshaper => len.is_multiple_of(2) && len <= 2 * MAX_POINTS,
            _ => false,
        };
        if !ok {
            return None;
        }
        let mut v = Vec::new();
        v.try_reserve_exact(len).ok()?;
        v.resize(len, 0.0);
        let ptr = v.as_ptr() as usize;
        self.data.retain(|d| d.0 != off);
        self.data.push((off, v));
        Some(ptr)
    }
}
