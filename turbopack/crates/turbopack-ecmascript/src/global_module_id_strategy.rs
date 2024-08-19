use std::collections::{HashMap, HashSet};

use anyhow::Result;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal},
    RcStr, TryJoinIterExt, ValueToString, Vc,
};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    chunk::ModuleId,
    module::{Module, Modules},
    reference::ModuleReference,
};

use crate::references::esm::EsmAsyncAssetReference;

#[turbo_tasks::value]
pub struct PreprocessedChildrenIdents {
    // ident.to_string() -> full hash
    // We save the full hash to avoid re-hashing in `merge_preprocessed_module_ids`
    // if this endpoint did not change.
    modules_idents: HashMap<RcStr, u64>,
}

#[derive(Clone, Hash)]
#[turbo_tasks::value(shared)]
pub enum ReferencedModule {
    Module(Vc<Box<dyn Module>>),
    AsyncLoaderModule(Vc<Box<dyn Module>>),
}

impl ReferencedModule {
    fn module(&self) -> Vc<Box<dyn Module>> {
        match *self {
            ReferencedModule::Module(module) => module,
            ReferencedModule::AsyncLoaderModule(module) => module,
        }
    }
}

// TODO(LichuAcu): Reduce type complexity
#[allow(clippy::type_complexity)]
type ModulesAndAsyncLoaders = Vec<(Vec<Vc<Box<dyn Module>>>, Option<Vc<Box<dyn Module>>>)>;

#[turbo_tasks::value(transparent)]
pub struct ReferencedModules(Vec<Vc<ReferencedModule>>);

#[turbo_tasks::function]
async fn referenced_modules(module: Vc<Box<dyn Module>>) -> Result<Vc<ReferencedModules>> {
    let references = module.references().await?;

    let mut set = HashSet::new();
    let modules_and_async_loaders: ModulesAndAsyncLoaders = references
        .iter()
        .map(|reference| async move {
            let async_loader =
                if Vc::try_resolve_downcast_type::<EsmAsyncAssetReference>(*reference)
                    .await?
                    .is_some()
                {
                    *reference
                        .resolve_reference()
                        .resolve()
                        .await?
                        .first_module()
                        .await?
                } else {
                    None
                };

            let modules = reference
                .resolve_reference()
                .resolve()
                .await?
                .primary_modules()
                .await?
                .clone_value();

            Ok((modules, async_loader))
        })
        .try_join()
        .await?;

    let mut modules = Vec::new();

    for (module_list, async_loader) in modules_and_async_loaders {
        for module in module_list {
            if set.insert(module) {
                modules.push(ReferencedModule::Module(module).cell());
            }
        }
        if let Some(async_loader_module) = async_loader {
            if set.insert(async_loader_module) {
                modules.push(ReferencedModule::AsyncLoaderModule(async_loader_module).cell());
            }
        }
    }

    Ok(Vc::cell(modules))
}

pub async fn get_children_modules(
    parent: Vc<ReferencedModule>,
) -> Result<impl Iterator<Item = Vc<ReferencedModule>> + Send> {
    let parent_module = parent.await?.module();
    let mut modules = referenced_modules(parent_module).await?.clone_value();
    for module in parent_module.additional_layers_modules().await? {
        modules.push(ReferencedModule::Module(*module).cell());
    }
    Ok(modules.into_iter())
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
        .visit(
            root_modules
                .await?
                .iter()
                .map(|module| ReferencedModule::Module(*module).cell())
                .collect::<Vec<_>>(),
            get_children_modules,
        )
        .await
        .completed()?
        .into_inner()
        .into_reverse_topological();

    // module_id -> full hash
    let mut modules_idents = HashMap::new();
    for child_module in children_modules_iter {
        match *child_module.await? {
            ReferencedModule::Module(module) => {
                let module_ident = module.ident();
                let ident_str = module_ident.to_string().await?.clone_value();
                let hash = hash_xxh3_hash64(&ident_str);
                modules_idents.insert(ident_str, hash);
            }
            ReferencedModule::AsyncLoaderModule(async_loader_module) => {
                let async_loader_ident = async_loader_module
                    .ident()
                    .with_modifier(Vc::cell("async loader".into()));
                let ident_str = async_loader_ident.to_string().await?.clone_value();
                let hash = hash_xxh3_hash64(&ident_str);
                modules_idents.insert(ident_str, hash);
            }
        }
    }

    Ok(PreprocessedChildrenIdents { modules_idents }.cell())
}

// Note(LichuAcu): This could be split into two functions: one that merges the preprocessed module
// ids and another that generates the final, optimized module ids. Thoughts?
pub async fn merge_preprocessed_module_ids(
    preprocessed_module_ids: Vec<Vc<PreprocessedChildrenIdents>>,
) -> Result<HashMap<RcStr, Vc<ModuleId>>> {
    let mut module_id_map: HashMap<RcStr, Vc<ModuleId>> = HashMap::new();
    let mut used_ids: HashSet<u64> = HashSet::new();

    for preprocessed_module_ids in preprocessed_module_ids {
        for (module_ident, full_hash) in preprocessed_module_ids.await?.modules_idents.iter() {
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
    ident_str: RcStr,
    full_hash: u64,
    id_map: &mut HashMap<RcStr, Vc<ModuleId>>,
    used_ids: &mut HashSet<u64>,
) -> Result<()> {
    if id_map.contains_key(&ident_str) {
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

    id_map.insert(ident_str, hashed_module_id.cell());
    used_ids.insert(masked_hash);

    Ok(())
}
