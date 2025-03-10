use thiserror::Error;
use turbo_rcstr::RcStr;

#[derive(Debug, Error)]
pub enum FontError {
    #[error("could not find font file")]
    FontFileNotFound(RcStr),
}
