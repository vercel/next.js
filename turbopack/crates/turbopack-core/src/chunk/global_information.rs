use std::collections::{HashMap, HashSet};

use anyhow::Result;
use turbo_tasks::{ValueToString, Vc};
use turbo_tasks_hash::hash_xxh3_hash64;

use super::ModuleId;
use crate::{ident::AssetIdent, module::Module};
#[turbo_tasks::value]
#[derive(Clone, Debug)]
pub struct GlobalInformation {
    pub module_id_map: HashMap<AssetIdent, ModuleId>,
}
impl GlobalInformation {
    pub async fn get_module_id(&self, asset_ident: Vc<AssetIdent>) -> Result<Vc<ModuleId>> {
        let ident_str = asset_ident.to_string().await?;
        let ident = asset_ident.await?;
        let hashed_module_id = self.module_id_map.get(&ident);
        if let Some(hashed_module_id) = hashed_module_id {
            dbg!("Hashed module ID found", &ident_str, hashed_module_id);
            return Ok(hashed_module_id.clone().cell());
        }
        dbg!("Hashed module ID not found", &ident_str);
        Ok(ModuleId::String(ident_str.clone_value()).cell())
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionGlobalInformation(Option<GlobalInformation>);

// NOTE(LichuAcu): This is a temporary location for this function,
// it could later be moved to a `module_id_optimization.rs` file with
// other module ID optimization logic.
pub async fn process_module(
    module: Vc<Box<dyn Module>>,
    id_map: &mut HashMap<AssetIdent, ModuleId>,
    used_ids: &mut HashSet<u64>,
) -> Result<()> {
    let ident = module.ident();

    let hash = hash_xxh3_hash64(ident.to_string().await?);
    let mut masked_hash = hash & 0xF;
    let mut mask = 0xF;
    while used_ids.contains(&masked_hash) {
        if mask == 0xFFFFFFFFFFFFFFFF {
            return Err(anyhow::anyhow!("This is a... 64-bit hash collision?"));
        }
        mask = (mask << 4) | 0xF;
        masked_hash = hash & mask;
    }

    let hashed_module_id = ModuleId::String(masked_hash.to_string().into());

    dbg!(
        "process_module",
        ident.await?.clone_value(),
        &hashed_module_id,
        mask
    );

    id_map.insert(ident.await?.clone_value(), hashed_module_id);
    used_ids.insert(masked_hash);

    Ok(())
}
