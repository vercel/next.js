use std::collections::hash_map::Entry;

use anyhow::{Context, Result, bail};
use auto_hash_map::AutoSet;
use bincode::{Decode, Encode};
use rustc_hash::{FxHashMap, FxHashSet};
use tracing::Instrument;
use turbo_frozenmap::FrozenMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{JoinIterExt, NonLocalValue, OperationVc, ReadRef, ResolvedVc, Vc};

use crate::{
    chunk::chunking_context::UnusedReferences,
    module::{ExportBinding, ExportBindings, Module},
    module_graph::{
        GraphEdgeIndex, GraphTraversalAction, ModuleGraph,
        side_effect_module_info::compute_side_effect_free_module_info,
    },
    reference::ModuleReference,
    resolve::{ExportUsage, ImportUsage},
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

/// A used export whose value can be read once into a local, instead of through the exporting
/// module's namespace at every use.
#[derive(Clone, Hash, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub struct CapturableExport {
    /// The module that declares the binding, after following re-exports.
    pub origin_module: ResolvedVc<Box<dyn Module>>,
    /// The name `origin_module` exports the binding under.
    pub origin_export: RcStr,
    /// Whether calling the value could observe the receiver it is called with.
    pub maybe_uses_this: bool,
}

/// The [`CapturableExport`]s of one module, by the name that module exports them under.
#[turbo_tasks::value(transparent)]
pub struct CapturableExports(FrozenMap<RcStr, CapturableExport>);

#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct CapturableExportsMap(
    FxHashMap<ResolvedVc<Box<dyn Module>>, FrozenMap<RcStr, CapturableExport>>,
);

#[turbo_tasks::value]
#[derive(Clone, Default, Debug)]
pub struct BindingUsageInfo {
    unused_references: ResolvedVc<UnusedReferences>,
    unused_references_edges: FxHashSet<GraphEdgeIndex>,

    used_exports: ResolvedVc<UsedExportsMap>,
    export_circuit_breakers: ResolvedVc<ExportCircuitBreakers>,
    partial_namespace_modules: ResolvedVc<PartialNamespaceModules>,
    capturable_exports: ResolvedVc<CapturableExportsMap>,
}

/// Where each used reference leads. `None` when a reference leads to more than one module.
type ReferenceTargets =
    FxHashMap<ResolvedVc<Box<dyn ModuleReference>>, Option<ResolvedVc<Box<dyn Module>>>>;

/// What following an export through its re-exports found.
#[derive(Clone)]
enum Resolution {
    /// The module does not export the name at all.
    NotExported,
    /// The export ends at something that cannot be captured: a binding that can be reassigned, a
    /// namespace, a module that doesn't describe its exports, or a cycle of re-exports.
    Opaque,
    Capturable(CapturableExport),
}

/// Follows exports through re-exports to the binding that declares them, across the whole graph.
///
/// This runs inside [`compute_binding_usage_info`] as plain code rather than as turbo tasks, so a
/// cycle of re-exports is caught here rather than becoming a cycle between tasks.
struct ExportResolver<'a> {
    export_bindings: &'a FxHashMap<ResolvedVc<Box<dyn Module>>, ReadRef<ExportBindings>>,
    reference_targets: &'a ReferenceTargets,
    resolved: FxHashMap<(ResolvedVc<Box<dyn Module>>, RcStr), Resolution>,
}

