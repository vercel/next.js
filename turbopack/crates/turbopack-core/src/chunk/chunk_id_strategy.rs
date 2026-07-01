use anyhow::Result;
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
    turbobail,
};
use turbo_tasks_hash::hash_xxh3_hash64;

use super::ModuleId;
use crate::{chunk::ChunkItem, ident::AssetIdent, module::Module};

#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct ModuleIds(FxHashMap<ResolvedVc<AssetIdent>, ModuleId>);

#[derive(
    Default, Clone, PartialEq, Eq, ValueDebugFormat, TraceRawVcs, NonLocalValue, Encode, Decode,
)]
pub enum ModuleIdFallback {
    Error,
    #[default]
    Ident,
}

#[turbo_tasks::value(shared)]
#[derive(Default)]
pub struct ModuleIdStrategy {
    pub module_id_map: Option<ResolvedVc<ModuleIds>>,
    pub fallback: ModuleIdFallback,
}

impl ModuleIdStrategy {
    pub async fn get_id(&self, chunk_item: Vc<Box<dyn ChunkItem>>) -> Result<ModuleId> {
        let ident = chunk_item.asset_ident();
        self.get_id_from_ident(ident).await
    }

    pub async fn get_id_from_module(&self, module: Vc<Box<dyn Module>>) -> Result<ModuleId> {
        let ident = module.ident();
        self.get_id_from_ident(ident).await
    }

    /// Looks `ident` up in the explicit module id map. Returns `None` when there is no map, or the
    /// map has no entry for `ident`. Applies no fallback: callers decide what a miss means.
    async fn lookup_in_map(&self, ident: ResolvedVc<AssetIdent>) -> Result<Option<ModuleId>> {
        let Some(module_id_map) = self.module_id_map else {
            return Ok(None);
        };
        Ok(module_id_map.get(&ident).await?.as_deref().cloned())
    }

    /// like get_id_from_ident but doesn't use the fallback strategy.
    /// This was created because our side-effect analysis can be conserverative
    /// at points, and then later tree shake away something once we discover it doesn't
    /// actually have side effects. This lets us skip these rather than error
    /// like the fallback strategy might be.
    pub async fn try_get_id_from_module(
        &self,
        module: Vc<Box<dyn Module>>,
    ) -> Result<Option<ModuleId>> {
        let ident = module.ident().to_resolved().await?;
        if self.module_id_map.is_some() {
            // With an explicit map, presence is authoritative: a missing entry means the module was
            // not included by the traversal, so it has no id.
            return self.lookup_in_map(ident).await;
        }

        // Without a map the strategy synthesizes an id from the ident, so an id always exists.
        Ok(Some(self.get_id_from_ident(*ident).await?))
    }

    pub async fn get_id_from_ident(&self, ident: Vc<AssetIdent>) -> Result<ModuleId> {
        let ident = ident.to_resolved().await?;
        if let Some(module_id) = self.lookup_in_map(ident).await? {
            return Ok(module_id);
        }

        match self.fallback {
            ModuleIdFallback::Error => {
                let ident_string = ident.to_string().await?;
                if ident_string.ends_with("[app-client] (ecmascript, next/dynamic entry)") {
                    // TODO: This shouldn't happen, but is a temporary workaround to ignore
                    // next/dynamic imports of a server component from another
                    // server component.
                    return Ok(ModuleId::String(
                        hash_xxh3_hash64(ident.to_string().await?)
                            .to_string()
                            .into(),
                    ));
                }

                turbobail!("ModuleId not found for ident: {}", ident);
            }
            ModuleIdFallback::Ident => Ok(ModuleId::String(ident.to_string().owned().await?)),
        }
    }
}
