use std::{
    fmt::{self, Display},
    sync::Arc,
};

use anyhow::anyhow;

use crate::{RawVc, TurboTasksPanic, util::SharedError};

/// A helper type representing the output of a resolved task.
#[derive(Clone, Debug)]
pub enum OutputContent {
    Link(RawVc),
    Error(SharedError),
    Panic(Arc<TurboTasksPanic>),
}

impl OutputContent {
    pub fn as_read_result(&self) -> anyhow::Result<RawVc> {
        match &self {
            Self::Error(err) => Err(anyhow!(err.clone())),
            Self::Link(raw_vc) => Ok(*raw_vc),
            Self::Panic(err) => Err(anyhow!(err.clone())),
        }
    }
}

impl Display for OutputContent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Link(raw_vc) => write!(f, "link {raw_vc:?}"),
            Self::Error(err) => write!(f, "error {err}"),
            Self::Panic(err) => write!(f, "panic {err}"),
        }
    }
}
