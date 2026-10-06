use alloc::vec;
use alloc::vec::Vec;

use crate::graph::State;

pub struct Phys {
    seg: usize,
    step: f64,
    grav: f64,
    damp: f64,
    iter: usize,
    sleep: f64,
    stretch: f64,
    slack: f64,
}

impl Phys {
    pub const DEFAULT: Phys = Phys {
        seg: 10,
        step: 1.0 / 60.0,
        grav: 0.35,
        damp: 0.97,
        iter: 8,
        sleep: 0.02,
        stretch: 1.03,
        slack: 12.0,
    };
}

pub struct Rope {
    id: i32,
    p: Vec<f64>,
    q: Vec<f64>,
    awake: bool,
}

impl Rope {
    fn sim(&mut self, c: &Phys) -> bool {
        let (p, q) = (&mut self.p, &mut self.q);
        let e = 2 * c.seg;
        let rest = (libm::hypot(p[e] - p[0], p[e + 1] - p[1]) * c.stretch + c.slack) / c.seg as f64;

        for i in (2..e).step_by(2) {
            let (x, y) = (p[i], p[i + 1]);
            p[i] += (x - q[i]) * c.damp;
            p[i + 1] += (y - q[i + 1]) * c.damp + c.grav;
            q[i] = x;
            q[i + 1] = y;
        }
        for _ in 0..c.iter {
            for i in (0..e).step_by(2) {
                let (dx, dy) = (p[i + 2] - p[i], p[i + 3] - p[i + 1]);
                let d = libm::hypot(dx, dy);
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
        moved > c.sleep
    }

    fn dist(&self, x: f64, y: f64, i: usize) -> f64 {
        let p = &self.p;
        let (ax, ay) = (p[i], p[i + 1]);
        let (bx, by) = (p[i + 2] - ax, p[i + 3] - ay);
        let l = bx * bx + by * by;
        let t = (((x - ax) * bx + (y - ay) * by) / if l == 0.0 { 1.0 } else { l }).clamp(0.0, 1.0);
        libm::hypot(x - ax - bx * t, y - ay - by * t)
    }
}

impl State {
    fn rope_at(&self, id: i32) -> Option<usize> {
        self.ropes.iter().position(|r| r.id == id)
    }

    pub fn rope_pin(&mut self, id: i32, a: [f64; 2], b: [f64; 2]) {
        let i = self.rope_at(id).unwrap_or_else(|| {
            let seg = self.phys.seg;
            let mut p = vec![0.0; 2 * (seg + 1)];
            for k in 0..=seg {
                let (k, s) = (k as f64, seg as f64);
                p[2 * k as usize] = a[0] + (b[0] - a[0]) * k / s;
                p[2 * k as usize + 1] = a[1] + (b[1] - a[1]) * k / s;
            }
            self.ropes.push(Rope {
                id,
                q: p.clone(),
                p,
                awake: true,
            });
            self.ropes.len() - 1
        });
        let r = &mut self.ropes[i];
        let e = 2 * self.phys.seg;
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

    pub fn rope_clear_links(&mut self) {
        self.ropes.retain(|r| r.id < 0);
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

    pub fn rope_cfg(&mut self, i: i32, v: f64) {
        let c = &mut self.phys;
        match i {
            0 => {
                c.seg = (v as usize).clamp(2, 64);
                self.ropes.clear(); // wrong length now; JS re-pins links every frame
            }
            1 => c.step = v.max(1e-3),
            2 => c.grav = v,
            3 => c.damp = v,
            4 => c.iter = v as usize,
            5 => c.sleep = v,
            6 => c.stretch = v,
            7 => c.slack = v,
            _ => {}
        }
        for r in &mut self.ropes {
            r.awake = true;
        }
    }

    pub fn rope_step(&mut self, dt: f64) -> bool {
        let c = &self.phys;
        self.rope_acc = (self.rope_acc + dt).min(0.1);
        while self.rope_acc >= c.step {
            for r in self.ropes.iter_mut().filter(|r| r.awake) {
                r.awake = r.sim(c);
            }
            self.rope_acc -= c.step;
        }
        self.ropes.iter().any(|r| r.awake)
    }

    pub fn rope_hit(&self, x: f64, y: f64, mut r: f64) -> i32 {
        let mut best = -1;
        for rope in self.ropes.iter().filter(|r| r.id >= 0) {
            for i in 0..self.phys.seg {
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
            for i in 0..self.phys.seg {
                self.rope_out
                    .extend(r.p[2 * i..2 * i + 4].iter().map(|&v| v as f32));
                self.rope_out.push((r.id == hot) as u8 as f32);
            }
        }
        self.rope_out.len()
    }
}
