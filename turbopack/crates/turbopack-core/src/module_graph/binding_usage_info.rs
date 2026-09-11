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
    resolve::{ExportUsage, ForwardedExportUsage, ImportUsage, TargetExportUsage},
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

#[turbo_tasks::value]
#[derive(Clone, Default, Debug)]
pub struct BindingUsageInfo {
    unused_references: ResolvedVc<UnusedReferences>,
    #[turbo_tasks(trace_ignore)]
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
    // Whether this module exists in an import cycle and has been selected to break the cycle.
    pub is_circuit_breaker: bool,
    /// Whether this module is read through a namespace value somewhere, which means one of those
    /// reads may still use an original export name. See [`PartialNamespaceModules`].
    pub namespace_object_may_escape: bool,
}
#[turbo_tasks::value_impl]
impl ModuleExportUsage {
    #[turbo_tasks::function]
    pub async fn all() -> Result<Vc<Self>> {
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
            // There are some module that are codegened, but not referenced in the module graph,
            let ident = module.ident_string().await?;
            if ident.contains(".wasm_.loader.mjs") || ident.contains("/__nextjs-internal-proxy.") {
                // Both the turbopack-wasm `ModuleChunkItem` and `EcmascriptClientReferenceModule`
                // do `self.slightly_different_module().as_chunk_item()`, so the
                // module that codegen sees isn't actually in the module graph.
                // TODO fix these cases
                return Ok(ModuleExportUsage::all());
            }

            bail!("export usage not found for module: {ident:?}");
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
            TargetExportUsage,
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
                    if matches!(
                        &ref_data.binding_usage.export,
                        TargetExportUsage::Fixed(ExportUsage::Evaluation)
                    ) && side_effect_free_modules
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

                // Whole-namespace re-exports (`module.exports = require(x)`, `export * from x`)
                // forward both the parent's used export keys and, independently, whether those
                // keys may still be observed through a namespace object.
                let forwarded = match &ref_data.binding_usage.export {
                    TargetExportUsage::Fixed(_) => None,
                    TargetExportUsage::Forwarded(_) => Some(
                        used_exports
                            .get(&parent)
                            .context("parent module must have usage info")?
                            .clone(),
                    ),
                };

                let namespace_changed = match &ref_data.binding_usage.export {
                    TargetExportUsage::Fixed(ExportUsage::PartialNamespaceObject(_)) => {
                        partial_namespace_modules.insert(target)
                    }
                    // A forwarded CommonJS namespace exposes the target's properties by their
                    // original names, so those names always stay observable.
                    TargetExportUsage::Forwarded(ForwardedExportUsage::NamespaceObject) => {
                        partial_namespace_modules.insert(target)
                    }
                    // An ESM re-export only propagates the escape the parent already had.
                    TargetExportUsage::Forwarded(ForwardedExportUsage::Exports)
                        if partial_namespace_modules.contains(&parent) =>
                    {
                        partial_namespace_modules.insert(target)
                    }
                    _ => false,
                };

                let entry = used_exports.entry(target);
                let is_first_visit = matches!(entry, Entry::Vacant(_));
                let usage_changed = match &ref_data.binding_usage.export {
                    TargetExportUsage::Fixed(export) => entry.or_default().add(export),
                    TargetExportUsage::Forwarded(_) => entry
                        .or_default()
                        .add_module_usage(forwarded.as_ref().expect("forwarded usage is present")),
                };
                if usage_changed || namespace_changed || is_first_visit {
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
        }
    }

    /// Merge another module's accumulated export keys into this module.
    ///
    /// Namespace-object provenance is tracked separately by [`PartialNamespaceModules`]; an
    /// accumulated multi-key set does not imply that those names were read from a namespace.
    fn add_module_usage(&mut self, usage: &Self) -> bool {
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
    use super::*;

    fn exports(names: &[&str]) -> ModuleExportUsageInfo {
        ModuleExportUsageInfo::Exports(names.iter().map(|name| RcStr::from(*name)).collect())
    }

    #[test]
    fn merge_forwarded_module_usage() {
        let mut usage = ModuleExportUsageInfo::Evaluation;

        assert!(!usage.add_module_usage(&ModuleExportUsageInfo::Evaluation));
        assert!(usage.add_module_usage(&exports(&["first"])));
        assert!(usage.is_export_used(&RcStr::from("first")));
        assert!(!usage.add_module_usage(&exports(&["first"])));
        assert!(usage.add_module_usage(&exports(&["second"])));
        assert!(usage.is_export_used(&RcStr::from("second")));
        assert!(!usage.add_module_usage(&ModuleExportUsageInfo::Evaluation));
        assert!(usage.add_module_usage(&ModuleExportUsageInfo::All));
        assert!(!usage.add_module_usage(&exports(&["third"])));
        assert!(matches!(usage, ModuleExportUsageInfo::All));
    }
}
