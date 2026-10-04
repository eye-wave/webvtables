use super::helpers::{self, magnitude};
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::{Label, label};
use microfft::Complex32;

pub struct PhaseCopyNode;

impl NodeLogic for PhaseCopyNode {
    fn title(&self) -> Label {
        label("Phase copy")
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Combine, NodeCategory::Fft]
    }

    fn input_count(&self) -> usize {
        2
    }

    fn output_count(&self) -> usize {
        1
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        _params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        let out = &mut outs[0];
        let a = helpers::input(inputs, 0);
        let b = helpers::input(inputs, 1);
        let bins = BUFFER_LEN / 2;

        let mut a_time = helpers::copy_of(a);
        let mut b_time = helpers::copy_of(b);
        let a_spec = microfft::real::rfft_2048(&mut a_time);
        let b_spec = microfft::real::rfft_2048(&mut b_time);

        a_spec[0] = Complex32::new(
            a_spec[0].re.abs() * b_spec[0].re.signum(),
            a_spec[0].im.abs() * b_spec[0].im.signum(),
        );

        for k in 1..bins {
            let (ma, mb) = (magnitude(&a_spec[k]), magnitude(&b_spec[k]));
            a_spec[k] = if mb > 1e-30 {
                b_spec[k] * (ma / mb)
            } else {
                Complex32::new(ma, 0.0)
            };
        }

        helpers::irfft_2048(a_spec, out);
    }
}
