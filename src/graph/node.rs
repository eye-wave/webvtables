use crate::graph::{Label, MAX_PARAMS, Param, State, label};
use alloc::{boxed::Box, vec};

pub const N: usize = 2048;
pub type Buffer = [f32; N];
pub const BUFFER_LEN: usize = N;
pub const BUFFER_LEN_F32: f32 = N as f32;
pub const BUFFER_LEN_F64: f64 = N as f64;
pub static ZERO_BUFFER: Buffer = [0.0; N];

pub fn zeroed(n: usize) -> Box<[f32]> {
    vec![0.0; n * N].into_boxed_slice()
}

pub(super) mod helpers;

macro_rules! define_nodes {
    ($($variant:ident = $id:literal),+ $(,)?) => {
        paste::paste! {
            $(mod [<$variant:snake>];)+

            #[repr(u8)]
            #[derive(Clone, Copy, PartialEq)]
            pub enum NodeKind {
                $($variant),+
            }


            // Stable on-disk names (<= 8 bytes). Never change one; reordering variants is then safe.
            const IDS: &[&str] = &[$($id),+];
            const _: () = {
                let mut i = 0;
                while i < IDS.len() {
                    assert!(IDS[i].len() <= 8);
                    i += 1;
                }
            };

            const NODES: &[NodeKind] = &[$(NodeKind::$variant),+];
            const _: () = {
                let mut i = 0;
                while i < NODES.len() {
                    assert!(NODES[i] as usize == i);
                    i += 1;
                }
            };

            impl NodeKind {
                #[inline]
                pub fn as_node(&self) -> &'static dyn NodeLogic {
                    match self {
                        $(NodeKind::$variant => &[<$variant:snake>]::[<$variant Node>]),+
                    }
                }


                #[cfg(test)]
                pub fn ident(self) -> &'static str {
                    match self {
                        $(NodeKind::$variant => stringify!($variant)),+
                    }
                }

                pub fn id(self) -> &'static str {
                    IDS[self as usize]
                }

                pub fn from_id(id: &[u8]) -> Option<Self> {
                    IDS.iter().position(|s| s.as_bytes() == id).and_then(|i| Self::from_u8(i as u8))
                }

                pub fn from_u8(n: u8) -> Option<Self> {
                    NODES.get(n as usize).copied()
                }
            }
        }
    };
}

define_nodes!(
    BasicShapes = "shapes",
    Output = "output",
    Add = "add",
    Am = "am",
    BitCrush = "bitcrush",
    BandSplit = "bandsplt",
    Comb = "comb",
    Disperser = "disperse",
    Filter = "filter",
    Fm = "fm",
    Gain = "gain",
    HarmonicShift = "harmshft",
    IirFilter = "iir",
    InharmonicShift = "inharmsh",
    Invert = "invert",
    Noise = "noise",
    Partials = "partials",
    PhaseShift = "phshift",
    PhaseCopy = "phcopy",
    PulseWave = "pulse",
    RingMod = "ringmod",
    Saturation = "saturate",
    SpectralGate = "specgate",
    SpectralSubtract = "specsub",
    SyncWarp = "syncwarp",
    Window = "window",
    XyMerge = "xymerge",
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

#[cfg(test)]
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

pub trait NodeParamDef {
    const PARAMS: [Option<Param>; MAX_PARAMS];
}

#[cfg_attr(not(test), allow(dead_code))]
pub trait NodeLogic {
    fn title(&self) -> Label;
    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Unknown]
    }
    fn input_count(&self) -> usize;
    fn output_count(&self) -> usize;
    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        [None; MAX_PARAMS]
    }
    fn has_widget(&self) -> bool {
        false
    }

    fn fill_widget(
        &self,
        _inputs: &[&Buffer],
        _params: &[Option<Param>; MAX_PARAMS],
        _out: &mut Buffer,
    ) -> usize {
        0
    }

    fn process(
        &self,
        _inputs: &[&Buffer],
        _params: &[Option<Param>; MAX_PARAMS],
        _outs: &mut [Buffer],
    ) {
    }
}

