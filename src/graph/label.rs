#[cfg(test)]
mod imp {
    pub type Label = &'static str;
    pub type Labels = &'static [&'static str];
    pub const fn label(s: Label) -> Label {
        s
    }
    pub const fn labels(s: Labels) -> Labels {
        s
    }
}

#[cfg(not(test))]
mod imp {
    pub type Label = ();
    pub type Labels = ();
    pub const fn label(_: &str) {}
    pub const fn labels(_: &[&str]) {}
}

pub use imp::*;
