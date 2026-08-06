use std::fmt::{self, Display};

use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, trace::TraceRawVcs};

pub(crate) enum FontResult<T> {
    Ok(T),
    FontFileNotFound(FontFileNotFound),
}

#[derive(Debug, Eq, PartialEq, NonLocalValue, TraceRawVcs, Encode, Decode)]
pub(crate) struct FontFileNotFound(pub RcStr);

impl Display for FontFileNotFound {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Font file not found: Can't resolve {}'", self.0)
    }
}
