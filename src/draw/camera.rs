use crate::ffi;

pub struct Camera {
    pub x: f32,
    pub y: f32,
    pub zoom: f32,
}

impl Camera {
    pub const MIN_ZOOM: f32 = 0.1;
    pub const MAX_ZOOM: f32 = 4.0;

    pub const fn new() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            zoom: 1.0,
        }
    }

    pub fn zoom_at(&mut self, sx: f32, sy: f32, dy: f32) {
        let (wx, wy) = self.to_world(sx, sy);
        let new_zoom = (self.zoom * ffi::expf(-dy * 0.01)).clamp(Self::MIN_ZOOM, Self::MAX_ZOOM);

        self.x = sx / new_zoom - wx;
        self.y = sy / new_zoom - wy;
        self.zoom = new_zoom;
    }

    pub fn to_world(&self, sx: f32, sy: f32) -> (f32, f32) {
        ((sx / self.zoom - self.x), (sy / self.zoom - self.y))
    }

    pub fn to_screen(&self, wx: f32, wy: f32) -> (f32, f32) {
        ((wx + self.x) * self.zoom, (wy + self.y) * self.zoom)
    }

    pub fn pan(&mut self, dx: f32, dy: f32) {
        self.x -= dx / self.zoom;
        self.y -= dy / self.zoom;
    }

    pub fn pan_by_drag(&mut self, dx: f32, dy: f32) {
        self.x += dx / self.zoom;
        self.y += dy / self.zoom;
    }
}
