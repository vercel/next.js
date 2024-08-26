use std::collections::HashMap;

use anyhow::Result;
use turbo_tasks::{RcStr, ValueToString, Vc};
use turbo_tasks_hash::hash_xxh3_hash64;

use super::ModuleId;
use crate::ident::AssetIdent;

#[turbo_tasks::value_trait]
pub trait ModuleIdStrategy {
    fn get_module_id(self: Vc<Self>, ident: Vc<AssetIdent>) -> Vc<ModuleId>;
}

#[turbo_tasks::value]
pub struct NamedModuleIdStrategy;

impl NamedModuleIdStrategy {
    pub fn new() -> Vc<Self> {
        NamedModuleIdStrategy {}.cell()
    }
}

#[turbo_tasks::value_impl]
impl ModuleIdStrategy for NamedModuleIdStrategy {
    #[turbo_tasks::function]
    async fn get_module_id(self: Vc<Self>, ident: Vc<AssetIdent>) -> Result<Vc<ModuleId>> {
        Ok(ModuleId::String(ident.to_string().await?.clone_value()).cell())
    }
}

#[turbo_tasks::value]
pub struct DeterministicModuleIdStrategy {
    module_id_map: HashMap<RcStr, Vc<ModuleId>>,
}

impl DeterministicModuleIdStrategy {
    pub async fn new(module_id_map: HashMap<RcStr, Vc<ModuleId>>) -> Result<Vc<Self>> {
        Ok(DeterministicModuleIdStrategy { module_id_map }.cell())
    }
}

#[turbo_tasks::value_impl]
impl ModuleIdStrategy for DeterministicModuleIdStrategy {
    #[turbo_tasks::function]
    async fn get_module_id(self: Vc<Self>, ident: Vc<AssetIdent>) -> Result<Vc<ModuleId>> {
        let ident_string = ident.to_string().await?.clone_value();
        if let Some(module_id) = self.await?.module_id_map.get(&ident_string) {
            // dbg!(format!("Hit {}", ident.to_string().await?));
            return Ok(*module_id);
        }
        // dbg!(format!("Miss {}", ident.to_string().await?));
        Ok(ModuleId::String(
            hash_xxh3_hash64(ident.to_string().await?)
                .to_string()
                .into(),
        )
        .cell())
    }
}
