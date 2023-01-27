use std::{
    any::Provider,
    fmt::{Debug, Display},
    sync::Arc,
    time::Duration,
};

use anyhow::Error;

pub use super::{id_factory::IdFactory, no_move_vec::NoMoveVec, once_map::*};

/// A error struct that is backed by an Arc to allow cloning errors
#[derive(Debug, Clone)]
pub struct SharedError {
    inner: Arc<Error>,
}

impl SharedError {
    pub fn new(err: Error) -> Self {
        match err.downcast::<SharedError>() {
            Ok(shared) => shared,
            Err(plain) => Self {
                inner: Arc::new(plain),
            },
        }
    }
}

impl std::error::Error for SharedError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.inner.source()
    }

    fn provide<'a>(&'a self, req: &mut std::any::Demand<'a>) {
        Provider::provide(&*self.inner, req);
    }
}

impl Display for SharedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&*self.inner, f)
    }
}

impl From<Error> for SharedError {
    fn from(e: Error) -> Self {
        Self::new(e)
    }
}

pub struct FormatDuration(pub Duration);

impl Display for FormatDuration {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = self.0.as_secs();
        if s > 10 {
            return write!(f, "{}s", s);
        }
        let ms = self.0.as_millis();
        if ms > 10 {
            return write!(f, "{}ms", ms);
        }
        write!(f, "{}ms", (self.0.as_micros() as f32) / 1000.0)
    }
}

impl Debug for FormatDuration {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = self.0.as_secs();
        if s > 100 {
            return write!(f, "{}s", s);
        }
        let ms = self.0.as_millis();
        if ms > 10000 {
            return write!(f, "{:.2}s", (ms as f32) / 1000.0);
        }
        if ms > 100 {
            return write!(f, "{}ms", ms);
        }
        write!(f, "{}ms", (self.0.as_micros() as f32) / 1000.0)
    }
}

pub struct FormatBytes(pub usize);

impl Display for FormatBytes {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let b = self.0;
        const KB: usize = 1_024;
        const MB: usize = 1_024 * KB;
        const GB: usize = 1_024 * MB;
        if b > GB {
            return write!(f, "{:.2}GiB", ((b / MB) as f32) / 1_024.0);
        }
        if b > MB {
            return write!(f, "{:.2}MiB", ((b / KB) as f32) / 1_024.0);
        }
        if b > KB {
            return write!(f, "{:.2}KiB", (b as f32) / 1_024.0);
        }
        write!(f, "{}B", b)
    }
}
