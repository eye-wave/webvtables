use alloc::{string::String, vec::Vec};

use crate::{
    console_print,
    graph::{Node, NodeKind, NodeLogic},
};

use super::{GraphState, Link};

pub trait SerializeGraph {
    fn serialize(&self) -> Vec<u8>;
    fn patch_from_bytes(&mut self, bytes: &[u8]) -> i8;
}

const FILE_SIGNATURE: &[u8] = b"WbtL";

fn xor(data: &mut [u8]) {
    for (i, b) in data.iter_mut().enumerate() {
        *b ^= FILE_SIGNATURE[i % FILE_SIGNATURE.len()];
    }
}

impl SerializeGraph for GraphState {
    fn serialize(&self) -> Vec<u8> {
        let nodes_size = self.nodes.len() * 57;
        let links_size = self.links.len() * 8;

        let estimated_size = nodes_size + links_size;
        let mut buf = Vec::with_capacity(estimated_size);

        let mut node_names = heapless::Vec::<&str, { NodeKind::count() }>::new();
        for node in self.nodes.iter() {
            let title = node.kind.title();
            if !node_names.contains(&title) {
                let _ = node_names.push(title);
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
                let start = buf.len();
                buf.extend_from_slice(name.as_bytes());
                xor(&mut buf[start..]);
            }
        }

        let nodes_size_pos = buf.len();
        buf.extend_from_slice(&0u32.to_le_bytes());

        for node in self.nodes.iter() {
            let Some((name_idx, _)) = node_names
                .iter()
                .enumerate()
                .find(|(_, name)| node.kind.title() == **name)
            else {
                continue;
            };

            // Node {
            //   f32 x, y
            //   u8 node_type (name string index from dict)
            //   u8 param_len
            //   [f64;param_len] params
            // }
            buf.extend_from_slice(&node.x.to_le_bytes());
            buf.extend_from_slice(&node.y.to_le_bytes());
            buf.push(name_idx as u8);

            let param_len = node.params.iter().flatten().count();

            buf.push(param_len as u8);

            for p in node.params.iter().flatten() {
                buf.extend_from_slice(&(p.value()).to_le_bytes());
            }
        }

        let nodes_byte_len = (buf.len() - nodes_size_pos - 4) as u32;
        buf[nodes_size_pos..nodes_size_pos + 4].copy_from_slice(&nodes_byte_len.to_le_bytes());

        let links_size_pos = buf.len();
        buf.extend_from_slice(&0u32.to_le_bytes());
        for link in self.links.iter() {
            buf.extend_from_slice(&(link.from as u16).to_le_bytes());
            buf.extend_from_slice(&(link.from_socket as u16).to_le_bytes());
            buf.extend_from_slice(&(link.to as u16).to_le_bytes());
            buf.extend_from_slice(&(link.to_socket as u16).to_le_bytes());
        }
        let links_byte_len = (buf.len() - links_size_pos - 4) as u32;
        buf[links_size_pos..links_size_pos + 4].copy_from_slice(&links_byte_len.to_le_bytes());

        buf
    }

    fn patch_from_bytes(&mut self, bytes: &[u8]) -> i8 {
        let mut pos = 0;

        macro_rules! read_bytes {
            ($pos:expr, $len:expr) => {{
                let end = $pos + $len;
                if end > bytes.len() {
                    console_print!("Unexpected EOF");
                    return -1;
                }
                let slice = &bytes[$pos..end];
                $pos = end;
                slice
            }};
        }

        if bytes.len() < 4 || bytes[0..4] != *FILE_SIGNATURE {
            console_print!("Invalid signature");
            return -1;
        }
        pos += 4;

        if pos + 2 > bytes.len() {
            return -1;
        }
        pos += 2;

        if pos >= bytes.len() {
            return -1;
        }
        let name_count = bytes[pos] as usize;
        pos += 1;

        let mut lens = Vec::with_capacity(name_count);
        for _ in 0..name_count {
            if pos >= bytes.len() {
                return -1;
            }
            lens.push(bytes[pos] as usize);
            pos += 1;
        }

        let mut node_names: Vec<String> = Vec::with_capacity(name_count);
        for len in lens {
            if pos + len > bytes.len() {
                return -1;
            }
            let mut name_bytes = bytes[pos..pos + len].to_vec();
            xor(&mut name_bytes);
            node_names.push(String::from_utf8(name_bytes).unwrap_or_default());
            pos += len;
        }

        if pos + 4 > bytes.len() {
            return -1;
        }
        let nodes_size = u32::from_le_bytes(bytes[pos..pos + 4].try_into().unwrap()) as usize;
        pos += 4;

        let nodes_end = pos + nodes_size;
        if nodes_end > bytes.len() {
            console_print!("Malformed nodes block size");
            return -1;
        }

        self.nodes.clear();
        while pos < nodes_end {
            if pos + 10 > nodes_end {
                break;
            }

            let x = f32::from_le_bytes(read_bytes!(pos, 4).try_into().unwrap());
            let y = f32::from_le_bytes(read_bytes!(pos, 4).try_into().unwrap());

            let name_idx = bytes[pos] as usize;
            pos += 1;
            let lens_byte = bytes[pos];
            pos += 1;
            let param_len = lens_byte as usize;

            let Some(kind) = node_names
                .get(name_idx)
                .and_then(|t| NodeKind::from_title(t))
            else {
                console_print!("node kind not found");
                return -1;
            };

            let mut node = Node::new(kind, x, y);

            for slot in node.params.iter_mut().take(param_len) {
                let Some(slot) = slot else {
                    console_print!("slot missing");
                    return -1;
                };
                if pos + 8 > nodes_end {
                    console_print!("Params extended past nodes block boundary");
                    return -1;
                }
                slot.set_value_norm(f64::from_le_bytes(read_bytes!(pos, 8).try_into().unwrap()));
            }

            if self.nodes.push(node).is_err() {
                console_print!("Internal nodes buffer overflow");
                return -1;
            }
        }

        pos = nodes_end;

        if pos + 4 > bytes.len() {
            return -1;
        }
        let links_size = u32::from_le_bytes(bytes[pos..pos + 4].try_into().unwrap()) as usize;
        pos += 4;

        let links_end = pos + links_size;
        if links_end > bytes.len() {
            console_print!("Malformed links block size");
            return -1;
        }

        self.links.clear();
        while pos < links_end {
            if pos + 8 > links_end {
                return -1;
            }

            let from = u16::from_le_bytes(read_bytes!(pos, 2).try_into().unwrap()) as usize;
            let from_socket = u16::from_le_bytes(read_bytes!(pos, 2).try_into().unwrap()) as usize;
            let to = u16::from_le_bytes(read_bytes!(pos, 2).try_into().unwrap()) as usize;
            let to_socket = u16::from_le_bytes(read_bytes!(pos, 2).try_into().unwrap()) as usize;

            if self
                .links
                .push(Link {
                    from,
                    from_socket,
                    to,
                    to_socket,
                })
                .is_err()
            {
                console_print!("Internal links buffer overflow");
                return -1;
            }
        }

        self.version += 1;
        0
    }
}
