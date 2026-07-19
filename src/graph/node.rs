use crate::FixedStr;
use crate::draw::{Color, Draw, DrawBuf, camera};
use crate::geom::Interactive;
use crate::graph::keyframes::gen_diamond;
use crate::graph::{ZERO_BUFFER, output_pos};

use super::consts::*;
use super::{Buffer, GraphState, Param, SocketKind, input_pos, is_valid_target};

mod helpers;

macro_rules! define_nodes {
    ($($variant:ident),+ $(,)?) => {
        paste::paste! {
            $(mod [<$variant:snake>];)+

            #[derive(Clone, Copy, PartialEq)]
            #[repr(u8)]
            pub enum NodeKind {
                $($variant),+
            }

            impl NodeKind {
                #[inline]
                pub fn as_node(&self) -> &dyn NodeLogic {
                    match self {
                        $(NodeKind::$variant => &[<$variant:snake>]::[<$variant Node>]),+
                    }
                }

                pub fn iter() -> impl Iterator<Item = &'static Self> {
                    const NODES: &[NodeKind] = &[$(NodeKind::$variant),+];
                    NODES.iter()
                }

                pub const fn count() -> usize {
                    [$(stringify!($variant)),+].len()
                }
            }
        }
    };
}

define_nodes!(
    Add,
    Am,
    BasicShapes,
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
    Output,
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

pub mod node_colors {
    use crate::draw::Color;

    pub const DEFAULT: Color = [70, 90, 200];

    pub const INPUT: Color = [255, 60, 100];
    pub const OUTPUT: Color = [220, 120, 50];
    pub const EFFECT: Color = [75, 180, 100];
}

pub const MAX_CATEGORIES: usize = 4;

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

impl NodeKind {
    pub fn from_title(title: &str) -> Option<Self> {
        for node in Self::iter() {
            if node.as_node().title() != title {
                continue;
            }

            return Some(*node);
        }

        None
    }
}

pub trait NodeLogic {
    fn title(&self) -> &'static str;
    fn category(&self) -> &'static [NodeCategory] {
        &[NodeCategory::Unknown]
    }

    fn header_color(&self) -> Color {
        for cat in self.category() {
            match cat {
                NodeCategory::Effect => return node_colors::EFFECT,
                NodeCategory::Inputs => return node_colors::INPUT,
                NodeCategory::Outputs => return node_colors::OUTPUT,
                _ => continue,
            }
        }

        node_colors::DEFAULT
    }

    fn input_count(&self) -> usize;
    fn output_count(&self) -> usize;
    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        [None; MAX_PARAMS]
    }

    fn has_widget(&self) -> bool {
        false
    }

    fn process(
        &self,
        _inputs: &[&Buffer],
        _params: &[Option<Param>; MAX_PARAMS],
        _outs: &mut [Buffer],
    ) {
    }

    fn draw_widget(
        &self,
        _node: &Node,
        _i: usize,
        _s: &GraphState,
        _ctx: &mut DrawBuf,
        _rect: (f32, f32, f32, f32),
    ) {
    }
}

