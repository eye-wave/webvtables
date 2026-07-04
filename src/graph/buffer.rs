use super::{GraphState, MAX_NODE_INPUTS, MAX_NODES, NodeLogic};

pub const BUFFER_LEN: usize = 2048;
pub type Buffer = [f32; BUFFER_LEN];
pub const ZERO_BUFFER: Buffer = [0.0; BUFFER_LEN];

pub fn process_graph(s: &mut GraphState) {
    let mut done = [false; MAX_NODES];
    for i in 0..s.node_count {
        eval_node(s, i, &mut done);
    }
}

fn eval_node(s: &mut GraphState, idx: usize, done: &mut [bool; MAX_NODES]) {
    if done[idx] {
        return;
    }
    done[idx] = true;

    let mut sources: [Option<usize>; MAX_NODE_INPUTS] = [None; MAX_NODE_INPUTS];
    for slot in s.links.iter() {
        if let Some(l) = slot
            && l.to == idx
            && l.to_socket < MAX_NODE_INPUTS
        {
            sources[l.to_socket] = Some(l.from);
        }
    }

    for src in sources.iter().flatten() {
        eval_node(s, *src, done);
    }

    let input_count = s.nodes[idx].kind.input_count().min(MAX_NODE_INPUTS);
    let mut inputs: [Buffer; MAX_NODE_INPUTS] = [ZERO_BUFFER; MAX_NODE_INPUTS];
    for (slot_idx, src) in sources.iter().enumerate().take(input_count) {
        if let Some(src) = src {
            inputs[slot_idx] = s.buffers[*src];
        }
    }
    let input_refs = [&inputs[0], &inputs[1], &inputs[2], &inputs[3]];

    let mut out = ZERO_BUFFER;
    let node = &mut s.nodes[idx];
    node.kind.process(
        &input_refs[..input_count],
        &node.params,
        &mut node.state,
        &mut out,
    );
    s.buffers[idx] = out;
}
