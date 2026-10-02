#[repr(C)]
pub struct Link {
    pub source: u16,
    pub source_socket: u8,
    pub target: u16,
    pub target_socket: u8,
}

impl Link {
    pub fn new(source: u16, source_socket: u8, target: u16, target_socket: u8) -> Self {
        Self {
            source,
            source_socket,
            target,
            target_socket,
        }
    }
}
