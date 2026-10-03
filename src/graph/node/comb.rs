use super::helpers::{self};
use super::{BUFFER_LEN, Buffer, MAX_PARAMS, NodeCategory, NodeLogic, Param};
use super::{Label, label};

pub struct CombNode;

impl CombNode {
    pub const PARAMS: [Option<Param>; MAX_PARAMS] = crate::params![
        Param::new_int("Delay", 0, (BUFFER_LEN) as i32).with_unit("samp"),
        Param::new_int("Iter", 1, 35).with_unit("n")
    ];
}

impl NodeLogic for CombNode {
    fn title(&self) -> Label {
        label("Comb")
    }

    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Effect]
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
        let out = &mut outs[0];
        let delay = helpers::param(params, 0, 0.0) as usize;
        let iter = helpers::param(params, 1, 0.0) as usize;

        let src = helpers::input(inputs, 0);

        if iter == 0 {
            out[..BUFFER_LEN].copy_from_slice(&src[..BUFFER_LEN]);
            return;
        }

        let mut a = [0.0; BUFFER_LEN];
        let mut b = [0.0; BUFFER_LEN];

        for i in 0..BUFFER_LEN {
            a[i] = (src[i] + src[(i + delay) % BUFFER_LEN]) * 0.5;
        }

        for _ in 1..iter {
            for i in 0..BUFFER_LEN {
                b[i] = (a[i] + a[(i + delay) % BUFFER_LEN]) * 0.5;
            }

            core::mem::swap(&mut a, &mut b);
        }

        out[..BUFFER_LEN].copy_from_slice(&a[..BUFFER_LEN]);
    }
}
