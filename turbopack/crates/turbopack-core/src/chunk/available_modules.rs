use anyhow::Result;
use turbo_tasks::{FxIndexSet, ReadRef, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_hash::Xxh3Hash64Hasher;

use crate::module_graph::module_batch::{ChunkableModuleOrBatch, IdentStrings};

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct AvailableModulesSet(FxIndexSet<ChunkableModuleOrBatch>);

/// Allows to gather information about which assets are already available.
/// Adding more roots will form a linked list like structure to allow caching
/// `include` queries.
#[turbo_tasks::value]
pub struct AvailableModules {
    parent: Option<ResolvedVc<AvailableModules>>,
    modules: ResolvedVc<AvailableModulesSet>,
}

#[turbo_tasks::value_impl]
impl AvailableModules {
    #[turbo_tasks::function]
    pub fn new(modules: ResolvedVc<AvailableModulesSet>) -> Vc<Self> {
        AvailableModules {
            parent: None,
            modules,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn with_modules(
        self: ResolvedVc<Self>,
        modules: ResolvedVc<AvailableModulesSet>,
    ) -> Result<Vc<Self>> {
        Ok(AvailableModules {
            parent: Some(self),
            modules,
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
            .map(|&module| module.ident_strings())
            .try_join()
            .await?;
        for idents in item_idents {
            match idents {
                IdentStrings::Single(ident) => hasher.write_value(ident),
                IdentStrings::Multiple(idents) => {
                    for ident in idents {
                        hasher.write_value(ident);
                    }
                }
                IdentStrings::None => {}
            }
        }
        Ok(Vc::cell(hasher.finish()))
    }

    #[turbo_tasks::function]
    pub async fn get(&self, module_or_batch: ChunkableModuleOrBatch) -> Result<Vc<bool>> {
        if self.modules.await?.contains(&module_or_batch) {
            return Ok(Vc::cell(true));
        };
        if let Some(parent) = self.parent {
            return Ok(parent.get(module_or_batch));
        }
        Ok(Vc::cell(false))
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
    modules: ReadRef<AvailableModulesSet>,
}

impl AvailableModulesSnapshot {
    pub fn get(&self, module_or_batch: ChunkableModuleOrBatch) -> bool {
        self.modules.contains(&module_or_batch)
            || self
                .parent
                .as_ref()
                .is_some_and(|parent| parent.get(module_or_batch))
    }
}
