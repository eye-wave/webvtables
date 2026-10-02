use super::helpers;
use super::{Buffer, N, NodeCategory, NodeLogic};
use super::{Label, label};
use crate::ffi;
use crate::graph::{MAX_PARAMS, Param};

pub struct OutputNode;

impl NodeLogic for OutputNode {
    fn title(&self) -> Label {
        label("Output")
    }
    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Outputs]
    }
    fn input_count(&self) -> usize {
        1
    }
    fn output_count(&self) -> usize {
        0
    }
    fn has_widget(&self) -> bool {
        true
    }

    fn fill_widget(
        &self,
        inputs: &[&Buffer],
        _: &[Option<Param>; MAX_PARAMS],
        out: &mut Buffer,
    ) -> usize {
        let mut t = helpers::copy_of(helpers::input(inputs, 0));
        let bins = microfft::real::rfft_2048(&mut t);
        bins[0].im = 0.0;
        for (k, (o, b)) in out.iter_mut().zip(bins.iter()).enumerate() {
            let m =
                ffi::hypot(b.re as f64, b.im as f64) * if k == 0 { 1.0 } else { 2.0 } / N as f64;
            *o = (1.0 + 0.217147 * ffi::log(m.max(1e-4))) as f32;
        }
        N / 2
    }
}