impl ExportResolver<'_> {
    fn resolve(&mut self, module: ResolvedVc<Box<dyn Module>>, name: &RcStr) -> Resolution {
        let key = (module, name.clone());
        if let Some(resolution) = self.resolved.get(&key) {
            return resolution.clone();
        }
        // Seen again before this lookup finishes means a cycle of re-exports, which is opaque.
        self.resolved.insert(key.clone(), Resolution::Opaque);
        let resolution = self.resolve_uncached(module, name);
        self.resolved.insert(key, resolution.clone());
        resolution
    }

    fn resolve_uncached(
        &mut self,
        module: ResolvedVc<Box<dyn Module>>,
        name: &RcStr,
    ) -> Resolution {
        let Some(bindings) = self.export_bindings.get(&module) else {
            return Resolution::Opaque;
        };
        match bindings.exports.get(name) {
            Some(ExportBinding::Local {
                is_constant: true,
                maybe_uses_this,
            }) => Resolution::Capturable(CapturableExport {
                origin_module: module,
                origin_export: name.clone(),
                maybe_uses_this: *maybe_uses_this,
            }),
            Some(ExportBinding::Local { .. } | ExportBinding::Opaque) => Resolution::Opaque,
            Some(ExportBinding::Reexport {
                reference,
                name: forwarded,
            }) => match self.target(*reference) {
                Some(target) => self.resolve(target, forwarded),
                None => Resolution::Opaque,
            },
            // `export *` never forwards `default`.
            None if name == "default" => Resolution::NotExported,
            None => {
                // The first `export *` that exports the name wins.
                for star_reference in &bindings.star_reexports {
                    let Some(target) = self.target(*star_reference) else {
                        // It might have been the one to export the name.
                        return Resolution::Opaque;
                    };
                    match self.resolve(target, name) {
                        Resolution::NotExported => continue,
                        resolution => return resolution,
                    }
                }
                Resolution::NotExported
            }
        }
    }

    /// Every name `module` exports, including through `export *`.
    fn exported_names(&self, module: ResolvedVc<Box<dyn Module>>) -> FxHashSet<RcStr> {
        let mut names = FxHashSet::default();
        let mut visited = FxHashSet::default();
        let mut queue = vec![(module, true)];
        while let Some((module, include_default)) = queue.pop() {
            if !visited.insert(module) {
                continue;
            }
            let Some(bindings) = self.export_bindings.get(&module) else {
                continue;
            };
            names.extend(
                bindings
                    .exports
                    .keys()
                    .filter(|name| include_default || *name != "default")
                    .cloned(),
            );
            queue.extend(
                bindings
                    .star_reexports
                    .iter()
                    .filter_map(|reference| self.target(*reference))
                    .map(|target| (target, false)),
            );
        }
        names
    }

    fn target(
        &self,
        reference: ResolvedVc<Box<dyn ModuleReference>>,
    ) -> Option<ResolvedVc<Box<dyn Module>>> {
        self.reference_targets.get(&reference).copied().flatten()
    }
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
    /// The used exports of this module whose value can be captured, found by following re-exports
    /// to the binding each one forwards. Empty when export usage analysis did not run.
    pub capturable_exports: ResolvedVc<CapturableExports>,
}
#[turbo_tasks::value_impl]
impl ModuleExportUsage {
    #[turbo_tasks::function]
    pub async fn unknown() -> Result<Vc<Self>> {
        Ok(Self {
            export_usage: ModuleExportUsageInfo::all().to_resolved().await?,
            is_circuit_breaker: true,
            namespace_object_may_escape: true,
            capturable_exports: ResolvedVc::cell(FrozenMap::default()),
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
        let capturable_exports = self
            .capturable_exports
            .get(&module)
            .await?
            .map(|exports| (*exports).clone())
            .unwrap_or_default();
        Ok(ModuleExportUsage {
            export_usage: (*exports).clone().resolved_cell(),
            is_circuit_breaker,
            namespace_object_may_escape,
            capturable_exports: ResolvedVc::cell(capturable_exports),
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
        // Recorded as the traversal goes, so re-exports can be followed below.
        let mut reference_targets = ReferenceTargets::default();

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

                match reference_targets.entry(ref_data.reference) {
                    Entry::Vacant(entry) => {
                        entry.insert(Some(target));
                    }
                    Entry::Occupied(mut entry) => {
                        if *entry.get() != Some(target) {
                            entry.insert(None);
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

        let export_bindings = used_exports
            .iter()
            .filter(|(_, usage)| !matches!(usage, ModuleExportUsageInfo::Evaluation))
            .map(async |(module, _)| Ok((*module, module.export_bindings().await?)))
            .join()
            .await
            .into_iter()
            .collect::<Result<FxHashMap<_, _>>>()?;
        let capturable_exports = {
            let mut resolver = ExportResolver {
                export_bindings: &export_bindings,
                reference_targets: &reference_targets,
                resolved: FxHashMap::default(),
            };
            used_exports
                .iter()
                .filter_map(|(module, usage)| {
                    let names = match usage {
                        ModuleExportUsageInfo::Evaluation => return None,
                        ModuleExportUsageInfo::Exports(names) => names.iter().cloned().collect(),
                        ModuleExportUsageInfo::All => resolver.exported_names(*module),
                    };
                    let capturable = names
                        .into_iter()
                        .filter_map(|name| {
                            let Resolution::Capturable(export) = resolver.resolve(*module, &name)
                            else {
                                return None;
                            };
                            Some((name, export))
                        })
                        .collect::<Vec<_>>();
                    (!capturable.is_empty()).then(|| (*module, FrozenMap::from(capturable)))
                })
                .collect::<FxHashMap<_, _>>()
        };

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
            capturable_exports: ResolvedVc::cell(capturable_exports),
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