impl NodeKind {
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

#[cfg(test)]
const FLAG_LABELS: [&str; 3] = ["Norm", "rem DC", "Clip"];

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
    pub fn add_node(&mut self, kind: NodeKind, position: [f32; 2], size: [f32; 2]) -> Option<u32> {
        let defaults = kind.as_node().default_params();
        let n_params = defaults.iter().flatten().count();
        let start = self.arena.alloc::<f32>(n_params)?;
        let off = self.arena.alloc::<Node>(1)?;
        for (v, d) in self
            .arena
            .slice_mut::<f32>(start, n_params)
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
                len: n_params as u8,
            },
        };
        self.nodes.push(off);
        Some(off)
    }

    pub fn param_slot(&self, node_off: u32, i: usize) -> Option<u32> {
        let p = self.arena.slice::<Node>(node_off, 1)[0].params;
        (i < p.len as usize).then(|| p.start + (i * 4) as u32)
    }

    pub fn nodes_valid(&self) -> bool {
        use core::mem::{align_of, offset_of, size_of};
        let top = self.arena.bytes().len();
        self.nodes.len() < u16::MAX as usize
            && self.nodes.iter().all(|&off| {
                let o = off as usize;
                if !o.is_multiple_of(align_of::<Node>()) || o + size_of::<Node>() > top {
                    return false;
                }
                let Some(kind) = NodeKind::from_u8(self.arena.bytes()[o + offset_of!(Node, kind)])
                else {
                    return false;
                };
                let node = &self.arena.slice::<Node>(off, 1)[0];
                let n = kind.as_node().default_params().iter().flatten().count();
                let (start, len) = (node.params.start as usize, node.params.len as usize);
                len == n
                    && start % align_of::<f32>() == 0
                    && start + n * 4 <= top
                    && node
                        .position
                        .iter()
                        .chain(&node.size)
                        .all(|v| v.is_finite())
                    && self
                        .arena
                        .slice::<f32>(node.params.start, n)
                        .iter()
                        .all(|v| v.is_finite())
            })
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

#[cfg(test)]
pub trait Codegen {
    fn ts(&self) -> alloc::string::String;
}

#[cfg(test)]
impl<T: NodeLogic + ?Sized> Codegen for T {
    fn ts(&self) -> alloc::string::String {
        use alloc::{format, string::String, vec::Vec};
        let cats: Vec<String> = self
            .category()
            .iter()
            .map(|c| format!("{:?}", c.as_str()))
            .collect();
        let rows: String = self
            .default_params()
            .iter()
            .flatten()
            .map(|p| format!("  {},\n", p.ts()))
            .collect();
        let params = if rows.is_empty() {
            String::from("[]")
        } else {
            format!("[\n{rows}]")
        };
        format!(
            "export const name = {:?};\nexport const category = [{}] as const;\nexport const inputs = {};\nexport const outputs = {};\nexport const hasWidget = {};\nexport const params = {params} as const;\n",
            self.title(),
            cats.join(", "),
            self.input_count(),
            self.output_count(),
            self.has_widget(),
        )
    }
}

#[cfg(test)]
fn snake(s: &str) -> alloc::string::String {
    let mut o = alloc::string::String::new();
    for (i, c) in s.char_indices() {
        if c.is_ascii_uppercase() && i > 0 {
            o.push('_');
        }
        o.push(c.to_ascii_lowercase());
    }
    o
}

#[cfg(test)]
pub fn codegen_file(idx: usize) -> Option<(alloc::string::String, alloc::string::String)> {
    use alloc::{format, string::String};
    if let Some(k) = NODES.get(idx) {
        return Some((format!("{}.ts", snake(k.ident())), k.as_node().ts()));
    }
    if idx != NODES.len() {
        return None;
    }
    let (mut imports, mut list) = (String::new(), String::new());
    for k in NODES {
        let n = snake(k.ident());
        imports += &format!("import * as {n} from \"./{n}\";\n");
        list += &format!("  {n},\n");
    }
    Some((
        "index.ts".into(),
        format!(
            "{imports}\n// Index == NodeKind id.\nexport const nodes = [\n{list}] as const;\n\nexport const flagLabels = {FLAG_LABELS:?} as const;\n"
        ),
    ))
}

#[cfg(test)]
mod tests {
    #[test]
    fn generate_ts() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/generated/nodes");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for i in 0.. {
            let Some((name, ts)) = super::codegen_file(i) else {
                break;
            };
            let head = "// generated by `npm run codegen` (graph/node.rs), do not edit\n";
            std::fs::write(dir.join(name), format!("{head}{ts}")).unwrap();
        }
    }
}
