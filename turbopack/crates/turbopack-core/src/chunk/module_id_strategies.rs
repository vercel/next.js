use anyhow::{Result, bail};
use rustc_hash::FxHashMap;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_hash::hash_xxh3_hash64;

use super::ModuleId;
use crate::ident::AssetIdent;

#[turbo_tasks::value_trait]
pub trait ModuleIdStrategy {
    #[turbo_tasks::function]
    fn get_module_id(self: Vc<Self>, ident: Vc<AssetIdent>) -> Vc<ModuleId>;
}

#[turbo_tasks::value]
pub struct DevModuleIdStrategy;

impl DevModuleIdStrategy {
    pub fn new() -> Vc<Self> {
        DevModuleIdStrategy {}.cell()
    }

    pub fn new_resolved() -> ResolvedVc<Self> {
        DevModuleIdStrategy {}.resolved_cell()
    }
}

#[turbo_tasks::value_impl]
impl ModuleIdStrategy for DevModuleIdStrategy {
    #[turbo_tasks::function]
    async fn get_module_id(self: Vc<Self>, ident: Vc<AssetIdent>) -> Result<Vc<ModuleId>> {
        Ok(ModuleId::String(ident.to_string().owned().await?).cell())
    }
}

#[turbo_tasks::value(shared)]
pub struct GlobalModuleIdStrategy {
    pub module_id_map: FxHashMap<ResolvedVc<AssetIdent>, u64>,
}

#[turbo_tasks::value_impl]
impl ModuleIdStrategy for GlobalModuleIdStrategy {
    #[turbo_tasks::function]
    async fn get_module_id(&self, ident: ResolvedVc<AssetIdent>) -> Result<Vc<ModuleId>> {
        if let Some(module_id) = self.module_id_map.get(&ident) {
            const JS_MAX_SAFE_INTEGER: u64 = (1u64 << 53) - 1;
            if *module_id > JS_MAX_SAFE_INTEGER {
                bail!("Numeric module id is too large: {}", module_id);
            }
            return Ok(ModuleId::Number(*module_id).cell());
        }

        let ident_string = ident.to_string().await?;
        if ident_string.ends_with("[app-client] (ecmascript, next/dynamic entry)") {
            // TODO: This shouldn't happen, but is a temporary workaround to ignore next/dynamic
            // imports of a server component from another server component.
            return Ok(ModuleId::String(
                hash_xxh3_hash64(ident.to_string().await?)
                    .to_string()
                    .into(),
            )
            .cell());
        }

        bail!("ModuleId not found for ident: {ident_string:?}");
    }
}
