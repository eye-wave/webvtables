use super::helpers;
use super::{Buffer, MAX_PARAMS, N, NodeCategory, NodeKind, NodeLogic, NodeParamDef, Param, State};
use super::{Label, label};
use crate::graph::{scope::CURRENT, state};
use alloc::vec::Vec;

pub struct DataNode;

impl NodeParamDef for DataNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![Param::new_int("Frame", 0, 255)];
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
        let frame = helpers::param(params, 0, 0.0) as usize;
        let off = unsafe { CURRENT };
        if let Some((_, d)) = state().data.iter().find(|(o, _)| *o == off) {
            pick(d, frame, &mut outs[0]);
        }
    }
}

// Past the last frame holds the last frame; no data leaves `out` as silence.
fn pick(d: &[f32], frame: usize, out: &mut Buffer) {
    let frames = d.len() / N;
    if frames > 0 {
        out.copy_from_slice(&d[frame.min(frames - 1) * N..][..N]);
    }
}

impl State {
    pub fn data_of(&self, idx: usize) -> Option<&[f32]> {
        let off = *self.nodes.get(idx)?;
        self.data.iter().find(|d| d.0 == off).map(|d| &d.1[..])
    }

    /// 0 when the node has no data.
    pub fn data_frames(&self, idx: usize) -> usize {
        self.data_of(idx).map_or(0, |d| d.len() / N)
    }

    /// (Re)allocates zeroed storage for `frames` frames on Data node `idx` and returns the
    /// address JS should fill. None: not a Data node, bad frame count, or out of memory.
    /// Drops a Data node's buffer entirely (the node goes back to having none).
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_clamps_frame_and_ignores_empty() {
        let mut d = alloc::vec![0.0; 2 * N];
        d[N] = 1.0;
        let mut out = [9.0; N];
        pick(&d, 0, &mut out);
        assert_eq!(out[0], 0.0);
        pick(&d, 1, &mut out);
        assert_eq!(out[0], 1.0);
        pick(&d, 255, &mut out);
        assert_eq!(out[0], 1.0);
        out[0] = 9.0;
        pick(&[], 0, &mut out);
        assert_eq!(out[0], 9.0);
    }

    #[test]
    fn alloc_only_for_data_nodes_and_freed_with_node() {
        let mut s = State::new();
        s.add_node(NodeKind::Gain, [0.0; 2], [0.0; 2]).unwrap();
        s.add_node(NodeKind::Data, [0.0; 2], [0.0; 2]).unwrap();
        assert!(s.data_alloc(0, 1).is_none());
        assert!(s.data_alloc(1, 0).is_none());
        assert!(s.data_alloc(1, 257).is_none());
        assert!(s.data_alloc(2, 1).is_none());
        assert!(s.data_alloc(1, 2).is_some());
        assert!(s.data_alloc(1, 3).is_some());
        assert_eq!((s.data.len(), s.data[0].1.len()), (1, 3 * N));
        assert_eq!((s.data_frames(1), s.data_frames(0)), (3, 0));
        assert!(s.data_of(0).is_none());
        s.remove_node(1);
        assert!(s.data.is_empty());
    }
}
