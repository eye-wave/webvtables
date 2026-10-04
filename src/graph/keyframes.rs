use super::State;
use alloc::{format, string::String, vec::Vec};
use serde::{Deserialize, Serialize};

pub const FRAMES: f32 = 255.0;
pub const NAME_MAX: usize = 48;
const LANES_MAX: usize = 256;
const KEYS_MAX: usize = 1024;
pub const CURVE_LEN: usize = 511;

#[derive(Clone, Copy, Serialize, Deserialize)]
pub struct Key {
    pub t: u8,
    pub v: f32,
    // Where the segment to the next key sits at its midpoint, 0..1 of the way from this value to the next (0.5 = straight).
    pub c: f32,
}

pub const LFO_PARAMS: usize = 6;

#[derive(Clone, Serialize, Deserialize)]
pub enum Source {
    Points(Vec<Key>),
    Lfo([f32; LFO_PARAMS]),
}

#[derive(Clone)]
pub struct Lane {
    pub name: String,
    pub source: Source,

    pub targets: Vec<(u32, u8)>,
}

pub struct Keyframes {
    pub lanes: Vec<Lane>,
}

impl Keyframes {
    pub const fn new() -> Self {
        Self { lanes: Vec::new() }
    }

    pub fn valid(&self, s: &State) -> bool {
        let unit = |v: &f32| v.is_finite();
        self.lanes.len() <= LANES_MAX
            && self.lanes.iter().enumerate().all(|(i, l)| {
                l.name.len() <= NAME_MAX
                    && match &l.source {
                        Source::Points(k) => {
                            k.len() <= KEYS_MAX && k.iter().all(|k| unit(&k.v) && unit(&k.c))
                        }
                        Source::Lfo(p) => p.iter().all(unit),
                    }
                    && l.targets.len() <= KEYS_MAX
                    && l.targets.iter().enumerate().all(|(k, t)| {
                        s.nodes.contains(&t.0)
                            && s.param_slot(t.0, t.1 as usize).is_some()
                            && !l.targets[..k].contains(t)
                            && !self.lanes[..i].iter().any(|o| o.targets.contains(t))
                    })
            })
    }
}

fn wave(p: &[f32; LFO_PARAMS], t: f32) -> f32 {
    let [shape, phase, amp, freq, skew, dc] = *p;
    let c = libm::powf(32.0, freq) * t / FRAMES + phase;
    let ph = c - libm::floorf(c);
    let k = skew.clamp(0.01, 0.99);
    let q = if ph < k {
        0.5 * ph / k
    } else {
        0.5 + 0.5 * (ph - k) / (1.0 - k)
    };
    let w = match ((shape * 4.0) as usize).min(3) {
        0 => libm::sinf(core::f32::consts::TAU * q),
        1 => {
            if q < 0.5 {
                4.0 * q - 1.0
            } else {
                3.0 - 4.0 * q
            }
        }
        2 => 2.0 * q - 1.0,
        _ => {
            if q < 0.5 {
                1.0
            } else {
                -1.0
            }
        }
    };
    0.5 + 0.5 * amp * w + (dc - 0.5)
}

impl Source {
    pub fn at(&self, t: f32) -> Option<f32> {
        let k = match self {
            Source::Lfo(p) => return Some(wave(p, t)),
            Source::Points(k) => k,
        };
        let (mut lo, mut hi): (Option<&Key>, Option<&Key>) = (None, None);
        for x in k {
            let xt = x.t as f32;
            if xt <= t && lo.is_none_or(|l| x.t >= l.t) {
                lo = Some(x);
            }
            if xt >= t && hi.is_none_or(|h| x.t < h.t) {
                hi = Some(x);
            }
        }
        Some(match (lo, hi) {
            (None, None) => return None,
            (Some(a), None) => a.v,
            (None, Some(b)) => b.v,
            (Some(a), Some(b)) if a.t == b.t => b.v,
            (Some(a), Some(b)) => {
                a.v + (b.v - a.v) * bend((t - a.t as f32) / (b.t - a.t) as f32, a.c)
            }
        })
    }
}

