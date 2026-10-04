use super::helpers;
use super::{Buffer, MAX_PARAMS, NodeCategory, NodeLogic, NodeParamDef, Param};
use super::{Label, label};
use microfft::Complex32;

pub struct EvenOddNode;

impl NodeParamDef for EvenOddNode {
    const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_linear("Bleed", 0.0, 100.0)
            .with_unit("%")
            .with_default_denorm(0.0),
    ];
}

impl NodeLogic for EvenOddNode {
    fn title(&self) -> Label {
        label("Even/Odd Split")
    }
    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Effect, NodeCategory::Fft]
    }
    fn input_count(&self) -> usize {
        1
    }
    fn output_count(&self) -> usize {
        2
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
        let bleed = (helpers::param(params, 0, 0.0) / 100.0) as f32;
        let mut samples = helpers::copy_of(helpers::input(inputs, 0));
        let spectrum = microfft::real::rfft_2048(&mut samples);

        let mut odd = helpers::boxed(Complex32::new(0.0, 0.0));
        odd.copy_from_slice(spectrum);

        for (k, (e, o)) in spectrum.iter_mut().zip(odd.iter_mut()).enumerate() {
            let (se, so) = (*e, *o);
            if k == 0 {
                *e = se;
                *o = Complex32::new(0.0, 0.0);
            } else if k % 2 == 0 {
                *e = se;
                *o = se * bleed;
            } else {
                *e = so * bleed;
                *o = so;
            }
        }

        helpers::irfft_2048(spectrum, &mut outs[0]);
        helpers::irfft_2048(&odd, &mut outs[1]);
    }
}
