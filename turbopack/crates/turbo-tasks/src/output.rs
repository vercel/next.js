use std::{
    borrow::Cow,
    fmt::{self, Display},
};

use anyhow::anyhow;

use crate::{util::SharedError, RawVc};

/// A helper type representing the output of a resolved task.
#[derive(Clone, Debug)]
pub enum OutputContent {
    Link(RawVc),
    Error(SharedError),
    Panic(Option<Box<Cow<'static, str>>>),
}

impl OutputContent {
    pub fn as_read_result(&self) -> anyhow::Result<RawVc> {
        match &self {
            Self::Error(err) => Err(anyhow::Error::new(err.clone())),
            Self::Link(raw_vc) => Ok(*raw_vc),
            Self::Panic(Some(message)) => Err(anyhow!("A task panicked: {message}")),
            Self::Panic(None) => Err(anyhow!("A task panicked")),
        }
    }
}

impl Display for OutputContent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Link(raw_vc) => write!(f, "link {:?}", raw_vc),
            Self::Error(err) => write!(f, "error {}", err),
            Self::Panic(Some(message)) => write!(f, "panic {}", message),
            Self::Panic(None) => write!(f, "panic"),
        }
    }
}
