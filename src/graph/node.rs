use crate::FixedStr;
use crate::draw::{Draw, DrawBuf};
use crate::graph::output_pos;

use super::consts::*;
use super::{
    BUFFER_LEN, Buffer, GraphState, Param, SocketKind, ZERO_BUFFER, input_pos, is_valid_target,
};

pub type NodeState = [f32; MAX_NODE_STATE];

mod add;
mod basic_shapes;
mod filter;
mod gain;
mod output;
mod phase_shift;

pub mod node_colors {
    use crate::draw::Color;

    pub const DEFAULT: Color = [70, 90, 200];

    pub const INPUT: Color = [255, 60, 100];
    pub const OUTPUT: Color = [220, 120, 50];
    pub const EFFECT: Color = [75, 180, 100];
}

#[derive(Clone, Copy, PartialEq)]
#[repr(u8)]
pub enum NodeKind {
    BasicShapes,
    Gain,
    Filter,
    PhaseShift,
    Add,
    Output,
}

impl NodeKind {
    #[inline]
    fn as_node(&self) -> &dyn NodeLogic {
        match self {
            NodeKind::BasicShapes => &basic_shapes::BasicShapesNode,
            NodeKind::Gain => &gain::GainNode,
            NodeKind::Filter => &filter::FilterNode,
            NodeKind::PhaseShift => &phase_shift::PhaseShiftNode,
            NodeKind::Add => &add::AddNode,
            NodeKind::Output => &output::OutputNode,
        }
    }
}

pub trait NodeLogic {
    fn title(&self) -> &'static str;
    fn header_color(&self) -> [u8; 3] {
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
        inputs: &[&Buffer],
        _params: &[Option<Param>; MAX_PARAMS],
        _state: &mut NodeState,
        out: &mut Buffer,
    ) {
        match inputs.first() {
            Some(&buf) => *out = *buf,
            None => *out = ZERO_BUFFER,
        }
    }

    /// Optional bespoke control drawn in the node's widget strip (e.g. a
    /// filter's frequency/gain pad) instead of relying purely on the plain
    /// param rows. Returns whether it drew anything; the default draws
    /// nothing and leaves the strip blank.
    fn draw_widget(
        &self,
        _node: &Node,
        _i: usize,
        _s: &GraphState,
        _buf: &mut DrawBuf,
        _rect: (f32, f32, f32, f32),
    ) -> bool {
        false
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

    fn process(
        &self,
        inputs: &[&Buffer],
        params: &[Option<Param>; MAX_PARAMS],
        state: &mut NodeState,
        out: &mut Buffer,
    ) {
        self.as_node().process(inputs, params, state, out);
    }

    fn draw_widget(
        &self,
        node: &Node,
        i: usize,
        s: &GraphState,
        buf: &mut DrawBuf,
        rect: (f32, f32, f32, f32),
    ) -> bool {
        self.as_node().draw_widget(node, i, s, buf, rect)
    }
}

#[derive(Clone, Copy)]
pub struct Node {
    pub x: f32,
    pub y: f32,
    pub kind: NodeKind,
    pub params: [Option<Param>; MAX_PARAMS],
    pub state: NodeState,
}

impl Node {
    pub const HEADER_H: f32 = 20.0;
    pub const PARAM_H: f32 = 18.0;
    const VALUE_X: f32 = 62.0;
    const VALUE_PAD: f32 = 6.0;
    const VALUE_BOX_H: f32 = 14.0;

    pub const WAVE_H: f32 = 34.0;
    pub const WIDGET_H: f32 = 40.0;
    const WAVE_POINTS: usize = 400;

    pub const W: f32 = 150.0;

    /// Computes total dynamic height based on active elements
    pub fn height(&self) -> f32 {
        let param_count = self.params.iter().flatten().count();
        let mut total_h =
            Self::HEADER_H + (param_count as f32 * Self::PARAM_H) + Self::WAVE_H + 10.0;

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
            params: kind.default_params(),
            state: [0.0; MAX_NODE_STATE],
        }
    }

    /// Calculate rect using active sequential index, not the array index slot
    pub fn param_value_rect(&self, active_idx: usize) -> (f32, f32, f32, f32) {
        let baseline_y = self.y + Self::HEADER_H + 12.0 + (active_idx as f32 * Self::PARAM_H);
        let box_x = self.x + Self::VALUE_X;
        let box_w = Self::W - Self::VALUE_X - 8.0;
        (box_x, baseline_y - 11.0, box_w, Self::VALUE_BOX_H)
    }

