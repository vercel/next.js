use std::collections::{HashMap, HashSet};

use anyhow::Result;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal},
    ValueToString, Vc,
};
use turbo_tasks_hash::hash_xxh3_hash64;

use crate::{
    chunk::ModuleId,
    ident::AssetIdent,
    module::{Module, Modules},
};

#[turbo_tasks::value]
pub struct PreprocessedChildrenIdents {
    // module_id -> full hash
    // We save the full hash to avoid re-hashing in `merge_preprocessed_module_ids`
    // if this endpoint did not change.
    modules_idents: HashMap<AssetIdent, u64>,
}

pub async fn get_children_modules(
    parent: Vc<Box<dyn Module>>,
) -> Result<impl Iterator<Item = Vc<Box<dyn Module>>> + Send> {
    Ok(parent.children_modules().await?.clone_value().into_iter())
}

// NOTE(LichuAcu) Called on endpoint.root_modules(). It would probably be better if this was called
// directly on `Endpoint`, but such struct is not available in turbopack-core. The whole function
// could be moved to `next-api`, but it would require adding turbo-tasks-hash to `next-api`,
// making it heavier.
#[turbo_tasks::function]
pub async fn children_modules_idents(
    root_modules: Vc<Modules>,
) -> Result<Vc<PreprocessedChildrenIdents>> {
    let children_modules_iter = AdjacencyMap::new()
        .skip_duplicates()
        .visit(root_modules.await?.iter().copied(), get_children_modules)
        .await
        .completed()?
        .into_inner()
        .into_reverse_topological();

    // module_id -> full hash
    let mut modules_idents = HashMap::new();

    for module in children_modules_iter {
        let module_ident = module.ident();
        let hash = hash_xxh3_hash64(module_ident.to_string().await?);
        modules_idents.insert(module_ident.await?.clone_value(), hash);
    }

    Ok(PreprocessedChildrenIdents { modules_idents }.cell())
}

// Note(LichuAcu): This could be split into two functions: one that merges the preprocessed module
// ids and another that generates the final, optimized module ids. Thoughts?
pub async fn merge_preprocessed_module_ids(
    prepared_module_ids: Vec<Vc<PreprocessedChildrenIdents>>,
) -> Result<HashMap<AssetIdent, Vc<ModuleId>>> {
    let mut module_id_map: HashMap<AssetIdent, Vc<ModuleId>> = HashMap::new();
    let mut used_ids: HashSet<u64> = HashSet::new();

    for prepared_module_ids in prepared_module_ids {
        for (module_ident, full_hash) in prepared_module_ids.await?.modules_idents.iter() {
            process_module(
                module_ident.clone(),
                *full_hash,
                &mut module_id_map,
                &mut used_ids,
            )
            .await?;
        }
    }

    Ok(module_id_map)
}

pub async fn process_module(
    module_ident: AssetIdent,
    full_hash: u64,
    id_map: &mut HashMap<AssetIdent, Vc<ModuleId>>,
    used_ids: &mut HashSet<u64>,
) -> Result<()> {
    if id_map.contains_key(&module_ident) {
        return Ok(());
    }

    let mut masked_hash = full_hash & 0xF;
    let mut mask = 0xF;
    while used_ids.contains(&masked_hash) {
        if mask == 0xFFFFFFFFFFFFFFFF {
            return Err(anyhow::anyhow!("This is a... 64-bit hash collision?"));
        }
        mask = (mask << 4) | 0xF;
        masked_hash = full_hash & mask;
    }

    let hashed_module_id = ModuleId::String(masked_hash.to_string().into());

    id_map.insert(module_ident, hashed_module_id.cell());
    used_ids.insert(masked_hash);

    Ok(())
}