// x^p with p chosen so that bend(0.5, c) == c.
fn bend(x: f32, c: f32) -> f32 {
    let c = c.clamp(0.02, 0.98);
    if (c - 0.5).abs() < 1e-4 {
        return x;
    }
    libm::powf(x, libm::logf(c) / libm::logf(0.5))
}

fn unit(v: f32) -> f32 {
    if v.is_finite() {
        v.clamp(0.0, 1.0)
    } else {
        0.0
    }
}

static mut DRIVEN: Vec<u32> = Vec::new();
static mut DUMP: Vec<f32> = Vec::new();
static mut CURVE: [f32; CURVE_LEN] = [0.0; CURVE_LEN];
static mut TARGETS: Vec<u32> = Vec::new();
pub static mut NAME: [u8; NAME_MAX] = [0; NAME_MAX];

pub fn driven_ptr() -> usize {
    unsafe { (&raw const DRIVEN).as_ref().unwrap().as_ptr() as usize }
}
pub fn dump_ptr() -> usize {
    unsafe { (&raw const DUMP).as_ref().unwrap().as_ptr() as usize }
}
pub fn curve_ptr() -> usize {
    (&raw const CURVE) as usize
}
pub fn targets_ptr() -> usize {
    unsafe { (&raw const TARGETS).as_ref().unwrap().as_ptr() as usize }
}
pub fn name_ptr() -> usize {
    (&raw const NAME) as usize
}

impl State {
    pub fn apply_keyframes(&mut self, frame: f32) -> usize {
        let driven = unsafe { &mut DRIVEN };
        driven.clear();
        for i in 0..self.keyframes.lanes.len() {
            let Some(v) = self.keyframes.lanes[i].source.at(frame) else {
                continue;
            };
            for k in 0..self.keyframes.lanes[i].targets.len() {
                let (node, j) = self.keyframes.lanes[i].targets[k];
                let Some(slot) = self.param_slot(node, j as usize) else {
                    continue;
                };
                self.arena.slice_mut::<f32>(slot, 1)[0] = unit(v);
                driven.push((self.arena.base() + slot as usize) as u32);
            }
        }
        driven.len()
    }

    pub fn lane_dump(&self) -> usize {
        let d = unsafe { &mut DUMP };
        d.clear();
        d.push(self.keyframes.lanes.len() as f32);
        for l in &self.keyframes.lanes {
            match &l.source {
                Source::Points(k) => {
                    d.extend([0.0, k.len() as f32]);
                    k.iter().for_each(|k| d.extend([k.t as f32, k.v, k.c]));
                }
                Source::Lfo(p) => {
                    d.extend([1.0, LFO_PARAMS as f32]);
                    d.extend(p);
                }
            }
        }
        d.len()
    }

    pub fn lane_curve(&self, lane: usize) -> usize {
        let Some(l) = self.keyframes.lanes.get(lane) else {
            return 0;
        };
        let curve = unsafe { &mut CURVE };
        for (i, c) in curve.iter_mut().enumerate() {
            let Some(v) = l.source.at(i as f32 / 2.0) else {
                return 0;
            };
            *c = unit(v);
        }
        CURVE_LEN
    }

    pub fn lane_targets(&self, lane: usize) -> usize {
        let t = unsafe { &mut TARGETS };
        t.clear();
        for &(n, j) in self
            .keyframes
            .lanes
            .get(lane)
            .map_or(&[][..], |l| &l.targets)
        {
            if let Some(slot) = self.param_slot(n, j as usize) {
                t.push((self.arena.base() + slot as usize) as u32);
            }
        }
        t.len()
    }

    pub fn lane_add(&mut self, lfo: bool) -> Option<usize> {
        let ls = &mut self.keyframes.lanes;
        if ls.len() >= LANES_MAX {
            return None;
        }
        let same = ls
            .iter()
            .filter(|l| matches!(l.source, Source::Lfo(_)) == lfo)
            .count();
        ls.push(Lane {
            name: if lfo {
                format!("LFO {}", same + 1)
            } else {
                format!("Points {}", same + 1)
            },
            source: if lfo {
                Source::Lfo([0.0, 0.0, 1.0, 0.2, 0.5, 0.5])
            } else {
                Source::Points(Vec::new())
            },
            targets: Vec::new(),
        });
        Some(ls.len() - 1)
    }

