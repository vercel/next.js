//! Error helpers shared across the filesystem implementation.

use std::{error::Error as StdError, fmt};

use turbo_tasks::{NonLocalValue, trace::TraceRawVcs};

/// Wrapper to convert [`anyhow::Error`] to `impl std::error::Error` for use in [`Effect::apply`].
// TODO(bgw): use a structured error type instead of anyhow for write/write_link
#[derive(TraceRawVcs, NonLocalValue)]
pub(crate) struct AnyhowWrapper(anyhow::Error);

impl fmt::Display for AnyhowWrapper {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, f)
    }
}

impl fmt::Debug for AnyhowWrapper {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, f)
    }
}

impl StdError for AnyhowWrapper {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        self.0.source()
    }
}

impl From<anyhow::Error> for AnyhowWrapper {
    fn from(err: anyhow::Error) -> Self {
        AnyhowWrapper(err)
    }
}
