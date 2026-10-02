use crate::graph::State;

const SEG: usize = 10;
const N: usize = 2 * (SEG + 1);
const STEP: f64 = 1.0 / 60.0;
const GRAV: f64 = 0.35;
const DAMP: f64 = 0.97;
const ITER: usize = 8;
const SLEEP: f64 = 0.02;

pub struct Rope {
    id: i32,
    p: [f64; N],
    q: [f64; N],
    awake: bool,
}

use crate::ffi;

impl Rope {
    fn sim(&mut self) -> bool {
        let (p, q) = (&mut self.p, &mut self.q);
        let e = 2 * SEG;
        let rest = (ffi::hypot(p[e] - p[0], p[e + 1] - p[1]) * 1.03 + 12.0) / SEG as f64;

        for i in (2..e).step_by(2) {
            let (x, y) = (p[i], p[i + 1]);
            p[i] += (x - q[i]) * DAMP;
            p[i + 1] += (y - q[i + 1]) * DAMP + GRAV;
            q[i] = x;
            q[i + 1] = y;
        }
        for _ in 0..ITER {
            for i in (0..e).step_by(2) {
                let (dx, dy) = (p[i + 2] - p[i], p[i + 3] - p[i + 1]);
                let d = ffi::hypot(dx, dy);
                if d <= rest {
                    continue;
                }
                let m = (d - rest) / d;
                let a = if i == 0 {
                    0.0
                } else if i + 2 == e {
                    1.0
                } else {
                    0.5
                };
                p[i] += dx * m * a;
                p[i + 1] += dy * m * a;
                p[i + 2] -= dx * m * (1.0 - a);
                p[i + 3] -= dy * m * (1.0 - a);
            }
        }

        let mut moved = 0f64;
        for i in 2..e {
            moved = moved.max((p[i] - q[i]).abs());
        }
        moved > SLEEP
    }

    fn dist(&self, x: f64, y: f64, i: usize) -> f64 {
        let p = &self.p;
        let (ax, ay) = (p[i], p[i + 1]);
        let (bx, by) = (p[i + 2] - ax, p[i + 3] - ay);
        let l = bx * bx + by * by;
        let t = (((x - ax) * bx + (y - ay) * by) / if l == 0.0 { 1.0 } else { l }).clamp(0.0, 1.0);
        ffi::hypot(x - ax - bx * t, y - ay - by * t)
    }
}

impl State {
    fn rope_at(&self, id: i32) -> Option<usize> {
        self.ropes.iter().position(|r| r.id == id)
    }

    pub fn rope_pin(&mut self, id: i32, a: [f64; 2], b: [f64; 2]) {
        let i = self.rope_at(id).unwrap_or_else(|| {
            let mut p = [0.0; N];
            for k in 0..=SEG {
                let (k, s) = (k as f64, SEG as f64);
                p[2 * k as usize] = a[0] + (b[0] - a[0]) * k / s;
                p[2 * k as usize + 1] = a[1] + (b[1] - a[1]) * k / s;
            }
            self.ropes.push(Rope {
                id,
                p,
                q: p,
                awake: true,
            });
            self.ropes.len() - 1
        });
        let r = &mut self.ropes[i];
        let e = 2 * SEG;
        if [r.p[0], r.p[1], r.p[e], r.p[e + 1]] != [a[0], a[1], b[0], b[1]] {
            [r.p[0], r.p[1], r.p[e], r.p[e + 1]] = [a[0], a[1], b[0], b[1]];
            r.awake = true;
        }
    }

    pub fn rope_drop(&mut self, id: i32) {
        if let Some(i) = self.rope_at(id) {
            self.ropes.remove(i);
        }
    }

    pub fn rope_rename(&mut self, from: i32, to: i32) {
        let Some(i) = self.rope_at(from) else { return };
        let mut r = self.ropes.remove(i);
        r.id = to;
        match self.rope_at(to) {
            Some(j) => self.ropes[j] = r,
            None => self.ropes.push(r),
        }
    }

    pub fn rope_step(&mut self, dt: f64) -> bool {
        self.rope_acc = (self.rope_acc + dt).min(0.1);
        while self.rope_acc >= STEP {
            for r in self.ropes.iter_mut().filter(|r| r.awake) {
                r.awake = r.sim();
            }
            self.rope_acc -= STEP;
        }
        self.ropes.iter().any(|r| r.awake)
    }

    pub fn rope_hit(&self, x: f64, y: f64, mut r: f64) -> i32 {
        let mut best = -1;
        for rope in self.ropes.iter().filter(|r| r.id >= 0) {
            for i in 0..SEG {
                let d = rope.dist(x, y, 2 * i);
                if d < r {
                    (best, r) = (rope.id, d);
                }
            }
        }
        best
    }

    pub fn rope_segments(&mut self, hot: i32) -> usize {
        self.rope_out.clear();
        for r in &self.ropes {
            for i in 0..SEG {
                self.rope_out
                    .extend(r.p[2 * i..2 * i + 4].iter().map(|&v| v as f32));
                self.rope_out.push((r.id == hot) as u8 as f32);
            }
        }
        self.rope_out.len()
    }
}
