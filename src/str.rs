use crate::ffi;

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
    pub fn new() -> Self {
        Self {
            buf: [0; N],
            len: 0,
        }
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

    pub fn push_int(&mut self, mut v: i64) {
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
        let scaled = ffi::round(v * 100.0) as i64;
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