    /// Top-left y of the waveform preview strip, based on actual active parameters
    fn wave_y(&self) -> f32 {
        let param_count = self.params.iter().flatten().count();
        self.y + Self::HEADER_H + (param_count as f32 * Self::PARAM_H) + 6.0
    }

    fn draw_waveform(&self, i: usize, s: &GraphState, buf: &mut DrawBuf) {
        let x = self.x + 4.0;
        let y = self.wave_y();
        let w = Self::W - 8.0;
        let h = Self::WAVE_H - 6.0;

        buf.fill_style([20, 20, 24]);
        buf.fill_rect(x, y, w, h);

        buf.stroke_style([120, 200, 255]);
        buf.line_width(1.5);

        let samples = &s.buffers[i];
        let half_h = h / 2.0 - 2.0;
        let mut prev: Option<(f32, f32)> = None;
        for p in 0..Self::WAVE_POINTS {
            let sample_idx = p * BUFFER_LEN / Self::WAVE_POINTS;
            let v = samples[sample_idx].clamp(-1.0, 1.0);
            let px = x + w * p as f32 / (Self::WAVE_POINTS - 1) as f32;
            let py = y + h / 2.0 - v * half_h;
            if let Some((ppx, ppy)) = prev {
                buf.stroke_line(ppx, ppy, px, py);
            }
            prev = Some((px, py));
        }
    }
}

pub const EMPTY_NODE: Node = Node {
    x: 0.0,
    y: 0.0,
    kind: NodeKind::Output,
    params: [None; MAX_PARAMS],
    state: [0.0; MAX_NODE_STATE],
};

impl Draw for Node {
    fn draw(&self, i: usize, s: &GraphState, buf: &mut DrawBuf) {
        let current_h = self.height();

        // Dynamic background container
        buf.fill_style([40, 42, 48]);
        buf.fill_rect(self.x, self.y, Self::W, current_h);

        // Header
        buf.fill_style(self.kind.header_color());
        buf.fill_rect(self.x, self.y, Self::W, Self::HEADER_H);

        buf.fill_style([230, 230, 230]);
        buf.fill_text(self.kind.title(), self.x + 6.0, self.y + 14.0);

        // Parameters
        let mut current_y = self.y + Self::HEADER_H + 12.0;

        for (active_idx, param) in self.params.iter().flatten().enumerate() {
            buf.fill_style([180, 180, 180]);
            buf.fill_text(param.name(), self.x + 8.0, current_y);

            let mut vbuf: FixedStr<16> = FixedStr::new();
            param.format_value(&mut vbuf);

            let (box_x, box_y, box_w, box_h) = self.param_value_rect(active_idx);
            buf.fill_style([25, 26, 32]);
            buf.fill_rect(box_x, box_y, box_w, box_h);

            buf.fill_style([140, 200, 140]);
            buf.fill_text(vbuf.as_str(), box_x + Self::VALUE_PAD, current_y);

            current_y += Self::PARAM_H;
        }

        // Waveform preview
        self.draw_waveform(i, s, buf);

        // Widget
        if self.kind.has_widget() {
            let widget_rect = (
                self.x,
                self.wave_y() + Self::WAVE_H,
                Self::W,
                Self::WIDGET_H,
            );
            self.kind.draw_widget(self, i, s, buf, widget_rect);
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
                        buf.fill_style([255, 215, 0]);
                        buf.fill_circle(ix, iy, SOCKET_R + 4.0);
                    } else {
                        buf.fill_style([100, 220, 100]);
                        buf.fill_circle(ix, iy, SOCKET_R + 2.0);
                    }
                } else {
                    buf.fill_style([50, 50, 50]);
                    buf.fill_circle(ix, iy, SOCKET_R);
                }
            } else {
                buf.fill_style([
                    if is_hovered { 150 } else { 60 },
                    if is_hovered { 255 } else { 180 },
                    if is_hovered { 150 } else { 250 },
                ]);
                buf.fill_circle(ix, iy, if is_hovered { SOCKET_R + 2.0 } else { SOCKET_R });
            }
        }

        // Output Sockets
        for out in 0..self.kind.output_count() {
            let (ox, oy) = output_pos(self, out);
            let output_active = match s.pending_link_from {
                Some((from, from_socket)) => i == from && out == from_socket,
                None => s.hovered_socket == Some((i, SocketKind::Output, out)),
            };
            buf.fill_style([
                250,
                if output_active { 220 } else { 180 },
                if output_active { 150 } else { 60 },
            ]);
            buf.fill_circle(
                ox,
                oy,
                if output_active {
                    SOCKET_R + 2.0
                } else {
                    SOCKET_R
                },
            );
        }
    }
}
