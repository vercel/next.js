use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, FxIndexMap, NonLocalValue, ReadRef, ResolvedVc,
    TryJoinIterExt, ValueToString, Vc,
};
use turbo_tasks_hash::Xxh3Hash64Hasher;

use super::ChunkableModule;
use crate::module::Module;

#[derive(
    Debug,
    PartialEq,
    Eq,
    TraceRawVcs,
    Copy,
    Clone,
    Serialize,
    Deserialize,
    ValueDebugFormat,
    NonLocalValue,
)]
pub struct AvailableModulesInfo {
    pub is_async: bool,
}

#[turbo_tasks::value(transparent)]
pub struct OptionAvailableModulesInfo(Option<AvailableModulesInfo>);

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct AvailableModuleInfoMap(
    FxIndexMap<ResolvedVc<Box<dyn ChunkableModule>>, AvailableModulesInfo>,
);

/// Allows to gather information about which assets are already available.
/// Adding more roots will form a linked list like structure to allow caching
/// `include` queries.
#[turbo_tasks::value]
pub struct AvailableModules {
    parent: Option<ResolvedVc<AvailableModules>>,
    modules: ResolvedVc<AvailableModuleInfoMap>,
}

#[turbo_tasks::value_impl]
impl AvailableModules {
    #[turbo_tasks::function]
    pub fn new(modules: ResolvedVc<AvailableModuleInfoMap>) -> Vc<Self> {
        AvailableModules {
            parent: None,
            modules,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn with_modules(
        self: ResolvedVc<Self>,
        modules: ResolvedVc<AvailableModuleInfoMap>,
    ) -> Result<Vc<Self>> {
        let self_snapshot = self.snapshot().await?;

        let modules = modules
            .await?
            .into_iter()
            .flat_map(|(&module, &info)| {
                self_snapshot
                    .get(module)
                    .is_none()
                    .then_some((module, info))
            })
            .collect();

        Ok(AvailableModules {
            parent: Some(self),
            modules: ResolvedVc::cell(modules),
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn hash(&self) -> Result<Vc<u64>> {
        let mut hasher = Xxh3Hash64Hasher::new();
        if let Some(parent) = self.parent {
            hasher.write_value(parent.hash().await?);
        } else {
            hasher.write_value(0u64);
        }
        let item_idents = self
            .modules
            .await?
            .iter()
            .map(|(&module, _)| module.ident().to_string())
            .try_join()
            .await?;
        for ident in item_idents {
            hasher.write_value(ident);
        }
        Ok(Vc::cell(hasher.finish()))
    }

    #[turbo_tasks::function]
    pub async fn get(
        &self,
        module: ResolvedVc<Box<dyn ChunkableModule>>,
    ) -> Result<Vc<OptionAvailableModulesInfo>> {
        if let Some(&info) = self.modules.await?.get(&module) {
            return Ok(Vc::cell(Some(info)));
        };
        if let Some(parent) = self.parent {
            return Ok(parent.get(*module));
        }
        Ok(Vc::cell(None))
    }

    #[turbo_tasks::function]
    pub async fn snapshot(&self) -> Result<Vc<AvailableModulesSnapshot>> {
        let modules = self.modules.await?;
        let parent = if let Some(parent) = self.parent {
            Some(parent.snapshot().await?)
        } else {
            None
        };

        Ok(AvailableModulesSnapshot { parent, modules }.cell())
    }
}

#[turbo_tasks::value(serialization = "none")]
#[derive(Debug, Clone)]
pub struct AvailableModulesSnapshot {
    parent: Option<ReadRef<AvailableModulesSnapshot>>,
    modules: ReadRef<AvailableModuleInfoMap>,
}

impl AvailableModulesSnapshot {
    pub fn get(
        &self,
        module: ResolvedVc<Box<dyn ChunkableModule>>,
    ) -> Option<AvailableModulesInfo> {
        if let Some(&info) = self.modules.get(&module) {
            return Some(info);
        };
        if let Some(parent) = &self.parent {
            return parent.get(module);
        }
        None
    }
}
