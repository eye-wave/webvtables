use super::data::current;
use super::helpers;
use super::{Buffer, MAX_PARAMS, N, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use alloc::vec::Vec;

/// Most points one curve may hold (the same cap as a keyframe lane).
pub const MAX_POINTS: usize = 1024;

pub struct WaveshaperNode;

impl NodeParamDef for WaveshaperNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_enum("Polarity", &["Bipolar", "Unipolar"]),
        Param::new_linear("In", -40.0, 60.0)
            .with_unit("dB")
            .with_default_denorm(0.0),
        Param::new_linear("Out", -40.0, 10.0)
            .with_unit("dB")
            .with_default_denorm(0.0),
        Param::new_linear("Mix", 0.0, 100.0)
            .with_unit("%")
            .with_default_norm(1.0),
    ];
}

impl NodeLogic for WaveshaperNode {
    fn title(&self) -> Label {
        label("Waveshaper")
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Effect, NodeCategory::Distortion]
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        Self::PARAMS
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let unipolar = helpers::param(params, 0, 0.0) as u8 == 1;
        let gain_in = helpers::param_db(params, 1, 0.0) as f32;
        let gain_out = helpers::param_db(params, 2, 0.0) as f32;
        let mix = helpers::param(params, 3, 100.0) as f32 / 100.0;

        let src = helpers::input(inputs, 0);
        let mut pts = points(current().unwrap_or(&[]));
        if unipolar {
            // the points are stored as -1..1 whatever the polarity; unipolar reads them as 0..1
            pts.iter_mut().for_each(|q| *q = q.map(|v| (v + 1.0) / 2.0));
        }
        for i in 0..N {
            let dry = src[i];
            let wet = shape(&pts, dry * gain_in, unipolar) * gain_out;
            outs[0][i] = dry + (wet - dry) * mix;
        }
    }
}

// The stored x y pairs, sorted by x (the editor keeps them in the order they were made).
fn points(d: &[f32]) -> Vec<[f32; 2]> {
    let mut p = d.as_chunks::<2>().0.to_vec();
    p.sort_by(|a, b| a[0].total_cmp(&b[0]));
    p
}

// Straight lines between the points, holding the first and last value beyond them; no points
// is a straight wire. Unipolar reads the curve at |x| and gives the sign back.
fn shape(p: &[[f32; 2]], x: f32, unipolar: bool) -> f32 {
    let (a, sign) = if unipolar { (x.abs(), x.signum()) } else { (x, 1.0) };
    let i = p.partition_point(|q| q[0] <= a); // first point right of a
    sign * match (i.checked_sub(1).map(|k| p[k]), p.get(i)) {
        (None, None) => a,
        (Some(l), None) => l[1],
        (None, Some(r)) => r[1],
        (Some(l), Some(r)) => l[1] + (r[1] - l[1]) * (a - l[0]) / (r[0] - l[0]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::{NodeKind, State};

    #[test]
    fn curve_between_holds_and_mirrors() {
        let p = points(&[1.0, 1.0, -1.0, -0.5, 0.0, 0.5]); // unsorted on purpose
        assert_eq!(shape(&p, -1.0, false), -0.5);
        assert_eq!(shape(&p, -0.5, false), 0.0);
        assert_eq!(shape(&p, 0.5, false), 0.75);
        assert_eq!(shape(&p, 3.0, false), 1.0); // holds past the last point
        assert_eq!(shape(&p, -3.0, false), -0.5);
        assert_eq!(shape(&p, -0.5, true), -0.75); // unipolar: odd mirror of the right half
        assert_eq!(shape(&[], -0.3, true), -0.3);
        assert_eq!(shape(&[], 0.3, false), 0.3);
        // the stored diagonal (-1,-1)..(1,1) is a wire in either polarity once remapped to 0..1
        let u = [[0.0, 0.0], [1.0, 1.0]];
        assert_eq!(shape(&u, -0.25, true), -0.25);
    }

    #[test]
    fn storage_takes_whole_pairs_or_frames_by_kind() {
        let mut s = State::new();
        s.add_node(NodeKind::Waveshaper, [0.0; 2], [0.0; 2]).unwrap();
        s.add_node(NodeKind::Data, [0.0; 2], [0.0; 2]).unwrap();
        assert!(s.data_alloc(0, 3).is_none() && s.data_alloc(0, 2 * MAX_POINTS + 2).is_none());
        assert!(s.data_alloc(0, 0).is_some() && s.data_alloc(0, 2 * MAX_POINTS).is_some());
        assert!(s.data_alloc(1, N + 1).is_none() && s.data_alloc(1, 0).is_none());
        assert!(s.data_alloc(1, N).is_some() && s.data_alloc(1, 256 * N).is_some());
    }
}
