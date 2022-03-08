use std::{
    fmt::{Debug, Display},
    sync::Arc,
};

use anyhow::Error;

#[derive(Debug, Clone)]
pub struct SharedError {
    inner: Arc<Error>,
}

impl SharedError {
    pub fn new(err: Error) -> Self {
        Self {
            inner: Arc::new(err),
        }
    }
}

impl std::error::Error for SharedError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.inner.source()
    }

    fn backtrace(&self) -> Option<&std::backtrace::Backtrace> {
        Some(self.inner.backtrace())
    }
}

impl Display for SharedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&*self.inner, f)
    }
}