    pub fn lane_remove(&mut self, lane: usize) {
        if lane < self.keyframes.lanes.len() {
            self.keyframes.lanes.remove(lane);
        }
    }

    pub fn lane_rename(&mut self, lane: usize, name: &[u8]) -> bool {
        match (
            self.keyframes.lanes.get_mut(lane),
            core::str::from_utf8(name),
        ) {
            (Some(l), Ok(n)) if n.len() <= NAME_MAX => {
                l.name = n.into();
                true
            }
            _ => false,
        }
    }

    pub fn lane_link(&mut self, lane: usize, node_addr: usize, param: u8, on: bool) -> bool {
        let Some(off) = node_addr
            .checked_sub(self.arena.base())
            .and_then(|o| u32::try_from(o).ok())
        else {
            return false;
        };
        let t = (off, param);
        if lane >= self.keyframes.lanes.len()
            || !self.nodes.contains(&off)
            || self.param_slot(off, param as usize).is_none()
        {
            return false;
        }
        let ls = &mut self.keyframes.lanes;
        if !on {
            ls[lane].targets.retain(|x| *x != t);
            return true;
        }
        if ls
            .iter()
            .enumerate()
            .any(|(i, l)| i != lane && l.targets.contains(&t))
            || ls[lane].targets.len() >= KEYS_MAX
        {
            return false;
        }
        if !ls[lane].targets.contains(&t) {
            ls[lane].targets.push(t);
        }
        true
    }

    fn points(&mut self, lane: usize) -> Option<&mut Vec<Key>> {
        match &mut self.keyframes.lanes.get_mut(lane)?.source {
            Source::Points(k) => Some(k),
            Source::Lfo(_) => None,
        }
    }

    pub fn key_add(&mut self, lane: usize, t: u8, v: f32) -> Option<usize> {
        let k = self.points(lane).filter(|k| k.len() < KEYS_MAX)?;
        k.push(Key {
            t,
            v: unit(v),
            c: 0.5,
        });
        Some(k.len() - 1)
    }

    pub fn key_set(&mut self, lane: usize, i: usize, t: u8, v: f32) -> bool {
        self.points(lane)
            .and_then(|k| k.get_mut(i))
            .map(|k| (k.t, k.v) = (t, unit(v)))
            .is_some()
    }

    pub fn key_curve(&mut self, lane: usize, i: usize, c: f32) -> bool {
        self.points(lane)
            .and_then(|k| k.get_mut(i))
            .map(|k| k.c = unit(c))
            .is_some()
    }

    pub fn key_remove(&mut self, lane: usize, i: usize) {
        if let Some(k) = self.points(lane).filter(|k| i < k.len()) {
            k.remove(i);
        }
    }

    pub fn lfo_set(&mut self, lane: usize, j: usize, v: f32) -> bool {
        match self.keyframes.lanes.get_mut(lane).map(|l| &mut l.source) {
            Some(Source::Lfo(p)) if j < LFO_PARAMS => {
                p[j] = unit(v);
                true
            }
            _ => false,
        }
    }
}

#[cfg(test)]
mod curve_tests {
    use super::*;

    #[test]
    fn bend_hits_its_midpoint_and_keeps_the_ends() {
        for c in [0.1, 0.3, 0.5, 0.9] {
            assert!((bend(0.5, c) - c).abs() < 1e-4);
            assert!(bend(0.0, c).abs() < 1e-6 && (bend(1.0, c) - 1.0).abs() < 1e-6);
        }
        let s = Source::Points(alloc::vec![
            Key {
                t: 0,
                v: 0.0,
                c: 0.2
            },
            Key {
                t: 100,
                v: 1.0,
                c: 0.5
            }
        ]);
        assert!((s.at(50.0).unwrap() - 0.2).abs() < 1e-4);
    }
}
