use super::helpers;
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use crate::ffi;

const N: usize = BUFFER_LEN / 2;

pub struct BlurNode;

impl NodeParamDef for BlurNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_enum("Mode", &["Magnitude", "Complex"]),
        Param::new_linear("Width", 0.0, 1024.0)
            .with_unit("harm")
            .with_default_denorm(4.0),
        Param::new_linear("Mix", 0.0, 100.0)
            .with_unit("%")
            .with_default_norm(1.0),
    ];
}

impl NodeLogic for BlurNode {
    fn title(&self) -> Label {
        label("Spectral Blur")
    }
    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Effect, NodeCategory::Fft]
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
        let complex = helpers::param(params, 0, 0.0) as u8 == 1;
        let r = helpers::param(params, 1, 4.0).max(0.0) as usize;
        let mix = (helpers::param(params, 2, 100.0) / 100.0) as f32;

        let mut samples = helpers::copy_of(helpers::input(inputs, 0));
        let spectrum = microfft::real::rfft_2048(&mut samples);

        let mut re = [0.0f32; N];
        let mut im = [0.0f32; N];
        let mut mag = [0.0f32; N];
        for (k, s) in spectrum.iter().enumerate() {
            re[k] = s.re;
            im[k] = s.im;
            mag[k] = ffi::sqrtf(s.re * s.re + s.im * s.im);
        }

        for k in 1..N {
            let (mut sr, mut si, mut sm, mut sw) = (0.0, 0.0, 0.0, 0.0);
            for j in k.saturating_sub(r).max(1)..=(k + r).min(N - 1) {
                let w = 1.0 - j.abs_diff(k) as f32 / (r + 1) as f32;
                sr += w * re[j];
                si += w * im[j];
                sm += w * mag[j];
                sw += w;
            }

            let (tr, ti) = if complex {
                (sr / sw, si / sw)
            } else {
                let nm = sm / sw;
                if mag[k] > 1e-9 {
                    (re[k] * nm / mag[k], im[k] * nm / mag[k])
                } else {
                    (nm, 0.0)
                }
            };

            spectrum[k].re = re[k] + mix * (tr - re[k]);
            spectrum[k].im = im[k] + mix * (ti - im[k]);
        }

        helpers::irfft_2048(spectrum, &mut outs[0]);
    }
}
