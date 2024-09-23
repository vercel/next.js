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
pub struct DevModuleIdStrategy;

impl DevModuleIdStrategy {
    pub fn new() -> Vc<Self> {
        DevModuleIdStrategy {}.cell()
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
    module_id_map: HashMap<RcStr, Vc<ModuleId>>,
}

impl GlobalModuleIdStrategy {
    pub async fn new(module_id_map: HashMap<RcStr, Vc<ModuleId>>) -> Result<Vc<Self>> {
        Ok(GlobalModuleIdStrategy { module_id_map }.cell())
    }
}

#[turbo_tasks::value_impl]
impl ModuleIdStrategy for GlobalModuleIdStrategy {
    #[turbo_tasks::function]
    async fn get_module_id(&self, ident: Vc<AssetIdent>) -> Result<Vc<ModuleId>> {
        let ident_string = ident.to_string().await?.clone_value();
        if let Some(module_id) = self.module_id_map.get(&ident_string) {
            // dbg!(format!("Hit {}", ident.to_string().await?));
            // We need to create a new cell here since we want to avoid Vc changes to affect
            // get_module_id
            return Ok(module_id.await?.clone_value().cell());
        }
        // dbg!(format!("Miss {}", ident.to_string().await?));
        Ok(ModuleId::String(hash_xxh3_hash64(ident_string).to_string().into()).cell())
    }
}
