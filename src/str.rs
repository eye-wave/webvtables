use crate::ffi;

#[derive(Clone)]
pub struct FixedStr<const N: usize> {
    buf: [u8; N],
    len: usize,
}

impl<const N: usize> Default for FixedStr<N> {
    fn default() -> Self {
        Self::new()
    }
}

impl<const N: usize> FixedStr<N> {
    pub const fn new() -> Self {
        Self {
            buf: [0; N],
            len: 0,
        }
    }

    pub const fn from_str(input: &str) -> Self {
        let mut buf = [0; N];
        let bytes = input.as_bytes();

        let len = if bytes.len() < N { bytes.len() } else { N };

        let mut i = 0;
        while i < len {
            buf[i] = bytes[i];
            i += 1;
        }

        Self { buf, len }
    }

    pub fn as_str(&self) -> &str {
        core::str::from_utf8(&self.buf[..self.len]).unwrap_or("")
    }

    fn push_byte(&mut self, b: u8) {
        if self.len < N {
            self.buf[self.len] = b;
            self.len += 1;
        }
    }

    pub fn push_str(&mut self, s: &str) {
        let bytes = s.as_bytes();
        let end = (self.len + bytes.len()).min(N);
        self.buf[self.len..end].copy_from_slice(&bytes[..end - self.len]);
        self.len = end;
    }

    pub fn push_str_with_len(&mut self, s: &str, max_len: usize) {
        let bytes = s.as_bytes();

        if bytes.len() > max_len {
            let mut truncate_len = max_len.saturating_sub(1);

            while truncate_len > 0 && !s.is_char_boundary(truncate_len) {
                truncate_len -= 1;
            }

            let end1 = (self.len + truncate_len).min(N);
            self.buf[self.len..end1].copy_from_slice(&bytes[..end1 - self.len]);
            self.len = end1;

            let ellipsis = "…".as_bytes();
            let end2 = (self.len + ellipsis.len()).min(N);
            self.buf[self.len..end2].copy_from_slice(&ellipsis[..end2 - self.len]);
            self.len = end2;
        } else {
            let end = (self.len + bytes.len()).min(N);
            self.buf[self.len..end].copy_from_slice(&bytes[..end - self.len]);
            self.len = end;
        }
    }

    pub fn clear(&mut self) {
        self.len = 0;
    }

    pub fn push_raw(&mut self, bytes: &[u8]) {
        let len = bytes.len().min(N);
        self.buf[..len].copy_from_slice(&bytes[..len]);
        self.len = len;
    }

    pub fn push_int(&mut self, mut v: i32) {
        if v < 0 {
            self.push_byte(b'-');
            v = -v;
        }
        let mut digits = [0u8; 20];
        let mut n = 0;
        if v == 0 {
            digits[0] = b'0';
            n = 1;
        }
        while v > 0 {
            digits[n] = b'0' + (v % 10) as u8;
            v /= 10;
            n += 1;
        }
        for i in (0..n).rev() {
            self.push_byte(digits[i]);
        }
    }

    pub fn push_fixed2(&mut self, v: f64) {
        let scaled = ffi::round(v * 100.0) as i32;
        let (neg, scaled) = if scaled < 0 {
            (true, -scaled)
        } else {
            (false, scaled)
        };
        if neg {
            self.push_byte(b'-');
        }
        self.push_int(scaled / 100);
        self.push_byte(b'.');
        let frac = (scaled % 100) as u8;
        self.push_byte(b'0' + frac / 10);
        self.push_byte(b'0' + frac % 10);
    }
}
