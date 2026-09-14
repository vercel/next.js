mod api;
mod binding;
mod error;

pub use api::{version_number, version_string};
pub use error::{Error, ErrorKind, Result};

pub(crate) const DEFAULT_BUF_SIZE: usize = 8 * 1024;
pub(crate) const DICTIONARY_SIZE: usize = 64 * 1024;
