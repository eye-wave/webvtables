use super::helpers;
use super::noise::wyrand;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use heapless::vec::Vec;

pub struct PolylineNode;

impl NodeParamDef for PolylineNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_int("Points", 2, 128).with_default_denorm(16.0),
        Param::new_int("Seed", 0, 65535).with_default_denorm(1.0),
    ];
}

impl NodeLogic for PolylineNode {
    fn title(&self) -> Label {
        label("Polyline")
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

    fn process(&self, _: &[&Buffer], params: &[Option<Param>; MAX_PARAMS], outs: &mut [Buffer]) {
        let out = &mut outs[0];

        let count = (helpers::param(params, 0, 16.0) as usize).clamp(2, 128);
        let seed = helpers::param(params, 1, 1.0) as u64;

        let mut state = seed;
        let mut points: Vec<(f32, f32), 128> = Vec::new();

        for i in 0..count {
            let rx = wyrand(&mut state);
            let ry = wyrand(&mut state);

            let base_x = i as f32 / count as f32;
            let jitter = rx * 0.8 - 0.4;
            let x = (base_x + jitter / count as f32).clamp(0.0, 1.0);
            let y = ry * 2.0 - 1.0;

            let _ = points.push((x, y));
        }

        points.sort_by(|a, b| a.0.total_cmp(&b.0));

        for (n, sample) in out.iter_mut().enumerate() {
            let x = n as f32 / BUFFER_LEN as f32;
            let mut value = points[0].1;

            for i in 0..points.len() {
                let (x0, y0) = points[i];
                let (x1, y1) = if i + 1 < points.len() {
                    points[i + 1]
                } else {
                    (points[0].0 + 1.0, points[0].1)
                };

                let query_x = if x < x0 { x + 1.0 } else { x };

                if query_x >= x0 && query_x < x1 {
                    let t = (query_x - x0) / (x1 - x0).max(1e-9);
                    value = y0 + (y1 - y0) * t;
                    break;
                }
            }

            *sample = value;
        }

        let mean = out.iter().sum::<f32>() / BUFFER_LEN as f32;

        for sample in out.iter_mut() {
            *sample -= mean;
        }

        let peak = out.iter().fold(1e-9_f32, |m, &x| m.max(x.abs()));

        for sample in out.iter_mut() {
            *sample /= peak;
        }
    }
}
