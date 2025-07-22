use std::{cell::RefCell, cmp::Reverse, collections::hash_map::Entry, mem::take};

use anyhow::Result;
use either::Either;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, ResolvedVc, TryJoinIterExt, ValueToString, Vc, trace::TraceRawVcs,
};
use turbopack_core::{
    asset::Asset,
    chunk::ChunkingType,
    module::{Module, Modules},
    module_graph::{GraphTraversalAction, ModuleGraph},
    resolve::ExportUsage,
};

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, Debug)]
pub struct ModuleReference {
    pub index: usize,
    pub chunking_type: ChunkingType,
    pub export: ExportUsage,
}

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, Debug)]
pub struct ModuleInfo {
    pub ident: RcStr,
    pub path: RcStr,
    pub depth: u32,
    pub size: u32,
    // TODO this should be per layer
    pub retained_size: u32,
    pub references: Vec<ModuleReference>,
    pub incoming_references: Vec<ModuleReference>,
}

#[turbo_tasks::value]
pub struct ModuleGraphSnapshot {
    pub modules: Vec<ModuleInfo>,
    pub entries: Vec<usize>,
}

#[turbo_tasks::function]
pub async fn get_module_graph_snapshot(
    module_graph: Vc<ModuleGraph>,
    entry_modules: Option<Vc<Modules>>,
) -> Result<Vc<ModuleGraphSnapshot>> {
    let module_graph = module_graph.await?;

    struct RawModuleInfo {
        module: ResolvedVc<Box<dyn Module>>,
        depth: u32,
        retained_modules: RefCell<FxHashSet<u32>>,
        references: Vec<ModuleReference>,
        incoming_references: Vec<ModuleReference>,
    }

    let mut entries = Vec::new();
    let mut modules = Vec::new();
    let mut module_to_index = FxHashMap::default();

    fn get_or_create_module(
        modules: &mut Vec<RawModuleInfo>,
        module_to_index: &mut FxHashMap<ResolvedVc<Box<dyn Module>>, usize>,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> usize {
        match module_to_index.entry(module) {
            Entry::Occupied(entry) => *entry.get(),
            Entry::Vacant(entry) => {
                let index = modules.len();
                modules.push(RawModuleInfo {
                    module,
                    depth: u32::MAX,
                    references: Vec::new(),
                    incoming_references: Vec::new(),
                    retained_modules: Default::default(),
                });
                entry.insert(index);
                index
            }
        }
    }

    let entry_modules = if let Some(entry_modules) = entry_modules {
        Either::Left(entry_modules.await?)
    } else {
        Either::Right(module_graph.entries().await?)
    };
    module_graph
        .traverse_edges_from_entries_bfs(entry_modules.iter().copied(), |parent_info, node| {
            let module = node.module;
            let module_index = get_or_create_module(&mut modules, &mut module_to_index, module);

            if let Some((parent_module, ty)) = parent_info {
                let parent_index =
                    get_or_create_module(&mut modules, &mut module_to_index, parent_module.module);
                let parent_module = &mut modules[parent_index];
                let parent_depth = parent_module.depth;
                debug_assert!(parent_depth < u32::MAX);
                parent_module.references.push(ModuleReference {
                    index: module_index,
                    chunking_type: ty.chunking_type.clone(),
                    export: ty.export.clone(),
                });
                let module = &mut modules[module_index];
                module.depth = module.depth.min(parent_depth + 1);
                module.incoming_references.push(ModuleReference {
                    index: parent_index,
                    chunking_type: ty.chunking_type.clone(),
                    export: ty.export.clone(),
                });
            } else {
                entries.push(module_index);
                let module = &mut modules[module_index];
                module.depth = 0;
            }

            Ok(GraphTraversalAction::Continue)
        })
        .await?;

    let mut modules_by_depth = FxHashMap::default();
    for (index, info) in modules.iter().enumerate() {
        modules_by_depth
            .entry(info.depth)
            .or_insert_with(Vec::new)
            .push(index);
    }
    let mut modules_by_depth = modules_by_depth.into_iter().collect::<Vec<_>>();
    modules_by_depth.sort_by_key(|(depth, _)| Reverse(*depth));
    for (depth, module_indicies) in modules_by_depth {
        for module_index in module_indicies {
            let module = &modules[module_index];
            for ref_info in &module.incoming_references {
                let ref_module = &modules[ref_info.index];
                if ref_module.depth < depth {
                    let mut retained_modules = ref_module.retained_modules.borrow_mut();
                    retained_modules.insert(module_index as u32);
                    for retained in module.retained_modules.borrow().iter() {
                        retained_modules.insert(*retained);
                    }
                }
            }
        }
    }

    let mut final_modules = modules
        .iter_mut()
        .map(async |info| {
            Ok(ModuleInfo {
                ident: info.module.ident().to_string().owned().await?,
                path: info.module.ident().path().to_string().owned().await?,
                depth: info.depth,
                size: info
                    .module
                    .content()
                    .len()
                    .owned()
                    .await
                    // TODO all modules should report some content and should not crash
                    .unwrap_or_default()
                    .unwrap_or_default()
                    .try_into()
                    .unwrap_or(u32::MAX),
                retained_size: 0,
                references: take(&mut info.references),
                incoming_references: take(&mut info.incoming_references),
            })
        })
        .try_join()
        .await?;

    for (index, info) in modules.into_iter().enumerate() {
        let retained_size = info
            .retained_modules
            .into_inner()
            .iter()
            .map(|&retained_index| {
                let retained_info = &final_modules[retained_index as usize];
                retained_info.size
            })
            .reduce(|a, b| a.saturating_add(b))
            .unwrap_or_default();
        final_modules[index].retained_size = retained_size + final_modules[index].size;
    }

    Ok(ModuleGraphSnapshot {
        modules: final_modules,
        entries,
    }
    .cell())
}
