use std::{
    cmp::Reverse,
    collections::{BTreeMap, hash_map::Entry},
};

use anyhow::{Context, Result, bail};
use rustc_hash::{FxHashMap, FxHashSet};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{OperationVc, ResolvedVc, Vc};

use crate::{
    chunk::chunking_context::UnusedReferences,
    module::Module,
    module_graph::{
        GraphEdgeIndex, GraphTraversalAction, ModuleGraph,
        side_effect_module_info::compute_side_effect_free_module_info,
    },
    resolve::{ExportUsage, ImportUsage, MemberUsage, merge_member_maps},
};

#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct UsedExportsMap(FxHashMap<ResolvedVc<Box<dyn Module>>, ModuleExportUsageInfo>);

#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct ExportCircuitBreakers(FxHashSet<ResolvedVc<Box<dyn Module>>>);

/// Modules that are read through a *partial namespace object* — an
/// [`ExportUsage::PartialNamespaceObject`] edge points at them.
///
/// The used export names are still known individually (that is why the usage stays
/// [`ModuleExportUsageInfo::Exports`]), but the reads went through a namespace value: a namespace
/// binding's member reads or destructuring, or the object a dynamic `import()` resolves to. Some of
/// those reads are lowered to direct named accesses and some are not, and this set does not
/// distinguish them — so a consumer that wants to rename the module's export keys has to assume the
/// original names may still be read somewhere, and leave them alone.
#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct PartialNamespaceModules(FxHashSet<ResolvedVc<Box<dyn Module>>>);

/// The module graph edges of references that are unused and should be skipped during traversals.
#[turbo_tasks::value(transparent, cell = "keyed")]
#[derive(Debug)]
pub struct UnusedReferenceEdges(FxHashSet<GraphEdgeIndex>);

#[turbo_tasks::value]
#[derive(Clone, Default, Debug)]
pub struct BindingUsageInfo {
    unused_references: ResolvedVc<UnusedReferences>,
    unused_references_edges: ResolvedVc<UnusedReferenceEdges>,

    used_exports: ResolvedVc<UsedExportsMap>,
    export_circuit_breakers: ResolvedVc<ExportCircuitBreakers>,
    partial_namespace_modules: ResolvedVc<PartialNamespaceModules>,
}

#[turbo_tasks::value(transparent)]
pub struct OptionBindingUsageInfo(Option<ResolvedVc<BindingUsageInfo>>);

#[turbo_tasks::value]
pub struct ModuleExportUsage {
    pub export_usage: ResolvedVc<ModuleExportUsageInfo>,
    /// Whether this module must expose exports before imports. This is conservative when export
    /// usage analysis did not run, because a cycle cannot be ruled out.
    pub is_circuit_breaker: bool,
    /// Whether this module is read through a namespace value somewhere, which means one of those
    /// reads may still use an original export name. See [`PartialNamespaceModules`].
    pub namespace_object_may_escape: bool,
}
#[turbo_tasks::value_impl]
impl ModuleExportUsage {
    #[turbo_tasks::function]
    pub async fn unknown() -> Result<Vc<Self>> {
        Ok(Self {
            export_usage: ModuleExportUsageInfo::all().to_resolved().await?,
            is_circuit_breaker: true,
            namespace_object_may_escape: true,
        }
        .cell())
    }
}

