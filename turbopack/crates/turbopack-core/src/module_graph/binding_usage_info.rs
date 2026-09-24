use std::collections::hash_map::Entry;

use anyhow::{Context, Result, bail};
use auto_hash_map::AutoSet;
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
    resolve::{ExportUsage, ImportUsage},
};

/// Diagnostics only: set `TURBOPACK_PRINT_CYCLE_STATS=1` to print per-build cycle statistics.
/// Available in release builds so it can be measured on real applications.
static PRINT_CYCLE_STATS: std::sync::LazyLock<bool> = std::sync::LazyLock::new(|| {
    std::env::var_os("TURBOPACK_PRINT_CYCLE_STATS").is_some_and(|v| v == "1" || v == "true")
});

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

#[turbo_tasks::value]
#[derive(Clone, Default, Debug)]
pub struct BindingUsageInfo {
    unused_references: ResolvedVc<UnusedReferences>,
    unused_references_edges: FxHashSet<GraphEdgeIndex>,

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
    pub fn is_reference_unused_edge(&self, edge: &GraphEdgeIndex) -> bool {
        self.unused_references_edges.contains(edge)
    }

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
        if graph_ref.binding_usage.is_some() {
            // If the graph already has binding usage info, return it directly. This is
            // unfortunately easy to do with
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

        let entries = graph_ref.all_chunk_group_entry_modules();

        let visit_count = graph_ref.traverse_edges_fixed_point_with_priority(
            entries.map(|m| (m, 0)),
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
                        let passthrough_usage = used_exports
                            .get(&parent)
                            .context("parent module must have usage info")?
                            .clone();
                        let usage_changed = used_exports
                            .entry(target)
                            .or_default()
                            .add_usage_info(&passthrough_usage);
                        namespace_changed || usage_changed
                    }
                    export_usage => {
                        if matches!(export_usage, ExportUsage::PartialNamespaceObject(_)) {
                            // `target` is read through a namespace value. We know which names are
                            // used, but not that every read was lowered to a direct named access.
                            partial_namespace_modules.insert(target);
                        }
                        used_exports.entry(target).or_default().add(export_usage)
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
            |_, _| Ok(0),
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

        // Diagnostics only, enabled with `TURBOPACK_PRINT_CYCLE_STATS=1`. Measures how much each
        // of the two `partially_observable` clauses contributes, to judge whether pruning the
        // entry set with real chunk-group reachability would pay for itself.
        let mut cycle_stats: Vec<(usize, usize, usize, usize)> = Vec::new();
        // The members of each cycle, so the biggest ones can be printed by name.
        #[allow(clippy::type_complexity)]
        let mut cycle_members: Vec<(
            Vec<ResolvedVc<Box<dyn Module>>>,
            FxHashSet<ResolvedVc<Box<dyn Module>>>,
            FxHashSet<ResolvedVc<Box<dyn Module>>>,
        )> = Vec::new();

        graph_ref.traverse_cycles(
            // No need to traverse edges that are unused.
            |e| e.chunking_type.is_parallel() && !unused_references.contains_key(&e.reference),
            |cycle| {
                // Only the modules that can be read before they finish evaluating need to break
                // the cycle. The rest are fully evaluated by the time anything reads them, so they
                // can keep exporting values instead of getters.
                export_circuit_breakers.extend(cycle.partially_observable.iter().map(|n| **n));
                if *PRINT_CYCLE_STATS {
                    // Modules that only the back-edge clause caught, i.e. what would survive even
                    // if the entry set were pruned to nothing.
                    let entry_set = cycle.entry_observable.iter().collect::<FxHashSet<_>>();
                    let back_edge_only = cycle
                        .back_edge_observable
                        .iter()
                        .filter(|m| !entry_set.contains(*m))
                        .count();
                    cycle_stats.push((
                        cycle.modules.len(),
                        cycle.partially_observable.len(),
                        cycle.entry_observable.len(),
                        back_edge_only,
                    ));
                    cycle_members.push((
                        cycle.modules.iter().map(|m| **m).collect(),
                        cycle.back_edge_observable.iter().map(|m| **m).collect(),
                        cycle.entry_observable.iter().map(|m| **m).collect(),
                    ));
                }
                Ok(())
            },
        )?;

        if *PRINT_CYCLE_STATS && !cycle_stats.is_empty() {
            use turbo_tasks::TryJoinIterExt;
            let multi = cycle_stats.iter().filter(|s| s.0 > 1).count();
            let multi_entry = cycle_stats.iter().filter(|s| s.0 > 1 && s.2 > 1).count();
            let largest = cycle_stats.iter().map(|s| s.0).max().unwrap_or(0);
            let total_modules: usize = cycle_stats.iter().map(|s| s.0).sum();
            let total_observable: usize = cycle_stats.iter().map(|s| s.1).sum();
            let total_entry: usize = cycle_stats.iter().map(|s| s.2).sum();
            let total_back_edge_only: usize = cycle_stats.iter().map(|s| s.3).sum();
            println!(
                "CYCLE_STATS cycles={} multi_member={} multi_entry={} largest={}                  cycle_modules={} observable={} entry_clause={} back_edge_only={}",
                cycle_stats.len(),
                multi,
                multi_entry,
                largest,
                total_modules,
                total_observable,
                total_entry,
                total_back_edge_only,
            );
            // Per-cycle detail for the biggest cycles, where pruning would matter most.
            let mut by_size = cycle_stats.clone();
            by_size.sort_by_key(|s| std::cmp::Reverse(s.0));
            for (size, observable, entry, back_edge_only) in by_size.iter().take(15) {
                if *size > 1 {
                    println!(
                        "CYCLE_DETAIL size={size} observable={observable} entry={entry}                          back_edge_only={back_edge_only}"
                    );
                }
            }

            // Name every member of the largest cycles, to inspect what they actually consist of.
            let dump_count: usize = std::env::var("TURBOPACK_DUMP_CYCLES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1);
            let mut order: Vec<usize> = (0..cycle_stats.len()).collect();
            order.sort_by_key(|&i| std::cmp::Reverse(cycle_stats[i].0));
            for (rank, &i) in order.iter().take(dump_count).enumerate() {
                let (members, back_edge_set, entry_set) = &cycle_members[i];
                if members.len() < 2 {
                    continue;
                }
                println!(
                    "CYCLE_DUMP_BEGIN rank={rank} size={} observable={} entry={} back_edge_only={}",
                    cycle_stats[i].0, cycle_stats[i].1, cycle_stats[i].2, cycle_stats[i].3
                );
                let named = members
                    .iter()
                    .map(async |m| {
                        let name = m.ident_string().await?;
                        let is_back = back_edge_set.contains(m);
                        let is_entry = entry_set.contains(m);
                        Ok((name.to_string(), is_back, is_entry))
                    })
                    .try_join()
                    .await?;
                let mut named = named;
                named.sort();
                for (name, is_back, is_entry) in named {
                    let tag = match (is_back, is_entry) {
                        (true, true) => "BACK+ENTRY",
                        (true, false) => "BACK      ",
                        (false, true) => "ENTRY     ",
                        (false, false) => "-         ",
                    };
                    println!("CYCLE_MEMBER {tag} {name}");
                }
                println!("CYCLE_DUMP_END rank={rank}");
            }
        }

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
            unused_references_edges,
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
    Exports(AutoSet<RcStr>),
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
        match (&mut *self, usage) {
            (Self::All, _) => false,
            (_, ExportUsage::All) => {
                *self = Self::All;
                true
            }
            (Self::Evaluation, ExportUsage::Named(name)) => {
                // Promote evaluation to something more specific
                *self = Self::Exports(AutoSet::from_iter([name.clone()]));
                true
            }
            (Self::Evaluation, ExportUsage::PartialNamespaceObject(names)) => {
                *self = Self::Exports(AutoSet::from_iter(names.iter().cloned()));
                true
            }
            (Self::Exports(l), ExportUsage::Named(r)) => {
                // Merge exports
                l.insert(r.clone())
            }
            (Self::Exports(l), ExportUsage::PartialNamespaceObject(names)) => {
                let mut changed = false;
                for name in names {
                    changed |= l.insert(name.clone());
                }
                changed
            }
            (_, ExportUsage::Evaluation) => false,
            (_, ExportUsage::Passthrough { .. }) => {
                // Passthrough is normally resolved before `add`. If it reaches this fallback,
                // preserve correctness by widening rather than panicking during graph analysis.
                *self = Self::All;
                true
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
            (Self::Exports(left), Self::Exports(right)) => {
                let mut changed = false;
                for export in right {
                    changed |= left.insert(export.clone());
                }
                changed
            }
        }
    }

    pub fn is_export_used(&self, export: &RcStr) -> bool {
        match self {
            Self::All => true,
            Self::Evaluation => false,
            Self::Exports(exports) => exports.contains(export),
        }
    }
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;

    use super::ModuleExportUsageInfo;
    use crate::resolve::ExportUsage;

    #[test]
    fn resolved_usage_join_is_monotonic() {
        let mut usage = ModuleExportUsageInfo::Evaluation;
        let first = ModuleExportUsageInfo::Exports([rcstr!("first")].into_iter().collect());
        let second = ModuleExportUsageInfo::Exports([rcstr!("second")].into_iter().collect());

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
}
