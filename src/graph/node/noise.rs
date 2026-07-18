pub struct NoiseNode;

use crate::graph::Buffer;
use crate::graph::NodeCategory;
use crate::graph::Param;

use super::NodeLogic;
use super::helpers;

impl NodeLogic for NoiseNode {
    fn title(&self) -> &'static str {
        "Noise"
    }

    fn category(&self) -> &'static [super::NodeCategory] {
        &[NodeCategory::Inputs]
    }

    fn input_count(&self) -> usize {
        0
    }

    fn output_count(&self) -> usize {
        1
    }

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        crate::params![
            Param::new_enum(
                "Algorithm",
                &[
                    "Xorshift",
                    "Splitmix64",
                    "Wyrand",
                    "Sfc64",
                    "Wang_hash",
                    "Jenkins",
                    "Lcg"
                ]
            ),
            Param::new_enum(
                "Color",
                &[
                    "White", "Pink", "Brown", "Blue", "Violet", "Green", "Orange", "Grey", "Black"
                ]
            ),
            Param::new_int("Seed", 1, 99999)
        ]
    }

    fn process(
        &self,
        inputs: &[&crate::graph::Buffer],
        params: &[Option<Param>; crate::graph::MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let alg = helpers::param(params, 0, 0.0) as u8;
        let color = helpers::param(params, 1, 0.0) as u8;
        let mut seed = helpers::param(params, 2, 0.0) as u64;

        macro_rules! loop_over {
            ($noise_fn:expr) => {{
                let mut noise_state = [0.0; 3];

                for sample in out.iter_mut() {
                    let init = norm($noise_fn(&mut seed));

                    *sample = match color {
                        1 => pink_noise(init, &mut noise_state),
                        2 => brown_noise(init, &mut noise_state[0]),
                        3 => blue_noise(init, &mut noise_state[0]),
                        4 => violet_noise(init, &mut noise_state[0]),
                        5 => green_noise(init, &mut noise_state[0..2].try_into().unwrap()),
                        7 => orange_noise(init, &mut noise_state[0..2].try_into().unwrap()),
                        8 => grey_noise(init, &mut noise_state),
                        9 => black_noise(init, &mut noise_state[0]),
                        _ => white_noise(init),
                    };
                }
            }};
        }

        match alg {
            0 => loop_over!(xorshift),
            1 => loop_over!(splitmix64),
            2 => loop_over!(wyrand),
            3 => loop_over!(sfc64),
            4 => loop_over!(wang_hash),
            5 => loop_over!(jenkins),
            6 => loop_over!(lcg),
            _ => helpers::pass(inputs, out),
        }

        helpers::normalize_buffer(out);
    }
}

#[inline]
fn white_noise(sample: f32) -> f32 {
    sample
}

#[inline]
fn pink_noise(sample: f32, state: &mut [f32; 3]) -> f32 {
    state[0] = state[0] * 0.99765 + sample * 0.0990460;
    state[1] = state[1] * 0.96300 + sample * 0.2965164;
    state[2] = state[2] * 0.57000 + sample * 1.0526913;

    state[0] + state[1] + state[2] + sample * 0.1848
}

#[inline]
fn brown_noise(sample: f32, state: &mut f32) -> f32 {
    *state += sample * 0.02;
    *state *= 0.9995;

    state.clamp(-1.0, 1.0)
}

#[inline]
fn blue_noise(sample: f32, state: &mut f32) -> f32 {
    let out = sample - *state;
    *state = sample;

    out.clamp(-1.0, 1.0)
}

#[inline]
fn violet_noise(sample: f32, state: &mut f32) -> f32 {
    let diff = sample - *state;
    *state = sample;

    let out = diff * 0.5;
    out.clamp(-1.0, 1.0)
}

#[inline]
fn green_noise(sample: f32, state: &mut [f32; 2]) -> f32 {
    state[0] = state[0] * 0.95 + sample * 0.05;
    state[1] = state[1] * 0.95 + state[0] * 0.05;

    (state[0] - state[1]).clamp(-1.0, 1.0)
}

#[inline]
fn orange_noise(sample: f32, state: &mut [f32; 2]) -> f32 {
    state[0] = state[0] * 0.99 + sample * 0.01;
    state[1] = state[1] * 0.999 + state[0] * 0.001;

    (sample - state[1]).clamp(-1.0, 1.0)
}

#[inline]
fn grey_noise(sample: f32, state: &mut [f32; 3]) -> f32 {
    state[0] = state[0] * 0.98 + sample * 0.02;
    state[1] = state[1] * 0.995 + state[0] * 0.005;
    state[2] = state[2] * 0.999 + state[1] * 0.001;

    (sample - state[0] * 0.5 - state[2] * 0.2).clamp(-1.0, 1.0)
}

#[inline]
fn black_noise(sample: f32, state: &mut f32) -> f32 {
    *state += sample * 0.0005;
    *state *= 0.99999;

    state.clamp(-1.0, 1.0)
}

#[inline]
fn norm(val: f32) -> f32 {
    val * 2.0 - 1.0
}

#[inline]
fn xorshift(x: &mut u64) -> f32 {
    *x ^= *x << 13;
    *x ^= *x >> 7;
    *x ^= *x << 17;

    let v = (*x >> 32) as u32;
    v as f32 / u32::MAX as f32
}

#[inline]
fn splitmix64(x: &mut u64) -> f32 {
    *x = x.wrapping_add(0x9E3779B97F4A7C15);

    let mut z = *x;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^= z >> 31;

    (z >> 32) as u32 as f32 / u32::MAX as f32
}

#[inline]
fn wyrand(x: &mut u64) -> f32 {
    *x = x.wrapping_add(0xa0761d6478bd642f);

    let t = (*x as u128).wrapping_mul((*x ^ 0xe7037ed1a0b428db) as u128);

    let r = ((t >> 64) as u64) ^ (t as u64);

    (r >> 32) as u32 as f32 / u32::MAX as f32
}

#[inline]
fn sfc64(x: &mut u64) -> f32 {
    *x = x
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407);

    let r = (*x ^ (*x >> 25)).rotate_left(27);

    (r >> 32) as u32 as f32 / u32::MAX as f32
}

#[inline]
fn wang_hash(x: &mut u64) -> f32 {
    let mut v = *x;

    v = (!v).wrapping_add(v << 21);
    v ^= v >> 24;
    v = v.wrapping_add(v << 3).wrapping_add(v << 8);
    v ^= v >> 14;
    v = v.wrapping_add(v << 2).wrapping_add(v << 4);
    v ^= v >> 28;
    v = v.wrapping_add(v << 31);

    *x = v;

    (v >> 32) as u32 as f32 / u32::MAX as f32
}

#[inline]
fn jenkins(x: &mut u64) -> f32 {
    *x = (*x).wrapping_add(0x7ed55d16);
    *x ^= *x >> 12;
    *x = (*x).wrapping_add(*x << 25);
    *x ^= *x >> 27;
    *x = (*x).wrapping_add(*x << 4);

    (*x >> 32) as u32 as f32 / u32::MAX as f32
}

#[inline]
fn lcg(x: &mut u64) -> f32 {
    *x = x.wrapping_mul(6364136223846793005).wrapping_add(1);

    (*x >> 32) as u32 as f32 / u32::MAX as f32
}