impl BindingUsageInfo {
    pub async fn used_exports(
        &self,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<ModuleExportUsage>> {
        let is_circuit_breaker = self.export_circuit_breakers.contains_key(&module).await?;
        let Some(exports) = self.used_exports.get(&module).await? else {
            bail!(
                "export usage not found for module: {:?}",
                module.ident_string().await?
            );
        };
        let namespace_object_may_escape =
            self.partial_namespace_modules.contains_key(&module).await?;
        Ok(ModuleExportUsage {
            export_usage: (*exports).clone().resolved_cell(),
            is_circuit_breaker,
            namespace_object_may_escape,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl BindingUsageInfo {
    #[turbo_tasks::function]
    pub fn unused_references(&self) -> Vc<UnusedReferences> {
        *self.unused_references
    }

    #[turbo_tasks::function]
    pub fn unused_references_edges(&self) -> Vc<UnusedReferenceEdges> {
        *self.unused_references_edges
    }
}

#[turbo_tasks::function(operation)]
pub async fn compute_binding_usage_info(
    graph: OperationVc<ModuleGraph>,
    remove_unused_imports: bool,
) -> Result<Vc<BindingUsageInfo>> {
    let span_outer = tracing::info_span!(
        "compute binding usage info",
        visit_count = tracing::field::Empty,
        unused_reference_count = tracing::field::Empty
    );
    let span = span_outer.clone();

    async move {
        let mut used_exports = FxHashMap::<_, ModuleExportUsageInfo>::default();
        let mut partial_namespace_modules = FxHashSet::default();
        #[cfg(debug_assertions)]
        let mut debug_unused_references_name = FxHashSet::<(
            ResolvedVc<Box<dyn Module>>,
            ExportUsage,
            ResolvedVc<Box<dyn Module>>,
        )>::default();
        let mut unused_references_edges = FxHashSet::default();
        let mut unused_references =
            FxHashMap::<_, FxHashSet<ResolvedVc<Box<dyn Module>>>>::default();

        let graph = graph.connect();
        let graph_ref = graph.await?;
        if graph_ref.unused_references_edges.is_some() {
            // Reject graphs that already have binding usage info. Recomputing it on such a graph
            // is unfortunately easy to do with
            // ```
            // fn get_module_graph(){
            //   let graph = ....;
            //   let graph = graph.without_unused_references(compute_binding_usage_info(graph));
            //   return graph
            // }
            //
            // compute_binding_usage_info(get_module_graph())
            // ```
            panic!(
                "don't run compute_binding_usage_info on a graph after calling \
                 without_unused_references"
            );
        }
        let side_effect_free_modules = if remove_unused_imports {
            let side_effect_free_modules = compute_side_effect_free_module_info(graph).await?;
            span.record("side_effect_free_modules", side_effect_free_modules.len());
            Some(side_effect_free_modules)
        } else {
            None
        };

        // Visit modules in reverse postorder. In an acyclic graph, this processes each module only
        // after all modules importing it, i.e. once, with its final usage. Cycles still rely on the
        // fixed point and may revisit modules in or after them. This avoids order-dependent
        // revisits in DAG-shaped graphs, at the cost of an additional traversal to compute ranks
        // (shared with the other analyses of this graph).
        let module_rank = graph_ref.entry_ranks()?;

        let visit_count = graph_ref.traverse_edges_fixed_point_with_priority(
            graph_ref
                .all_chunk_group_entry_modules()
                .map(|m| {
                    Ok((
                        m,
                        Reverse(*module_rank.get(&m).context("Module rank not found")?),
                    ))
                })
                .collect::<Result<Vec<_>>>()?,
            &mut (),
            |parent, target, _, _| {
                // Entries are always used
                let Some((parent, ref_data, edge)) = parent else {
                    used_exports.insert(target, ModuleExportUsageInfo::All);
                    return Ok(GraphTraversalAction::Continue);
                };

                if remove_unused_imports {
                    // If this is an evaluation reference and the target has no side effects
                    // then we can drop it. NOTE: many `imports` create parallel Evaluation
                    // and Named/All references
                    if matches!(&ref_data.binding_usage.export, ExportUsage::Evaluation)
                        && side_effect_free_modules
                            .as_ref()
                            .expect("this must be present if `remove_unused_imports` is true")
                            .contains(&target)
                    {
                        #[cfg(debug_assertions)]
                        debug_unused_references_name.insert((
                            parent,
                            ref_data.binding_usage.export.clone(),
                            target,
                        ));
                        unused_references_edges.insert(edge);
                        unused_references
                            .entry(ref_data.reference)
                            .or_default()
                            .insert(target);
                        return Ok(GraphTraversalAction::Skip);
                    }
                    // If the current edge is an unused import, skip it
                    match &ref_data.binding_usage.import {
                        ImportUsage::Exports(exports) => {
                            let source_used_exports = used_exports
                                .get(&parent)
                                .context("parent module must have usage info")?;
                            if exports
                                .iter()
                                .all(|e| !source_used_exports.is_export_used(e))
                            {
                                // all exports are unused
                                #[cfg(debug_assertions)]
                                debug_unused_references_name.insert((
                                    parent,
                                    ref_data.binding_usage.export.clone(),
                                    target,
                                ));
                                unused_references_edges.insert(edge);
                                unused_references
                                    .entry(ref_data.reference)
                                    .or_default()
                                    .insert(target);

                                return Ok(GraphTraversalAction::Skip);
                            } else {
                                #[cfg(debug_assertions)]
                                debug_unused_references_name.remove(&(
                                    parent,
                                    ref_data.binding_usage.export.clone(),
                                    target,
                                ));
                                unused_references_edges.remove(&edge);
                                if let Entry::Occupied(mut e) =
                                    unused_references.entry(ref_data.reference)
                                {
                                    e.get_mut().remove(&target);
                                    if e.get().is_empty() {
                                        e.remove();
                                    }
                                }
                                // Continue, add export
                            }
                        }
                        ImportUsage::TopLevel => {
                            #[cfg(debug_assertions)]
                            debug_unused_references_name.remove(&(
                                parent,
                                ref_data.binding_usage.export.clone(),
                                target,
                            ));
                            unused_references_edges.remove(&edge);
                            if let Entry::Occupied(mut e) =
                                unused_references.entry(ref_data.reference)
                            {
                                e.get_mut().remove(&target);
                                if e.get().is_empty() {
                                    e.remove();
                                }
                            }
                            // Continue, has to always be included
                        }
                    }
                }

                let is_first_visit = !used_exports.contains_key(&target);
                let changed = match &ref_data.binding_usage.export {
                    ExportUsage::Passthrough {
                        namespace_object_may_escape,
                    } => {
                        // Passthrough edges always carry namespace provenance that already reached
                        // their parent. Some edges (for example a forwarded CommonJS namespace)
                        // additionally expose the target's original property names themselves.
                        let namespace_changed = if *namespace_object_may_escape
                            || partial_namespace_modules.contains(&parent)
                        {
                            partial_namespace_modules.insert(target)
                        } else {
                            false
                        };
                        let usage_changed = if parent == target {
                            // Merging the usage of a module into itself never changes it (and
                            // `get_disjoint_mut` would panic on the duplicate key).
                            false
                        } else {
                            used_exports.entry(target).or_default();
                            let [Some(parent_usage), Some(target_usage)] =
                                used_exports.get_disjoint_mut([&parent, &target])
                            else {
                                bail!("parent module must have usage info");
                            };
                            target_usage.add_usage_info(parent_usage)
                        };
                        namespace_changed || usage_changed
                    }
                    ExportUsage::NamespaceReexport { exports } => {
                        // `parent` exposes `target`'s namespace object as `exports`, so reads of
                        // their members are reads of `target`'s exports by name, through a
                        // namespace object.
                        let parent_usage = used_exports
                            .get(&parent)
                            .context("parent module must have usage info")?;
                        let mut forwarded = ModuleExportUsageInfo::Evaluation;
                        for export in exports {
                            forwarded
                                .add_usage_info(&parent_usage.namespace_usage_of_export(export));
                        }
                        let namespace_changed = partial_namespace_modules.insert(target);
                        let usage_changed = used_exports
                            .entry(target)
                            .or_default()
                            .add_usage_info(&forwarded);
                        namespace_changed || usage_changed
                    }
                    ExportUsage::ForwardExport { export, original } => {
                        let forwarded = used_exports
                            .get(&parent)
                            .context("parent module must have usage info")?
                            .forwarded_export_usage(export, original);
                        used_exports
                            .entry(target)
                            .or_default()
                            .add_usage_info(&forwarded)
                    }
                    export_usage => {
                        // A partial namespace edge means `target` is read through a namespace
                        // value. We know which names are used, but not that every read was
                        // lowered to a direct named access.
                        //
                        // The provenance can be new even when the used names are not (the target
                        // already uses `All` or these names), and it still has to be forwarded
                        // over the target's passthrough edges, so it counts as a change.
                        let namespace_changed = matches!(
                            export_usage,
                            ExportUsage::PartialNamespaceObject(_)
                                | ExportUsage::NamespaceMembers(_)
                        ) && partial_namespace_modules.insert(target);
                        let usage_changed =
                            used_exports.entry(target).or_default().add(export_usage);
                        namespace_changed || usage_changed
                    }
                };
                if changed || is_first_visit {
                    // First visit, or the used exports/namespace provenance changed. Either can
                    // cause more imports to become used downstream.
                    Ok(GraphTraversalAction::Continue)
                } else {
                    Ok(GraphTraversalAction::Skip)
                }
            },
            |successor, _| {
                Ok(Reverse(
                    *module_rank
                        .get(&successor)
                        .context("Module rank not found")?,
                ))
            },
        )?;

        // Compute cycles and select modules to be 'circuit breakers'
        //
        // To break cycles we need to ensure that no importing module can observe a
        // partially populated exports object.
        //
        // A circuit breaker module will need to eagerly export lazy getters for its exports to
        // break an evaluation cycle all other modules can export values after defining them
        //
        // In particular, this is also needed with scope hoisting and self-imports, as in
        // that case `__turbopack_esm__` is what initializes the exports object. (Without
        // scope hoisting, the exports object is already populated before any executing the
        // module factory.)
        let mut export_circuit_breakers = FxHashSet::default();

        graph_ref.traverse_cycles(
            // No need to traverse edges that are unused.
            |e| e.chunking_type.is_parallel() && !unused_references.contains_key(&e.reference),
            |cycle| {
                // We could compute this based on the module graph via a DFS from each entry point
                // to the cycle.  Whatever node is hit first is an entry point to the cycle.
                // (scope hoisting does something similar) and then we would only need to
                // mark 'entry' modules (basically the targets of back edges in the export graph) as
                // circuit breakers.  For now we just mark everything on the theory that cycles are
                // rare.  For vercel-site on 8/22/2025 there were 106 cycles covering 800 modules
                // (or 1.2% of all modules).  So with this analysis we could potentially drop 80% of
                // the cycle breaker modules.
                export_circuit_breakers.extend(cycle.iter().map(|n| **n));
                Ok(())
            },
        )?;

        span.record("visit_count", visit_count);
        span.record("unused_reference_count", unused_references.len());

        #[cfg(debug_assertions)]
        {
            use std::sync::LazyLock;
            static PRINT_UNUSED_REFERENCES: LazyLock<bool> = LazyLock::new(|| {
                std::env::var_os("TURBOPACK_PRINT_UNUSED_REFERENCES")
                    .is_some_and(|v| v == "1" || v == "true")
            });
            if *PRINT_UNUSED_REFERENCES {
                use turbo_tasks::TryJoinIterExt;
                println!(
                    "unused references: {:#?}",
                    debug_unused_references_name
                        .iter()
                        .map(async |(s, e, t)| Ok((
                            s.ident_string().await?,
                            e,
                            t.ident_string().await?,
                        )))
                        .try_join()
                        .await?
                );
            }

            static PRINT_USED_EXPORTS: LazyLock<bool> = LazyLock::new(|| {
                std::env::var_os("TURBOPACK_PRINT_USED_EXPORTS")
                    .is_some_and(|v| v == "1" || v == "true")
            });
            if *PRINT_USED_EXPORTS {
                use turbo_tasks::TryJoinIterExt;
                println!(
                    "used exports: {:#?}",
                    used_exports
                        .iter()
                        .map(async |(m, v)| Ok((m.ident_string().await?, v,)))
                        .try_join()
                        .await?
                );
            }
        }

        Ok(BindingUsageInfo {
            unused_references: ResolvedVc::cell(unused_references),
            unused_references_edges: ResolvedVc::cell(unused_references_edges),
            used_exports: ResolvedVc::cell(used_exports),
            export_circuit_breakers: ResolvedVc::cell(export_circuit_breakers),
            partial_namespace_modules: ResolvedVc::cell(partial_namespace_modules),
        }
        .cell())
    }
    .instrument(span_outer)
    .await
}

#[turbo_tasks::value]
#[derive(Default, Clone, Debug)]
pub enum ModuleExportUsageInfo {
    /// Only the side effects are needed, no exports is used.
    #[default]
    Evaluation,
    /// These exports are used. Each export is either used as a whole, or only through static
    /// members of its value (which narrows a namespace reexport, see
    /// [`ExportUsage::NamespaceReexport`]).
    Exports(BTreeMap<RcStr, MemberUsage>),
    All,
}

#[turbo_tasks::value_impl]
impl ModuleExportUsageInfo {
    #[turbo_tasks::function]
    pub fn all() -> Vc<Self> {
        ModuleExportUsageInfo::All.cell()
    }
}

impl ModuleExportUsageInfo {
    /// Merge the given usage into self. Returns true if Self changed.
    pub fn add(&mut self, usage: &ExportUsage) -> bool {
        match usage {
            ExportUsage::All => self.add_usage_info(&Self::All),
            ExportUsage::Evaluation => false,
            ExportUsage::Named(name) => self.add_export(name, &MemberUsage::All),
            ExportUsage::NamedMembers { export, members } => {
                self.add_export(export, &MemberUsage::Members(members.clone()))
            }
            ExportUsage::PartialNamespaceObject(names) => {
                let mut changed = self.promote_evaluation();
                for name in names {
                    changed |= self.add_export(name, &MemberUsage::All);
                }
                changed
            }
            ExportUsage::NamespaceMembers(members) => {
                self.add_usage_info(&Self::Exports(members.clone()))
            }
            ExportUsage::Passthrough { .. }
            | ExportUsage::ForwardExport { .. }
            | ExportUsage::NamespaceReexport { .. } => {
                // These depend on the referencing module's usage and are normally resolved before
                // `add`. If one reaches this fallback, preserve correctness by widening rather
                // than panicking during graph analysis.
                self.add_usage_info(&Self::All)
            }
        }
    }

    /// `Evaluation` -> empty `Exports`. Returns true if self changed.
    fn promote_evaluation(&mut self) -> bool {
        if matches!(self, Self::Evaluation) {
            *self = Self::Exports(BTreeMap::new());
            true
        } else {
            false
        }
    }

    /// Marks `export` as used with the given member usage. Returns true if self changed.
    fn add_export(&mut self, export: &RcStr, usage: &MemberUsage) -> bool {
        let promoted = self.promote_evaluation();
        match self {
            Self::All => false,
            Self::Evaluation => unreachable!(),
            Self::Exports(exports) => {
                promoted
                    | merge_member_maps(exports, &BTreeMap::from([(export.clone(), usage.clone())]))
            }
        }
    }

    /// Merge another module's resolved export usage into this one. Returns true if self changed.
    fn add_usage_info(&mut self, usage: &Self) -> bool {
        match (&mut *self, usage) {
            (Self::All, _) | (_, Self::Evaluation) => false,
            (_, Self::All) => {
                *self = Self::All;
                true
            }
            (Self::Evaluation, Self::Exports(exports)) => {
                *self = Self::Exports(exports.clone());
                true
            }
            (Self::Exports(left), Self::Exports(right)) => merge_member_maps(left, right),
        }
    }

    /// The usage of a module whose namespace object is this module's `export`, e.g. the target of
    /// `export * as export from './target'`.
    fn namespace_usage_of_export(&self, export: &RcStr) -> Self {
        match self {
            Self::All => Self::All,
            Self::Evaluation => Self::Evaluation,
            Self::Exports(exports) => match exports.get(export) {
                None => Self::Evaluation,
                Some(MemberUsage::All) => Self::All,
                Some(MemberUsage::Members(members)) => Self::Exports(members.clone()),
            },
        }
    }

    /// The usage of the target's `original` export, when it is exposed as this module's `export`.
    fn forwarded_export_usage(&self, export: &RcStr, original: &RcStr) -> Self {
        let usage = match self {
            Self::All => MemberUsage::All,
            Self::Evaluation => return Self::Evaluation,
            Self::Exports(exports) => match exports.get(export) {
                None => return Self::Evaluation,
                Some(usage) => usage.clone(),
            },
        };
        Self::Exports(BTreeMap::from([(original.clone(), usage)]))
    }

    pub fn is_export_used(&self, export: &RcStr) -> bool {
        match self {
            Self::All => true,
            Self::Evaluation => false,
            Self::Exports(exports) => exports.contains_key(export),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use turbo_rcstr::rcstr;

    use super::ModuleExportUsageInfo;
    use crate::resolve::{ExportUsage, MemberUsage};

    fn exports(names: &[&'static str]) -> ModuleExportUsageInfo {
        ModuleExportUsageInfo::Exports(
            names
                .iter()
                .map(|name| ((*name).into(), MemberUsage::All))
                .collect(),
        )
    }

    #[test]
    fn resolved_usage_join_is_monotonic() {
        let mut usage = ModuleExportUsageInfo::Evaluation;
        let first = exports(&["first"]);
        let second = exports(&["second"]);

        assert!(!usage.add_usage_info(&ModuleExportUsageInfo::Evaluation));
        assert!(usage.add_usage_info(&first));
        assert!(usage.is_export_used(&rcstr!("first")));
        assert!(!usage.add_usage_info(&first));
        assert!(usage.add_usage_info(&second));
        assert!(usage.is_export_used(&rcstr!("second")));
        assert!(!usage.add_usage_info(&ModuleExportUsageInfo::Evaluation));
        assert!(usage.add_usage_info(&ModuleExportUsageInfo::All));
        assert!(!usage.add_usage_info(&second));
        assert!(matches!(usage, ModuleExportUsageInfo::All));
    }

    #[test]
    fn unresolved_passthrough_falls_back_to_all() {
        let mut usage = ModuleExportUsageInfo::Evaluation;

        assert!(usage.add(&ExportUsage::Passthrough {
            namespace_object_may_escape: false,
        }));
        assert!(matches!(usage, ModuleExportUsageInfo::All));
    }

    #[test]
    fn nested_member_usage_merges_and_widens() {
        let path = |p: &[&'static str]| {
            MemberUsage::from_path(&p.iter().map(|s| (*s).into()).collect::<Vec<_>>())
        };
        let mut usage = ModuleExportUsageInfo::Evaluation;
        let MemberUsage::Members(core_en) = path(&["core", "locales", "en"]) else {
            unreachable!()
        };
        assert!(usage.add(&ExportUsage::NamespaceMembers(core_en)));
        let MemberUsage::Members(core_de) = path(&["core", "locales", "de"]) else {
            unreachable!()
        };
        assert!(usage.add(&ExportUsage::NamespaceMembers(core_de.clone())));
        assert!(!usage.add(&ExportUsage::NamespaceMembers(core_de)));

        // `core.locales` is read through `en` and `de` only.
        let core = usage.namespace_usage_of_export(&rcstr!("core"));
        let locales = core.namespace_usage_of_export(&rcstr!("locales"));
        assert!(locales.is_export_used(&rcstr!("en")));
        assert!(locales.is_export_used(&rcstr!("de")));
        assert!(!locales.is_export_used(&rcstr!("fr")));
        assert!(matches!(
            usage.namespace_usage_of_export(&rcstr!("unused")),
            ModuleExportUsageInfo::Evaluation
        ));

        // An opaque read of `core` widens it as a whole.
        assert!(usage.add(&ExportUsage::Named(rcstr!("core"))));
        assert!(matches!(
            usage.namespace_usage_of_export(&rcstr!("core")),
            ModuleExportUsageInfo::All
        ));
    }

    #[test]
    fn forwarded_export_keeps_member_usage() {
        let mut usage = ModuleExportUsageInfo::Evaluation;
        assert!(usage.add(&ExportUsage::NamedMembers {
            export: rcstr!("renamed"),
            members: BTreeMap::from([(rcstr!("leaf"), MemberUsage::All)]),
        }));
        let forwarded = usage.forwarded_export_usage(&rcstr!("renamed"), &rcstr!("original"));
        let ModuleExportUsageInfo::Exports(exports) = &forwarded else {
            panic!("expected exports, got {forwarded:?}");
        };
        assert!(matches!(
            exports.get(&rcstr!("original")),
            Some(MemberUsage::Members(members)) if members.contains_key(&rcstr!("leaf"))
        ));
        assert!(matches!(
            usage.forwarded_export_usage(&rcstr!("other"), &rcstr!("original")),
            ModuleExportUsageInfo::Evaluation
        ));
        assert!(matches!(
            ModuleExportUsageInfo::All.forwarded_export_usage(&rcstr!("a"), &rcstr!("b")),
            ModuleExportUsageInfo::Exports(exports) if matches!(exports.get(&rcstr!("b")), Some(MemberUsage::All))
        ));
    }
}

#[cfg(test)]
mod graph_tests {
    use std::collections::BTreeMap;

    use anyhow::Result;
    use rustc_hash::FxHashMap;
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{FileSystem, FileSystemPath, VirtualFileSystem};

    use super::compute_binding_usage_info;
    use crate::{
        asset::{Asset, AssetContent},
        ident::AssetIdent,
        module::{Module, ModuleSideEffects},
        module_graph::{
            GraphEntries, ModuleGraph, SingleModuleGraph,
            chunk_group_info::{ChunkGroupEntry, EntryHeuristics},
        },
        reference::{ModuleReference, ModuleReferences, SingleChunkableModuleReference},
        resolve::{ExportUsage, MemberUsage},
    };

    /// Module name -> outgoing edges `(target name, export usage of the edge)`, in reference order.
    type Edges = Vec<(RcStr, Vec<(RcStr, ExportUsage)>)>;

    #[turbo_tasks::value(shared)]
    struct UsageTestRepo {
        edges: FxHashMap<RcStr, Vec<(RcStr, ExportUsage)>>,
    }

    #[turbo_tasks::value]
    struct UsageTestModule {
        root: FileSystemPath,
        name: RcStr,
        repo: ResolvedVc<UsageTestRepo>,
    }

    #[turbo_tasks::value_impl]
    impl UsageTestModule {
        /// Interned through a task so that every reference to the same name yields the same module.
        #[turbo_tasks::function]
        fn new(root: FileSystemPath, name: RcStr, repo: ResolvedVc<UsageTestRepo>) -> Vc<Self> {
            Self { root, name, repo }.cell()
        }
    }

    #[turbo_tasks::value_impl]
    impl Asset for UsageTestModule {
        #[turbo_tasks::function]
        fn content(&self) -> Vc<AssetContent> {
            panic!("UsageTestModule::content shouldn't be called")
        }
    }

    #[turbo_tasks::value_impl]
    impl Module for UsageTestModule {
        #[turbo_tasks::function]
        fn ident(&self) -> Result<Vc<AssetIdent>> {
            Ok(AssetIdent::from_path(self.root.join(&self.name)?).into_vc())
        }

        #[turbo_tasks::function]
        fn source(&self) -> Vc<crate::source::OptionSource> {
            Vc::cell(None)
        }

        #[turbo_tasks::function]
        async fn references(&self) -> Result<Vc<ModuleReferences>> {
            let repo = self.repo.await?;
            let references = repo
                .edges
                .get(&self.name)
                .into_iter()
                .flatten()
                .map(async |(target, export)| {
                    let target =
                        UsageTestModule::new(self.root.clone(), target.clone(), *self.repo);
                    Ok(ResolvedVc::upcast::<Box<dyn ModuleReference>>(
                        SingleChunkableModuleReference::new(
                            Vc::upcast(target),
                            rcstr!("test-dep"),
                            export_usage_vc(export),
                        )
                        .to_resolved()
                        .await?,
                    ))
                })
                .try_join()
                .await?;
            Ok(Vc::cell(references))
        }

        #[turbo_tasks::function]
        fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
            ModuleSideEffects::SideEffectful.cell()
        }
    }

    /// `ExportUsage` cells are private to `resolve`, so go through its public constructors (or
    /// `cell_for_test` for the member and forwarding variants).
    fn export_usage_vc(export: &ExportUsage) -> Vc<ExportUsage> {
        match export {
            ExportUsage::All => ExportUsage::all(),
            ExportUsage::Named(name) => ExportUsage::named(name.clone()),
            ExportUsage::PartialNamespaceObject(names) => {
                ExportUsage::partial_namespace_object(names.to_vec())
            }
            ExportUsage::Evaluation => ExportUsage::evaluation(),
            ExportUsage::Passthrough {
                namespace_object_may_escape,
            } => ExportUsage::passthrough(*namespace_object_may_escape),
            ExportUsage::NamedMembers { .. }
            | ExportUsage::NamespaceMembers(_)
            | ExportUsage::ForwardExport { .. }
            | ExportUsage::NamespaceReexport { .. } => export.clone().cell_for_test(),
        }
    }

    /// `(module name, namespace_object_may_escape)` for every module in the graph, sorted by name.
    #[turbo_tasks::value(transparent)]
    struct NamespaceEscapes(Vec<(RcStr, bool)>);

    #[turbo_tasks::function(operation, root)]
    async fn namespace_escapes_operation(
        namespace_path_is_longer: bool,
        plain_usage_is_all: bool,
        namespace_members: bool,
        namespace_reexport: bool,
    ) -> Result<Vc<NamespaceEscapes>> {
        let plain_usage = if plain_usage_is_all {
            ExportUsage::All
        } else {
            ExportUsage::Named(rcstr!("a"))
        };
        let namespace_usage = if namespace_members {
            namespace_a_member_b()
        } else {
            namespace_a()
        };
        let edges = if namespace_reexport {
            namespace_reexport_graph(namespace_path_is_longer, plain_usage)
        } else {
            namespace_graph(namespace_path_is_longer, plain_usage, namespace_usage)
        };
        let root = VirtualFileSystem::new_with_name(rcstr!("test"))
            .root()
            .owned()
            .await?;
        let names = edges
            .iter()
            .flat_map(|(from, to)| {
                std::iter::once(from.clone()).chain(to.iter().map(|(t, _)| t.clone()))
            })
            .collect::<std::collections::BTreeSet<_>>();
        let repo = UsageTestRepo {
            edges: edges.into_iter().collect(),
        }
        .resolved_cell();
        let module = async |name: &RcStr| -> Result<ResolvedVc<Box<dyn Module>>> {
            Ok(ResolvedVc::upcast(
                UsageTestModule::new(root.clone(), name.clone(), *repo)
                    .to_resolved()
                    .await?,
            ))
        };

        let single_graph = SingleModuleGraph::new_with_entries(
            GraphEntries::resolved_cell(GraphEntries::new(
                vec![ChunkGroupEntry::Entry {
                    modules: vec![module(&rcstr!("entry")).await?],
                    heuristics: EntryHeuristics::default(),
                }],
                vec![],
            )),
            false,
            true,
        );
        let graph = ModuleGraph::from_graphs(vec![single_graph], None);
        let binding_usage = compute_binding_usage_info(graph, false).connect().await?;

        let escapes = names
            .iter()
            .map(async |name| {
                let usage = binding_usage
                    .used_exports(module(name).await?)
                    .await?
                    .await?;
                Ok((name.clone(), usage.namespace_object_may_escape))
            })
            .try_join()
            .await?;
        Ok(Vc::cell(escapes))
    }

    async fn namespace_escapes(
        namespace_path_is_longer: bool,
        plain_usage_is_all: bool,
    ) -> Vec<(RcStr, bool)> {
        namespace_escapes_with(namespace_path_is_longer, plain_usage_is_all, false, false).await
    }

    /// Like [`namespace_escapes`]. `namespace_members` makes the namespace read a nested member
    /// read (`ns.a.b`), and `namespace_reexport` routes it through an `export * as a` reexport
    /// (see [`namespace_reexport_graph`]).
    async fn namespace_escapes_with(
        namespace_path_is_longer: bool,
        plain_usage_is_all: bool,
        namespace_members: bool,
        namespace_reexport: bool,
    ) -> Vec<(RcStr, bool)> {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            let escapes = namespace_escapes_operation(
                namespace_path_is_longer,
                plain_usage_is_all,
                namespace_members,
                namespace_reexport,
            )
            .read_strongly_consistent()
            .await?;
            Ok((*escapes).clone())
        })
        .await
        .unwrap()
    }

    fn namespace_a() -> ExportUsage {
        ExportUsage::PartialNamespaceObject([rcstr!("a")].into_iter().collect())
    }

    /// `ns.a.b`: only member `b` of the namespace's export `a` is read.
    fn namespace_a_member_b() -> ExportUsage {
        ExportUsage::NamespaceMembers(BTreeMap::from([(
            rcstr!("a"),
            MemberUsage::Members(BTreeMap::from([(rcstr!("b"), MemberUsage::All)])),
        )]))
    }

    fn reexport_all() -> ExportUsage {
        // `export * from "y"`
        ExportUsage::Passthrough {
            namespace_object_may_escape: false,
        }
    }

    /// `x` is reached directly from `entry` and through `entry -> m1 -> m2 -> x`; `x -> y` is an
    /// `export *` passthrough edge.
    ///
    /// With the original constant-priority traversal, `namespace_path_is_longer` makes the plain
    /// edge reach `x` first. Reverse postorder instead processes all importers before `x` in a DAG.
    /// For nested namespace reads, add `x -> m1` to close a cycle so that `x` is processed before
    /// the late namespace edge even under reverse postorder. That edge adds provenance but no new
    /// export usage to `x`, so forwarding it to `y` requires a namespace-only revisit.
    fn namespace_graph(
        namespace_path_is_longer: bool,
        plain_usage: ExportUsage,
        namespace_usage: ExportUsage,
    ) -> Edges {
        let nested_namespace = matches!(&namespace_usage, ExportUsage::NamespaceMembers(_));
        let mut x_edges = vec![(rcstr!("y"), reexport_all())];
        if nested_namespace {
            // An evaluation-only back-edge creates the cycle without adding export usage or
            // namespace provenance to `m1`.
            x_edges.push((rcstr!("m1"), ExportUsage::Evaluation));
        }
        let (direct_usage, late_usage) = if namespace_path_is_longer {
            (plain_usage, namespace_usage)
        } else {
            (namespace_usage, plain_usage)
        };
        let mut entry_edges = vec![
            (rcstr!("x"), direct_usage),
            (rcstr!("m1"), ExportUsage::All),
        ];
        if nested_namespace {
            // The rank DFS visits references in reverse order; start at `x` so that the
            // namespace read `m2 -> x` is the cycle's back-edge, not `x -> m1`.
            entry_edges.reverse();
        }
        vec![
            (rcstr!("entry"), entry_edges),
            (rcstr!("m1"), vec![(rcstr!("m2"), ExportUsage::All)]),
            (rcstr!("m2"), vec![(rcstr!("x"), late_usage)]),
            (rcstr!("x"), x_edges),
        ]
    }

    /// Like [`namespace_graph`], but the namespace read of `x` goes through `r`, which reexports
    /// `x`'s namespace object as `a` (`export * as a from "x"`). `r` is reached from `entry`
    /// directly or through `entry -> m1 -> m2 -> r`. An evaluation-only `x -> m1` edge closes a
    /// cycle, forcing the longer namespace path to arrive after `x` was processed even under
    /// reverse postorder.
    fn namespace_reexport_graph(namespace_path_is_longer: bool, plain_usage: ExportUsage) -> Edges {
        let r_usage = ExportUsage::Named(rcstr!("a"));
        let (entry_edges, m2_edges) = if namespace_path_is_longer {
            (
                vec![(rcstr!("x"), plain_usage)],
                vec![(rcstr!("r"), r_usage)],
            )
        } else {
            (
                vec![(rcstr!("r"), r_usage)],
                vec![(rcstr!("x"), plain_usage)],
            )
        };
        vec![
            (
                rcstr!("entry"),
                // The rank DFS follows references in reverse order. Visit the direct path
                // first, so the longer path's final namespace edge is the back-edge.
                std::iter::once((rcstr!("m1"), ExportUsage::All))
                    .chain(entry_edges)
                    .collect(),
            ),
            (rcstr!("m1"), vec![(rcstr!("m2"), ExportUsage::All)]),
            (rcstr!("m2"), m2_edges),
            (
                rcstr!("r"),
                vec![(
                    rcstr!("x"),
                    ExportUsage::NamespaceReexport {
                        exports: [rcstr!("a")].into_iter().collect(),
                    },
                )],
            ),
            (
                rcstr!("x"),
                vec![
                    (rcstr!("y"), reexport_all()),
                    (rcstr!("m1"), ExportUsage::Evaluation),
                ],
            ),
        ]
    }

    fn expected_reexport_escapes() -> Vec<(RcStr, bool)> {
        vec![
            (rcstr!("entry"), false),
            (rcstr!("m1"), false),
            (rcstr!("m2"), false),
            (rcstr!("r"), false),
            (rcstr!("x"), true),
            (rcstr!("y"), true),
        ]
    }

    fn expected_escapes() -> Vec<(RcStr, bool)> {
        vec![
            (rcstr!("entry"), false),
            (rcstr!("m1"), false),
            (rcstr!("m2"), false),
            (rcstr!("x"), true),
            (rcstr!("y"), true),
        ]
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn late_namespace_usage_of_all_module_reaches_passthrough_target() {
        assert_eq!(namespace_escapes(true, true).await, expected_escapes());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn late_namespace_usage_of_already_used_name_reaches_passthrough_target() {
        assert_eq!(namespace_escapes(true, false).await, expected_escapes());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn early_namespace_usage_of_all_module_reaches_passthrough_target() {
        assert_eq!(namespace_escapes(false, true).await, expected_escapes());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn early_namespace_usage_of_already_used_name_reaches_passthrough_target() {
        assert_eq!(namespace_escapes(false, false).await, expected_escapes());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn late_namespace_member_usage_of_all_module_reaches_passthrough_target() {
        assert_eq!(
            namespace_escapes_with(true, true, true, false).await,
            expected_escapes()
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn late_namespace_member_usage_of_already_used_name_reaches_passthrough_target() {
        assert_eq!(
            namespace_escapes_with(true, false, true, false).await,
            expected_escapes()
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn late_namespace_reexport_of_all_module_reaches_passthrough_target() {
        assert_eq!(
            namespace_escapes_with(true, true, false, true).await,
            expected_reexport_escapes()
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn early_namespace_reexport_of_all_module_reaches_passthrough_target() {
        assert_eq!(
            namespace_escapes_with(false, true, false, true).await,
            expected_reexport_escapes()
        );
    }
}
