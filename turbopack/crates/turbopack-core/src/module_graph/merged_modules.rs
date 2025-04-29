use anyhow::Result;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks::{FxIndexMap, ResolvedVc, SliceMap, TryJoinIterExt, ValueToString, Vc};

use crate::{
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph},
};

#[turbo_tasks::value(transparent)]
pub struct MergedModules(SliceMap<ResolvedVc<Box<dyn Module>>, bool>);
#[turbo_tasks::value_impl]
impl MergedModules {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Default::default())
    }
}

// TODO maybe a smallvec once we know the size distribution?
#[turbo_tasks::value]
pub struct MergedModuleInfo {
    groups: FxHashMap<ResolvedVc<Box<dyn Module>>, ResolvedVc<MergedModules>>,
    included: FxHashSet<ResolvedVc<Box<dyn Module>>>,
}

#[turbo_tasks::value_impl]
impl MergedModuleInfo {
    #[turbo_tasks::function]
    pub fn additional_modules_for_entry(
        &self,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Vc<MergedModules> {
        self.groups
            .get(&module)
            .map(|v| **v)
            .unwrap_or_else(MergedModules::empty)
    }

    #[turbo_tasks::function]
    pub fn should_create_chunk_item_for(&self, module: ResolvedVc<Box<dyn Module>>) -> Vc<bool> {
        Vc::cell(!self.included.contains(&module))
    }
}

pub async fn compute_merged_modules(module_graph: Vc<ModuleGraph>) -> Result<Vc<MergedModuleInfo>> {
    let chunk_groups = module_graph.chunk_group_info().await?;
    let module_graph = module_graph.await?;

    #[allow(clippy::type_complexity)]
    let mut groups: FxIndexMap<
        ResolvedVc<Box<dyn Module>>,
        FxIndexMap<ResolvedVc<Box<dyn Module>>, bool>,
    > = Default::default();
    let mut included: FxHashSet<ResolvedVc<Box<dyn Module>>> = FxHashSet::default();

    // let parents = FxHashMap::default();

    for chunk_group in &chunk_groups.chunk_groups {
        // struct State {
        //     first: Option<ResolvedVc<Box<dyn Module>>>,
        // }
        // let mut state = State { first: None };
        let entries = FxHashSet::from_iter(chunk_group.entries());
        let mut first = None;
        module_graph
            .traverse_edges_from_entries_topological(
                chunk_group.entries(),
                &mut (),
                |parent_info, _node, _| {
                    if parent_info.is_none_or(|p| p.1.is_parallel()) {
                        Ok(GraphTraversalAction::Continue)
                    } else {
                        Ok(GraphTraversalAction::Exclude)
                    }
                },
                |_parent_info, node, _| {
                    let module = node.module;
                    let is_exposed = entries.contains(&module);
                    if is_exposed {
                        groups.entry(module).or_default();
                    } else if let Some(first) = first {
                        if module != first {
                            included.insert(module);
                            groups.entry(first).or_default().insert(module, true);
                        }
                    } else {
                        first = Some(module);
                        groups.entry(module).or_default();
                    }
                },
            )
            .await?;
    }

    println!(
        "included {:#?}",
        included
            .iter()
            .map(|m| m.ident().to_string())
            .try_join()
            .await?
    );
    println!(
        "groups {:#?}",
        groups
            .iter()
            .map(async |(k, v)| Ok((
                k.ident().to_string().await?,
                v.iter()
                    .map(async |(m, exposed)| Ok((m.ident().to_string().await?, exposed)))
                    .try_join()
                    .await?
            )))
            .try_join()
            .await?
    );

    Ok(MergedModuleInfo {
        groups: groups
            .into_iter()
            .map(|(k, v)| (k, ResolvedVc::cell(v.into_iter().collect())))
            .collect(),
        included,
    }
    .cell())
}
