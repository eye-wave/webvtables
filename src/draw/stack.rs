/// Tiny stack cursor
pub struct Rec<const N: usize> {
    pub bytes: [u8; N],
    at: usize,
}

impl<const N: usize> Clone for Rec<N> {
    fn clone(&self) -> Self {
        *self
    }
}
impl<const N: usize> Copy for Rec<N> {}

impl<const N: usize> Rec<N> {
    pub fn new(op: u8) -> Self {
        let mut r = Self {
            bytes: [0u8; N],
            at: 0,
        };
        r.u8(op);
        r
    }

    pub fn u8(&mut self, v: u8) -> &mut Self {
        self.bytes[self.at] = v;
        self.at += 1;
        self
    }

    pub fn u16(&mut self, v: u16) -> &mut Self {
        self.bytes[self.at..self.at + 2].copy_from_slice(&v.to_le_bytes());
        self.at += 2;
        self
    }

    pub fn u32(&mut self, v: u32) -> &mut Self {
        self.bytes[self.at..self.at + 4].copy_from_slice(&v.to_le_bytes());
        self.at += 4;
        self
    }

    pub fn f32(&mut self, v: f32) -> &mut Self {
        self.bytes[self.at..self.at + 4].copy_from_slice(&v.to_le_bytes());
        self.at += 4;
        self
    }
}
