use std::fmt::Display;

use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, trace::TraceRawVcs};

pub(crate) enum FontResult<T> {
    Ok(T),
    FontFileNotFound(FontFileNotFound),
}

#[derive(Debug, Eq, PartialEq, Serialize, Deserialize, NonLocalValue, TraceRawVcs)]
pub(crate) struct FontFileNotFound(pub RcStr);

impl Display for FontFileNotFound {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Font file not found: Can't resolve {}'", self.0)
    }
}
