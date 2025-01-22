use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, ValueToString, Vc};
use turbo_tasks_hash::hash_xxh3_hash64;

use super::ModuleId;
use crate::{
    ident::AssetIdent,
    issue::{module::ModuleIssue, IssueExt, StyledString},
};

#[turbo_tasks::value_trait]
pub trait ModuleIdStrategy {
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
        Ok(ModuleId::String(ident.to_string().await?.clone_value()).cell())
    }
}

#[turbo_tasks::value]
pub struct GlobalModuleIdStrategy {
    module_id_map: FxIndexMap<RcStr, ModuleId>,
}

impl GlobalModuleIdStrategy {
    pub async fn new(module_id_map: FxIndexMap<RcStr, ModuleId>) -> Result<Vc<Self>> {
        Ok(GlobalModuleIdStrategy { module_id_map }.cell())
    }
}

#[turbo_tasks::value_impl]
impl ModuleIdStrategy for GlobalModuleIdStrategy {
    #[turbo_tasks::function]
    async fn get_module_id(&self, ident: Vc<AssetIdent>) -> Result<Vc<ModuleId>> {
        let ident_string = ident.to_string().await?;
        if let Some(module_id) = self.module_id_map.get(&*ident_string) {
            return Ok(module_id.clone().cell());
        }

        if !ident_string.ends_with("[app-client] (ecmascript, next/dynamic entry)") {
            // TODO: This shouldn't happen, but is a temporary workaround to ignore next/dynamic
            // imports of a server component from another server component.

            ModuleIssue {
                ident: ident.to_resolved().await?,
                title: StyledString::Text(
                    format!("ModuleId not found for ident: {:?}", ident_string).into(),
                )
                .resolved_cell(),
                description: StyledString::Text(
                    format!("ModuleId not found for ident: {:?}", ident_string).into(),
                )
                .resolved_cell(),
            }
            .resolved_cell()
            .emit();
        }

        Ok(ModuleId::String(
            hash_xxh3_hash64(ident.to_string().await?)
                .to_string()
                .into(),
        )
        .cell())
    }
}
