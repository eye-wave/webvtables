use crate::draw::{DrawBuf, camera};
use crate::ffi;
use crate::graph::{BUFFER_LEN, GraphState, Node};
use crate::graph::{MAX_PARAMS, Param};

use super::NodeLogic;
use super::helpers;

pub struct OutputNode;

impl NodeLogic for OutputNode {
    fn title(&self) -> &'static str {
        "Output"
    }

    fn category(&self) -> &'static [super::NodeCategory] {
        &[super::NodeCategory::Outputs]
    }

    fn input_count(&self) -> usize {
        1
    }

    fn output_count(&self) -> usize {
        0
    }

    fn default_params(&self) -> [Option<crate::graph::Param>; crate::graph::MAX_PARAMS] {
        crate::params![Param::new_bool("Peaks", true, Some(&["Normalize", "Clip"]))]
    }

    fn process(
        &self,
        inputs: &[&crate::graph::Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        _state: &mut super::NodeState,
        out: &mut crate::graph::Buffer,
    ) {
        let use_hard_clip = helpers::param_bool(params, 0, true);

        *out = *helpers::input(inputs, 0);

        if use_hard_clip {
            for sample in out.iter_mut() {
                *sample = sample.clamp(-1.0, 1.0);
            }
        } else {
            let mut max_peak: f32 = 0.0;
            for sample in out.iter() {
                let abs_sample = sample.abs();
                if abs_sample > max_peak {
                    max_peak = abs_sample;
                }
            }

            if max_peak > 0.0 {
                let scale_factor = 1.0 / max_peak;
                for sample in out.iter_mut() {
                    *sample *= scale_factor;
                }
            }
        }
    }

    fn has_widget(&self) -> bool {
        true
    }

    fn draw_widget(
        &self,
        _node: &Node,
        i: usize,
        s: &GraphState,
        ctx: &mut DrawBuf,
        rect: (f32, f32, f32, f32),
    ) -> bool {
        let (x, y, w, h) = rect;

        let mut samples: crate::graph::Buffer = s.buffers.as_ref().unwrap()[i];
        let spectrum = microfft::real::rfft_2048(&mut samples);
        let bins = BUFFER_LEN / 2;

        ctx.fill_style([16, 16, 20]);
        ctx.fill_rect(x, y, w, h, true);

        let db_min = -60.0f32;
        let db_max = 0.0f32;

        let mut peak_mag = 1e-6f32;
        for s in spectrum.iter().take(bins).skip(1) {
            let c = s;
            peak_mag = peak_mag.max(ffi::sqrtf(c.re * c.re + c.im * c.im));
        }
        let db_floor = 20.0 * ffi::log10f(peak_mag);
        let db_to_y =
            |db: f32| y + h * (1.0 - (db.clamp(db_min, db_max) - db_min) / (db_max - db_min));

        ctx.stroke_style([100, 220, 160]);
        ctx.line_width(1.0);

        static mut POINTS: [f32; BUFFER_LEN * 2] = [0.0; BUFFER_LEN * 2];

        let cam = camera();

        for i in 0..BUFFER_LEN {
            let t = i as f32 / (BUFFER_LEN - 1) as f32;

            let bin = ffi::powf(bins as f32, t).clamp(1.0, (bins - 1) as f32);
            let k = bin as usize;

            let mag = if k < bins / 2 && k < bins - 1 {
                // interpolate
                let fract = bin - k as f32;
                let c1 = spectrum[k];
                let c2 = spectrum[k + 1];
                let mag1 = ffi::sqrtf(c1.re * c1.re + c1.im * c1.im);
                let mag2 = ffi::sqrtf(c2.re * c2.re + c2.im * c2.im);

                mag1 + fract * (mag2 - mag1)
            } else {
                let c = spectrum[k];
                ffi::sqrtf(c.re * c.re + c.im * c.im)
            };

            let db = 20.0 * ffi::log10f(mag.max(1e-6)) - db_floor;

            let px_x = x + (t * w);
            let px_y = db_to_y(db);

            unsafe {
                POINTS[i * 2] = cam.tx(px_x);
                POINTS[i * 2 + 1] = cam.ty(px_y);
            }
        }

        ctx.stroke_points_ref(unsafe { &POINTS });

        true
    }
}