impl NodeLogic for NodeKind {
    fn title(&self) -> &'static str {
        self.as_node().title()
    }

    fn header_color(&self) -> [u8; 3] {
        self.as_node().header_color()
    }

    fn input_count(&self) -> usize {
        self.as_node().input_count()
    }

    fn output_count(&self) -> usize {
        self.as_node().output_count()
    }

    fn default_params(&self) -> [Option<Param>; MAX_PARAMS] {
        self.as_node().default_params()
    }

    fn has_widget(&self) -> bool {
        self.as_node().has_widget()
    }

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        outs: &mut [Buffer],
    ) {
        self.as_node().process(inputs, params, outs);
    }

    fn draw_widget(
        &self,
        node: &Node,
        i: usize,
        s: &GraphState,
        ctx: &mut DrawBuf,
        rect: (f32, f32, f32, f32),
    ) {
        self.as_node().draw_widget(node, i, s, ctx, rect)
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

/// 3-letter labels for the flag toggle row, in bit order (matches
/// `Node::flag_rect` / `flag_hit` indexing 0..3).
pub const FLAG_LABELS: [&str; 3] = ["Norm", "rem DC", "Clip"];

pub const FLAG_BITS: [NodeFlags; 3] = [
    NodeFlags::NORMALIZE,
    NodeFlags::REMOVE_DC,
    NodeFlags::HARD_CLIP,
];

#[derive(Clone, Copy)]
pub struct Node {
    pub x: f32,
    pub y: f32,
    pub kind: NodeKind,
    pub flags: NodeFlags,
    pub params: [Option<Param>; MAX_PARAMS],
}

impl Node {
    pub const HEADER_H: f32 = 20.0;
    pub const PARAM_H: f32 = 18.0;

    const VALUE_X: f32 = 80.0;
    const VALUE_PAD: f32 = 6.0;
    const VALUE_BOX_H: f32 = 14.0;

    const WIDGET_MARGIN: f32 = 4.0;
    pub const WAVE_H: f32 = 34.0;
    pub const WIDGET_H: f32 = 40.0;
    pub const FLAGS_H: f32 = 22.0;

    const FLAGS_PAD: f32 = 4.0;

    pub const KF_W: f32 = 8.0;
    pub const KF_H: f32 = 12.0;

    pub const W: f32 = 180.0;

    fn param_count(&self) -> usize {
        self.params.iter().flatten().count()
    }

    /// Computes total dynamic height based on active elements
    pub fn height(&self) -> f32 {
        let mut total_h = Self::HEADER_H
            + (self.param_count() as f32 * Self::PARAM_H)
            + Self::FLAGS_H
            + Self::WAVE_H
            + 10.0;

        if self.kind.has_widget() {
            total_h += Self::WIDGET_H;
        }

        total_h
    }

    pub fn new(kind: NodeKind, x: f32, y: f32) -> Self {
        Node {
            x,
            y,
            kind,
            flags: NodeFlags::empty(),
            params: kind.default_params(),
        }
    }

    /// Text baseline for param row `active_idx`. Single source of truth —
    /// draw() and param_value_rect() both read from here instead of each
    /// tracking the row offset separately.
    const fn param_baseline_y(&self, active_idx: usize) -> f32 {
        self.y + Self::HEADER_H + 12.0 + (active_idx as f32 * Self::PARAM_H)
    }

    /// Calculate rect using active sequential index, not the array index slot
    pub const fn param_value_rect(&self, active_idx: usize) -> (f32, f32, f32, f32) {
        let box_x = self.x + Self::VALUE_X;
        let box_w = Self::W - Self::VALUE_X - 8.0;
        (
            box_x,
            self.param_baseline_y(active_idx) - 11.0,
            box_w,
            Self::VALUE_BOX_H,
        )
    }

    /// Calculate rect using active sequential index, not the array index slot
    pub fn keyframe_value_rect(&self, active_idx: usize) -> (f32, f32, f32, f32) {
        let (bx, by, _, _) = self.param_value_rect(active_idx);
        let cx = bx - 10.0;

        (cx, by, Self::KF_W, Self::KF_H)
    }

    /// Top-left y of the flag toggle row, just below the param rows.
    fn flags_y(&self) -> f32 {
        self.y + Self::HEADER_H + (self.param_count() as f32 * Self::PARAM_H) + 4.0
    }

    /// Rect for flag button `idx` (0..3), evenly spaced across the node width.
    pub fn flag_rect(&self, idx: usize) -> (f32, f32, f32, f32) {
        let n = FLAG_LABELS.len() as f32;
        let total_pad = Self::FLAGS_PAD * (n + 1.0);
        let btn_w = (Self::W - total_pad) / n;
        let btn_h = Self::FLAGS_H - Self::FLAGS_PAD;

        let x = self.x + Self::FLAGS_PAD + (idx as f32 * (btn_w + Self::FLAGS_PAD));
        let y = self.flags_y();

        (x, y, btn_w, btn_h)
    }

    /// Top-left y of the waveform preview strip, based on actual active parameters
    fn wave_y(&self) -> f32 {
        self.flags_y() + Self::FLAGS_H
    }
}

impl Interactive for Node {
    /// Whole-body rect (used for drag pickup / hover checks; header and
    /// param rows have their own tighter hit tests in api/input.rs).
    fn rect(&self) -> (f32, f32, f32, f32) {
        (self.x, self.y, Self::W, self.height())
    }
}

impl Draw for Node {
    fn draw(&self, i: usize, s: &GraphState, ctx: &mut DrawBuf) {
        let current_h = self.height();

        // Dynamic background container
        ctx.fill_style([40, 42, 48]);
        ctx.fill_rect(self.x, self.y, Self::W, current_h, true);

        // Header
        ctx.fill_style(self.kind.header_color());
        ctx.fill_rect(self.x, self.y, Self::W, Self::HEADER_H, true);

        ctx.fill_style([230; 3]);
        ctx.fill_text(self.kind.title(), 13.0, self.x + 6.0, self.y + 14.0, true);

        // Parameters
        for (active_idx, param) in self.params.iter().flatten().enumerate() {
            let baseline_y = self.param_baseline_y(active_idx);

            ctx.fill_style([180; 3]);
            ctx.fill_text(param.name(), 13.0, self.x + 8.0, baseline_y, true);

            let mut vbuf: FixedStr<16> = FixedStr::new();
            param.format_value(&mut vbuf);

            let (box_x, box_y, box_w, box_h) = self.param_value_rect(active_idx);
            ctx.fill_style([25, 26, 32]);
            ctx.fill_rect(box_x, box_y, box_w, box_h, true);

            let (kx, ky, kw, kh) = self.keyframe_value_rect(active_idx);

            let points = gen_diamond(kx, ky, kw, kh);
            let has_keyframe_here = s.keyframes.iter().any(|k| {
                k.lane.node_id == i as u16
                    && k.lane.param_id == active_idx as u8
                    && k.frame == s.current_frame
            });

            if has_keyframe_here {
                ctx.fill_style([230, 200, 50]);
                ctx.fill_points(&points, true);
            } else {
                ctx.line_width(1.0 * camera().zoom);
                ctx.stroke_style([230, 200, 50]);
                ctx.stroke_points(&points, true);
            }

            ctx.fill_style([140, 200, 140]);
            ctx.fill_text(
                vbuf.as_str(),
                13.0,
                box_x + Self::VALUE_PAD,
                baseline_y,
                true,
            );
        }

        // Flag toggles
        for (idx, &label) in FLAG_LABELS.iter().enumerate() {
            let (bx, by, bw, bh) = self.flag_rect(idx);
            let active = self.flags.contains(FLAG_BITS[idx]);

            if active {
                ctx.fill_style([90, 160, 220]);
            } else {
                ctx.fill_style([25, 26, 32]);
            }
            ctx.fill_rect(bx, by, bw, bh, true);

            let len = label.len() as f32 * 3.33;
            ctx.fill_style(if active { [20, 20, 24] } else { [160; 3] });
            ctx.fill_text(label, 11.0, bx + bw * 0.5 - len, by + bh * 0.5 + 4.0, true);
        }

        // Waveform preview
        {
            let x = self.x + Self::WIDGET_MARGIN;
            let y = self.wave_y();
            let w = Self::W - Self::WIDGET_MARGIN * 2.0;
            let h = Self::WAVE_H - 6.0;

            ctx.fill_style([20, 20, 24]);
            ctx.fill_rect(x, y, w, h, true);

            let samples = match self.kind {
                NodeKind::Output => {
                    let src = s.links.iter().find(|l| l.to == i && l.to_socket == 0);
                    match src {
                        Some(l) => &s.buffers.as_ref().unwrap()[l.from][l.from_socket],
                        None => &ZERO_BUFFER,
                    }
                }
                _ => &s.buffers.as_ref().unwrap()[i][0],
            };

            ctx.fill_wave(x, y, w, h, samples, true);
        }

        // Widget
        if self.kind.has_widget() {
            let x = self.x + Self::WIDGET_MARGIN;
            let y = self.wave_y() + Self::WAVE_H;
            let w = Self::W - Self::WIDGET_MARGIN * 2.0;
            let h = Self::WIDGET_H;

            ctx.fill_style([16, 16, 20]);
            ctx.fill_rect(x, y, w, h, true);

            self.kind.draw_widget(self, i, s, ctx, (x, y, w, h));
        }

        // Input Sockets
        for inp in 0..self.kind.input_count() {
            let (ix, iy) = input_pos(self, inp);
            let is_hovered = s.hovered_socket == Some((i, SocketKind::Input, inp));
            let is_valid_drop_zone = match s.pending_link_from {
                Some((from, _)) => is_valid_target(s, from, i),
                None => false,
            };

            if s.pending_link_from.is_some() {
                if is_valid_drop_zone {
                    if is_hovered {
                        ctx.fill_style([255, 215, 0]);
                        ctx.fill_circle(ix, iy, SOCKET_R + 4.0, true);
                    } else {
                        ctx.fill_style([100, 220, 100]);
                        ctx.fill_circle(ix, iy, SOCKET_R + 2.0, true);
                    }
                } else {
                    ctx.fill_style([50, 50, 50]);
                    ctx.fill_circle(ix, iy, SOCKET_R, true);
                }
            } else {
                ctx.fill_style([
                    if is_hovered { 150 } else { 60 },
                    if is_hovered { 255 } else { 180 },
                    if is_hovered { 150 } else { 250 },
                ]);
                ctx.fill_circle(
                    ix,
                    iy,
                    if is_hovered { SOCKET_R + 2.0 } else { SOCKET_R },
                    true,
                );
            }
        }

        // Output Sockets
        for out in 0..self.kind.output_count() {
            let (ox, oy) = output_pos(self, out);
            let output_active = match s.pending_link_from {
                Some((from, from_socket)) => i == from && out == from_socket,
                None => s.hovered_socket == Some((i, SocketKind::Output, out)),
            };
            ctx.fill_style([
                250,
                if output_active { 220 } else { 180 },
                if output_active { 150 } else { 60 },
            ]);
            ctx.fill_circle(
                ox,
                oy,
                if output_active {
                    SOCKET_R + 2.0
                } else {
                    SOCKET_R
                },
                true,
            );
        }
    }
}
