declare global {
  type bool = boolean;
  type i8 = number & { __brand: "i8" };
  type u8 = number & { __brand: "u8" };
  type mut_u8 = number & { __brand: "mut_u8" };
  type const_u8 = number & { __brand: "const_u8" };
  type usize = number & { __brand: "usize" };
  type isize = number & { __brand: "isize" };
  type i32 = number & { __brand: "i32" };
  type u16 = number & { __brand: "u16" };
  type u32 = number & { __brand: "u32" };
  type u64 = bigint & { __brand: "u64" };
  type f32 = number & { __brand: "f32" };
  type f64 = number & { __brand: "f64" };
}

export {};
