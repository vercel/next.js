use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
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

    pub async fn get_id_from_ident(&self, ident: Vc<AssetIdent>) -> Result<ModuleId> {
        let ident = ident.to_resolved().await?;
        if let Some(module_id_map) = self.module_id_map
            && let Some(module_id) = module_id_map.get(&ident).await?.as_deref().cloned()
        {
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

                bail!("ModuleId not found for ident: {}", ident.to_string().await?);
            }
            ModuleIdFallback::Ident => Ok(ModuleId::String(ident.to_string().owned().await?)),
        }
    }
}
