#![allow(dead_code)] // ponytail: ported API, not all wired to callers yet
use crate::graph::{MAX_PARAMS, Param, State};

pub const N: usize = 2048;
pub type Buffer = [f32; N];
pub const BUFFER_LEN: usize = N;
pub const BUFFER_LEN_F32: f32 = N as f32;
pub const BUFFER_LEN_F64: f64 = N as f64;
pub const ZERO_BUFFER: Buffer = [0.0; N];

mod helpers;

macro_rules! define_nodes {
    ($($variant:ident),+ $(,)?) => {
        paste::paste! {
            $(mod [<$variant:snake>];)+

            #[repr(u8)]
            #[derive(Clone, Copy, PartialEq)]
            pub enum NodeKind {
                $($variant),+
            }

            // Order == discriminant, so from_u8 is a plain index.
            const NODES: &[NodeKind] = &[$(NodeKind::$variant),+];
            const _: () = {
                let mut i = 0;
                while i < NODES.len() {
                    assert!(NODES[i] as usize == i);
                    i += 1;
                }
            };

            // Static param-name lookup, built at compile time from each node's PARAMS.
            static PARAM_NAMES: [[&str; MAX_PARAMS]; NODES.len()] =
                [$(param_names(&[<$variant:snake>]::[<$variant Node>]::PARAMS)),+];

            impl NodeKind {
                pub fn param_name(self, i: usize) -> &'static str {
                    PARAM_NAMES[self as usize].get(i).copied().unwrap_or("")
                }

                #[inline]
                pub fn as_node(&self) -> &'static dyn NodeLogic {
                    match self {
                        $(NodeKind::$variant => &[<$variant:snake>]::[<$variant Node>]),+
                    }
                }

                pub fn iter() -> impl Iterator<Item = &'static Self> {
                    NODES.iter()
                }

                pub const fn count() -> usize {
                    NODES.len()
                }

                pub fn from_u8(n: u8) -> Option<Self> {
                    NODES.get(n as usize).copied()
                }
            }
        }
    };
}

// Order == NodeKind id used by the TS side: keep the first three fixed, append new ones.
define_nodes!(
    BasicShapes,
    Output,
    Transform,
    Add,
    Am,
    BitCrush,
    BandSplit,
    Comb,
    Disperser,
    Filter,
    Fm,
    Gain,
    HarmonicShift,
    IirFilter,
    InharmonicShift,
    Invert,
    Noise,
    Partials,
    PhaseShift,
    PhaseCopy,
    PulseWave,
    RingMod,
    Saturation,
    SpectralGate,
    SpectralSubtract,
    SyncWarp,
    Window,
);

pub enum NodeCategory {
    Fft,
    Inputs,
    Outputs,
    Distortion,
    Combine,
    Effect,
    Warp,
    Unknown,
}

impl NodeCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Fft => "FFT",
            Self::Inputs => "Inputs",
            Self::Outputs => "Outputs",
            Self::Distortion => "Distortion",
            Self::Combine => "Combine",
            Self::Effect => "Effect",
            Self::Warp => "Warp",
            Self::Unknown => "Other",
        }
    }
}

pub trait NodeLogic {
    fn title(&self) -> &'static str;
    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Unknown]
    }
    fn input_count(&self) -> usize;
    fn output_count(&self) -> usize;
    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        [None; MAX_PARAMS]
    }
    /// `inputs` has `input_count()` buffers (zeroed if unlinked), `outs` has `output_count()`.
    fn process(
        &self,
        _inputs: &[&Buffer],
        _params: &[Option<Param>; MAX_PARAMS],
        _outs: &mut [Buffer],
    ) {
    }
}

const fn param_names(p: &[Option<Param>; MAX_PARAMS]) -> [&'static str; MAX_PARAMS] {
    let mut out = [""; MAX_PARAMS];
    let mut i = 0;
    while i < MAX_PARAMS {
        if let Some(q) = &p[i] {
            out[i] = q.name();
        }
        i += 1;
    }
    out
}

impl NodeKind {
    pub fn from_title(title: &str) -> Option<Self> {
        Self::iter().find(|n| n.as_node().title() == title).copied()
    }

    pub fn sockets(self) -> (u8, u8) {
        let n = self.as_node();
        (n.input_count() as u8, n.output_count() as u8)
    }
}

bitflags::bitflags! {
    #[derive(Debug, Clone, Copy)]
    pub struct NodeFlags: u8 {
        const NORMALIZE = 1 << 0;
        const REMOVE_DC = 1 << 1;
        const HARD_CLIP = 1 << 2;
    }
}

pub const FLAG_LABELS: [&str; 3] = ["Norm", "rem DC", "Clip"];

pub const FLAG_BITS: [NodeFlags; 3] = [
    NodeFlags::NORMALIZE,
    NodeFlags::REMOVE_DC,
    NodeFlags::HARD_CLIP,
];

#[repr(C)]
pub struct Node {
    pub position: [f32; 2],
    pub size: [f32; 2],
    pub kind: NodeKind,
    pub flags: u8,
    pub params: NodeParams,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct NodeParams {
    start: u32,
    len: u8,
}

impl State {
    pub fn add_node(
        &mut self,
        kind: NodeKind,
        position: [f32; 2],
        size: [f32; 2],
        n_params: u8,
    ) -> Option<u32> {
        let start = self.arena.alloc::<f32>(n_params as usize)?;
        let off = self.arena.alloc::<Node>(1)?;
        let defaults = kind.as_node().default_params();
        for (v, d) in self
            .arena
            .slice_mut::<f32>(start, n_params as usize)
            .iter_mut()
            .zip(defaults)
        {
            *v = d.map_or(0.0, |p| p.default_norm() as f32);
        }
        self.arena.slice_mut::<Node>(off, 1)[0] = Node {
            position,
            size,
            kind,
            flags: NodeFlags::empty().bits(),
            params: NodeParams {
                start,
                len: n_params,
            },
        };
        self.nodes.push(off);
        Some(off)
    }

    pub fn kind(&self, idx: usize) -> Option<NodeKind> {
        Some(self.arena.slice::<Node>(*self.nodes.get(idx)?, 1)[0].kind)
    }

    pub fn params(&self, idx: usize) -> &[f32] {
        let Some(&off) = self.nodes.get(idx) else {
            return &[];
        };
        let p = self.arena.slice::<Node>(off, 1)[0].params;
        self.arena.slice(p.start, p.len as usize)
    }

    pub fn flags(&self, idx: usize) -> NodeFlags {
        self.nodes.get(idx).map_or(NodeFlags::empty(), |&off| {
            NodeFlags::from_bits_truncate(self.arena.slice::<Node>(off, 1)[0].flags)
        })
    }

    pub fn sockets(&self, idx: usize) -> Option<(u8, u8)> {
        let off = *self.nodes.get(idx)?;
        Some(self.arena.slice::<Node>(off, 1)[0].kind.sockets())
    }

    pub fn param_addr(&self, idx: usize, i: usize) -> Option<usize> {
        let p = self.arena.slice::<Node>(*self.nodes.get(idx)?, 1)[0].params;
        (i < p.len as usize).then(|| self.arena.base() + p.start as usize + i * 4)
    }
}
