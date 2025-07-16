use std::collections::hash_map::Entry;

use anyhow::Result;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, ResolvedVc, TryJoinIterExt, ValueToString, Vc, trace::TraceRawVcs,
};
use turbopack_core::{
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
    entry_modules: Vc<Modules>,
) -> Result<Vc<ModuleGraphSnapshot>> {
    let module_graph = module_graph.await?;

    struct RawModuleInfo {
        module: ResolvedVc<Box<dyn Module>>,
        depth: u32,
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
            Entry::Occupied(entry) => return *entry.get(),
            Entry::Vacant(entry) => {
                let index = modules.len();
                modules.push(RawModuleInfo {
                    module,
                    depth: u32::MAX,
                    references: Vec::new(),
                    incoming_references: Vec::new(),
                });
                entry.insert(index);
                return index;
            }
        }
    }

    module_graph
        .traverse_edges_from_entries_bfs(
            entry_modules.await?.iter().copied(),
            |parent_info, node| {
                let module = node.module;
                let module_index = get_or_create_module(&mut modules, &mut module_to_index, module);

                if let Some((parent_module, ty)) = parent_info {
                    let parent_index = get_or_create_module(
                        &mut modules,
                        &mut module_to_index,
                        parent_module.module,
                    );
                    let parent_module = &mut modules[parent_index];
                    let parent_depth = parent_module.depth;
                    debug_assert!(parent_depth < u32::MAX);
                    parent_module.incoming_references.push(ModuleReference {
                        index: module_index,
                        chunking_type: ty.chunking_type.clone(),
                        export: ty.export.clone(),
                    });
                    let module = &mut modules[module_index];
                    module.depth = module.depth.min(parent_depth + 1);
                    module.references.push(ModuleReference {
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
            },
        )
        .await?;

    let modules = modules
        .into_iter()
        .map(async |info| {
            Ok(ModuleInfo {
                ident: info.module.ident().to_string().owned().await?,
                path: info.module.ident().path().to_string().owned().await?,
                depth: info.depth,
                references: info.references,
                incoming_references: info.incoming_references,
            })
        })
        .try_join()
        .await?;

    Ok(ModuleGraphSnapshot { modules, entries }.cell())
}
