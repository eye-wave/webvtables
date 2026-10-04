use super::helpers;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use crate::ffi;

const N: usize = BUFFER_LEN / 2;
const MAX_ORDER: usize = 48;

// LPC spectral envelope (including gain) at each harmonic of one cycle.
fn envelope(src: &Buffer, order: usize) -> [f32; N] {
    // Circular autocorrelation: exact for a periodic cycle.
    let mut r = [0.0f32; MAX_ORDER + 1];
    for (k, rk) in r.iter_mut().enumerate().take(order + 1) {
        let mut s = 0.0;
        for n in 0..BUFFER_LEN {
            s += src[n] * src[(n + k) % BUFFER_LEN];
        }
        *rk = s;
    }
    // Tiny white-noise floor keeps silence and pure sines from going singular.
    r[0] = r[0] * (1.0 + 1e-5) + 1e-9;

    // Levinson-Durbin.
    let mut a = [0.0f32; MAX_ORDER + 1];
    a[0] = 1.0;
    let mut e = r[0];
    for i in 1..=order {
        let mut acc = r[i];
        for j in 1..i {
            acc += a[j] * r[i - j];
        }
        let k = (-acc / e).clamp(-0.9999, 0.9999);
        let prev = a;
        for j in 1..i {
            a[j] = prev[j] + k * prev[i - j];
        }
        a[i] = k;
        e *= 1.0 - k * k;
    }
    let gain = ffi::sqrtf(e.max(1e-12));

    // |1 / A(e^jw)| at each harmonic.
    let mut env = [0.0f32; N];
    for (b, h) in env.iter_mut().enumerate() {
        let w = core::f32::consts::TAU * b as f32 / BUFFER_LEN as f32;
        let (mut re, mut im) = (1.0f32, 0.0f32);
        for (i, &ai) in a.iter().enumerate().take(order + 1).skip(1) {
            let ph = w * i as f32;
            re += ai * ffi::sinf(ph + core::f32::consts::FRAC_PI_2);
            im -= ai * ffi::sinf(ph);
        }
        *h = gain / ffi::sqrtf(re * re + im * im + 1e-12);
    }
    env
}

pub struct LpcNode;

impl NodeParamDef for LpcNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_enum("Mode", &["Smooth", "Whiten", "Cross"]),
        Param::new_int("Order", 1, MAX_ORDER as i32),
        Param::new_linear("Mix", 0.0, 100.0)
            .with_unit("%")
            .with_default_norm(1.0),
    ];
}

impl NodeLogic for LpcNode {
    fn title(&self) -> Label {
        label("LPC")
    }
    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Effect, NodeCategory::Fft]
    }
    fn input_count(&self) -> usize {
        2
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
        let mode = helpers::param(params, 0, 0.0) as u8;
        let order = (helpers::param(params, 1, 12.0) as usize).clamp(1, MAX_ORDER);
        let mix = (helpers::param(params, 2, 100.0) / 100.0) as f32;
        let a = helpers::input(inputs, 0);

        let env_a = envelope(a, order);
        let env_b = if mode == 2 {
            envelope(helpers::input(inputs, 1), order)
        } else {
            [1.0; N]
        };

        let mut samples = helpers::copy_of(a);
        let spectrum = microfft::real::rfft_2048(&mut samples);

        // Bin 0 packs DC and Nyquist, so it is left alone.
        for (k, spec) in spectrum.iter_mut().enumerate().skip(1) {
            let m = match mode {
                0 => {
                    let mag = ffi::sqrtf(spec.re * spec.re + spec.im * spec.im);
                    if mag > 1e-9 { env_a[k] / mag } else { 1.0 }
                }
                1 => 1.0 / env_a[k].max(1e-9),
                _ => env_b[k] / env_a[k].max(1e-9),
            };
            *spec *= 1.0 + mix * (m - 1.0);
        }

        helpers::irfft_2048(spectrum, &mut outs[0]);
        helpers::normalize_buffer(&mut outs[0]);
    }
}
