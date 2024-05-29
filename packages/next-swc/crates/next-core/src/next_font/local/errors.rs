use thiserror::Error;

#[derive(Debug, Error)]
pub enum FontError {
    #[error("could not find font file")]
    FontFileNotFound(String),
}
