use anyhow::Result;
use bincode::{Decode, Encode};
use bitfield::bitfield;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, TaskInput, Vc, trace::TraceRawVcs};

use crate::chunk::available_modules::{AvailableModules, AvailableModulesSet};

bitfield! {
    #[derive(Clone, Copy, Default, TaskInput, TraceRawVcs, NonLocalValue, Serialize, Deserialize, PartialEq, Eq, Hash, Encode, Decode)]
    pub struct AvailabilityFlags(u8);
    impl Debug;
    pub is_in_async_module, set_is_in_async_module: 0;
}

#[derive(
    Eq,
    PartialEq,
    Hash,
    Clone,
    Copy,
    Debug,
    TaskInput,
    TraceRawVcs,
    NonLocalValue,
    Serialize,
    Deserialize,
    Encode,
    Decode,
)]
pub struct AvailabilityInfo {
    flags: AvailabilityFlags,
    /// There are modules already available.
    available_modules: Option<ResolvedVc<AvailableModules>>,
}

impl AvailabilityInfo {
    pub fn root() -> Self {
        Self {
            flags: AvailabilityFlags::default(),
            available_modules: None,
        }
    }

    pub fn available_modules(&self) -> Option<ResolvedVc<AvailableModules>> {
        self.available_modules
    }

    pub async fn with_modules(self, modules: Vc<AvailableModulesSet>) -> Result<Self> {
        Ok(if let Some(available_modules) = self.available_modules {
            Self {
                flags: self.flags,
                available_modules: Some(
                    available_modules
                        .with_modules(modules)
                        .to_resolved()
                        .await?,
                ),
            }
        } else {
            Self {
                flags: self.flags,
                available_modules: Some(AvailableModules::new(modules).to_resolved().await?),
            }
        })
    }

    pub fn in_async_module(self) -> Self {
        let mut flags = self.flags;
        flags.set_is_in_async_module(true);
        Self {
            flags,
            available_modules: self.available_modules,
        }
    }

    pub fn is_in_async_module(&self) -> bool {
        self.flags.is_in_async_module()
    }

    pub async fn ident(&self) -> Result<Option<RcStr>> {
        Ok(if let Some(available_modules) = self.available_modules {
            Some(available_modules.hash().await?.to_string().into())
        } else {
            None
        })
    }
}
