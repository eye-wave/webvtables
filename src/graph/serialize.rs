use alloc::vec::Vec;

use crate::{
    console_print,
    graph::{Node, NodeKind},
};

use super::{GraphState, Link, NodeLogic};

pub trait SerializeGraph {
    fn serialize(&self) -> Vec<u8>;
    fn patch_from_bytes(&mut self, bytes: &[u8]) -> i8;
}

const FILE_SIGNATURE: &[u8] = b"WbtL";

impl SerializeGraph for GraphState {
    fn serialize(&self) -> Vec<u8> {
        let nodes_size = self.node_count * 57;
        let links_size = self.links.iter().flatten().count() * 16;

        let estimated_size = nodes_size + links_size;
        let mut buf = Vec::with_capacity(estimated_size);

        let mut node_names: Vec<&str> = Vec::with_capacity(10);
        for node in self.nodes.iter().take(self.node_count) {
            let title = node.kind.title();
            if !node_names.contains(&title) {
                node_names.push(title)
            }
        }

        buf.extend_from_slice(FILE_SIGNATURE);

        {
            let dict_size = node_names.len() + node_names.iter().map(|n| n.len()).sum::<usize>();

            buf.extend_from_slice(&(dict_size as u16).to_le_bytes());
            buf.push(node_names.len() as u8);

            for name in node_names.iter() {
                buf.push(name.len() as u8);
            }
            for name in node_names.iter() {
                buf.extend_from_slice(name.as_bytes());
            }
        }

        let nodes_size_pos = buf.len();
        buf.extend_from_slice(&0u32.to_le_bytes());

        for node in self.nodes.iter().take(self.node_count) {
            let Some((name_idx, _)) = node_names
                .iter()
                .enumerate()
                .find(|(_, name)| node.kind.title() == **name)
            else {
                continue;
            };

            // Node {
            // f32 x, y
            //   u8 node_type (name string index from dict)
            //   u4 param_len, u4 state_len
            //   [f64] params (dense, Some values only)
            // }
            buf.extend_from_slice(&node.x.to_le_bytes());
            buf.extend_from_slice(&node.y.to_le_bytes());
            buf.push(name_idx as u8);

            let param_len = node.params.iter().flatten().count();

            let mut state_len = node.state.len();
            while state_len > 0 && node.state[state_len - 1] == 0.0 {
                state_len -= 1;
            }

            buf.push(param_len as u8);

            for p in node.params.iter().flatten() {
                buf.extend_from_slice(&(p.value()).to_le_bytes());
            }
        }

        let nodes_byte_len = (buf.len() - nodes_size_pos - 4) as u32;
        buf[nodes_size_pos..nodes_size_pos + 4].copy_from_slice(&nodes_byte_len.to_le_bytes());

        buf.extend_from_slice(&(links_size as u32).to_le_bytes());
        for link in self.links.iter().flatten() {
            buf.extend_from_slice(&(link.from as u16).to_le_bytes());
            buf.extend_from_slice(&(link.from_socket as u16).to_le_bytes());
            buf.extend_from_slice(&(link.to as u16).to_le_bytes());
            buf.extend_from_slice(&(link.to_socket as u16).to_le_bytes());
        }

        buf
    }

    fn patch_from_bytes(&mut self, bytes: &[u8]) -> i8 {
        let rd_u32 = |p: usize| u32::from_le_bytes(bytes[p..p + 4].try_into().unwrap());
        let rd_u16 = |p: usize| u16::from_le_bytes(bytes[p..p + 2].try_into().unwrap());

        let mut pos = 0;

        if bytes[0..4] != *FILE_SIGNATURE {
            console_print!("Invalid signature");
            return -1;
        }

        pos += 4;

        pos += 2;
        let name_count = bytes[pos] as usize;
        pos += 1;

        let mut lens = Vec::with_capacity(name_count);
        for _ in 0..name_count {
            lens.push(bytes[pos] as usize);
            pos += 1;
        }
        let mut node_names: Vec<&str> = Vec::with_capacity(name_count);
        for len in lens {
            node_names.push(core::str::from_utf8(&bytes[pos..pos + len]).unwrap_or(""));
            pos += len;
        }

        let nodes_size = rd_u32(pos) as usize;
        pos += 4;
        let nodes_end = pos + nodes_size;

        let mut count = 0;
        while pos < nodes_end {
            let x = f32::from_le_bytes(bytes[pos..pos + 4].try_into().unwrap());
            pos += 4;
            let y = f32::from_le_bytes(bytes[pos..pos + 4].try_into().unwrap());
            pos += 4;
            let name_idx = bytes[pos] as usize;
            pos += 1;
            let param_len = bytes[pos] as usize;
            pos += 1;

            let Some(kind) = node_names
                .get(name_idx)
                .and_then(|t| NodeKind::from_title(t))
            else {
                console_print!("node kind not found");
                return -1;
            };

            let node = &mut self.nodes[count];
            *node = Node::new(kind, x, y);

            node.x = x;
            node.y = y;

            if let Some(title) = node_names.get(name_idx)
                && let Some(kind) = NodeKind::from_title(title)
            {
                node.kind = kind;
            }

            for slot in node.params.iter_mut().take(param_len) {
                let Some(slot) = slot else {
                    console_print!("slot missing");
                    return -1;
                };
                slot.set_value_norm(f64::from_le_bytes(bytes[pos..pos + 8].try_into().unwrap()));
                pos += 8;
            }

            count += 1;
        }
        self.node_count = count;

        let links_size = rd_u32(pos) as usize;
        pos += 4;
        let links_end = pos + links_size;

        for slot in self.links.iter_mut() {
            *slot = None;
        }

        let mut link_idx = 0;
        while pos < links_end {
            let from = rd_u16(pos) as usize;
            let from_socket = rd_u16(pos + 2) as usize;
            let to = rd_u16(pos + 4) as usize;
            let to_socket = rd_u16(pos + 6) as usize;
            pos += 8;

            self.links[link_idx] = Some(Link {
                from,
                from_socket,
                to,
                to_socket,
            });
            link_idx += 1;
        }

        0
    }
}
