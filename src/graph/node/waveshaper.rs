use super::data::current;
use super::helpers;
use super::{Buffer, MAX_PARAMS, N, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use alloc::vec::Vec;

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
            pts.iter_mut().for_each(|q| *q = q.map(|v| (v + 1.0) / 2.0));
        }
        for i in 0..N {
            let dry = src[i];
            let wet = shape(&pts, dry * gain_in, unipolar) * gain_out;
            outs[0][i] = dry + (wet - dry) * mix;
        }
    }
}

fn points(d: &[f32]) -> Vec<[f32; 2]> {
    let mut p = d.as_chunks::<2>().0.to_vec();
    p.sort_by(|a, b| a[0].total_cmp(&b[0]));
    p
}

fn shape(p: &[[f32; 2]], x: f32, unipolar: bool) -> f32 {
    let (a, sign) = if unipolar {
        (x.abs(), x.signum())
    } else {
        (x, 1.0)
    };
    let i = p.partition_point(|q| q[0] <= a);
    sign * match (i.checked_sub(1).map(|k| p[k]), p.get(i)) {
        (None, None) => a,
        (Some(l), None) => l[1],
        (None, Some(r)) => r[1],
        (Some(l), Some(r)) => l[1] + (r[1] - l[1]) * (a - l[0]) / (r[0] - l[0]),
    }
}
