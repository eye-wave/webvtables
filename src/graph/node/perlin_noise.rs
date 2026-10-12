use crate::ffi;

use super::helpers;
use super::noise::wyrand;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use heapless::vec::Vec;

pub struct PerlinNoiseNode;

impl NodeParamDef for PerlinNoiseNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_int("Seed", 0, 65535).with_default_denorm(1.0),
        Param::new_int("Octaves", 1, 12).with_default_denorm(4.0),
        Param::new_linear("Persistence", 0.0, 1.0).with_default_denorm(0.5),
        Param::new_int("Frequency", 1, 128).with_default_denorm(4.0),
    ];
}

impl NodeLogic for PerlinNoiseNode {
    fn title(&self) -> Label {
        label("Perlin Noise")
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

        let seed = helpers::param(params, 0, 1.0) as u64;
        let octaves = (helpers::param(params, 1, 4.0) as usize).clamp(1, 12);
        let persistence = helpers::param(params, 2, 0.5).clamp(0.0, 1.0) as f32;
        let frequency = (helpers::param(params, 3, 4.0) as usize).clamp(1, 128);

        let max_frequency = BUFFER_LEN / 2;
        let mut state = seed;

        let mut gradients: Vec<f32, 128> = Vec::new();

        let mut lattice_size = frequency;
        for _ in 1..octaves {
            lattice_size = (lattice_size * 2).min(max_frequency);
        }
        lattice_size = lattice_size.clamp(1, 128);

        for _ in 0..lattice_size {
            let g = wyrand(&mut state) * 2.0 - 1.0;
            let _ = gradients.push(g);
        }

        let fade = |t: f32| t * t * t * (t * (t * 6.0 - 15.0) + 10.0);

        for (n, sample) in out.iter_mut().enumerate() {
            let phase = n as f32 / BUFFER_LEN as f32;
            let mut value = 0.0_f32;
            let mut amplitude = 1.0_f32;
            let mut amplitude_sum = 0.0_f32;
            let mut octave_frequency = frequency;

            for _ in 0..octaves {
                let cells = octave_frequency.min(gradients.len()).max(1);
                let position = phase * cells as f32;
                let cell = ffi::floorf(position) as usize;
                let t = position - cell as f32;

                let g0 = gradients[cell % gradients.len()];
                let g1 = gradients[(cell + 1) % gradients.len()];

                let d0 = g0 * t;
                let d1 = g1 * (t - 1.0);
                let u = fade(t);

                value += (d0 + (d1 - d0) * u) * amplitude;
                amplitude_sum += amplitude;

                amplitude *= persistence;
                octave_frequency = (octave_frequency * 2).min(max_frequency);
            }

            *sample = if amplitude_sum > 0.0 {
                value / amplitude_sum
            } else {
                0.0
            };
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
