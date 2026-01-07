use std::collections::hash_map::Entry;

use anyhow::{Context, Result, bail};
use auto_hash_map::AutoSet;
use rustc_hash::{FxHashMap, FxHashSet};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{
    module::Module,
    module_graph::{GraphEdgeIndex, GraphTraversalAction, ModuleGraph},
    reference::ModuleReference,
    resolve::{ExportUsage, ImportUsage},
};

#[turbo_tasks::value]
#[derive(Clone, Default, Debug)]
pub struct BindingUsageInfo {
    unused_references: FxHashSet<ResolvedVc<Box<dyn ModuleReference>>>,
    #[turbo_tasks(trace_ignore)]
    unused_references_edges: FxHashSet<GraphEdgeIndex>,

    used_exports: FxHashMap<ResolvedVc<Box<dyn Module>>, ModuleExportUsageInfo>,
    export_circuit_breakers: FxHashSet<ResolvedVc<Box<dyn Module>>>,
}

#[turbo_tasks::value(transparent)]
pub struct OptionBindingUsageInfo(Option<ResolvedVc<BindingUsageInfo>>);

#[turbo_tasks::value]
pub struct ModuleExportUsage {
    pub export_usage: ResolvedVc<ModuleExportUsageInfo>,
    // Whether this module exists in an import cycle and has been selected to break the cycle.
    pub is_circuit_breaker: bool,
}
#[turbo_tasks::value_impl]
impl ModuleExportUsage {
    #[turbo_tasks::function]
    pub async fn all() -> Result<Vc<Self>> {
        Ok(Self {
            export_usage: ModuleExportUsageInfo::all().to_resolved().await?,
            is_circuit_breaker: true,
        }
        .cell())
    }
}

impl BindingUsageInfo {
    pub fn is_reference_unused_edge(&self, edge: &GraphEdgeIndex) -> bool {
        self.unused_references_edges.contains(edge)
    }

    pub fn is_reference_unused(&self, reference: &ResolvedVc<Box<dyn ModuleReference>>) -> bool {
        self.unused_references.contains(reference)
    }

    pub async fn used_exports(
        &self,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<ModuleExportUsage>> {
        let is_circuit_breaker = self.export_circuit_breakers.contains(&module);
        let Some(exports) = self.used_exports.get(&module) else {
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
        Ok(ModuleExportUsage {
            export_usage: exports.clone().resolved_cell(),
            is_circuit_breaker,
        }
        .cell())
    }
}

#[turbo_tasks::function(operation)]
pub async fn compute_binding_usage_info(
    graph: ResolvedVc<ModuleGraph>,
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
        #[cfg(debug_assertions)]
        let mut debug_unused_references_name = FxHashSet::<(
            ResolvedVc<Box<dyn Module>>,
            ExportUsage,
            ResolvedVc<Box<dyn Module>>,
        )>::default();
        let mut unused_references_edges = FxHashSet::default();
        let mut unused_references = FxHashSet::default();

        if graph.await?.binding_usage.is_some() {
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

        let graph = graph.read_graphs().await?;

        let entries = graph.graphs.iter().flat_map(|g| g.entry_modules());

        let visit_count = graph.traverse_edges_fixed_point_with_priority(
            entries.map(|m| (m, 0)),
            &mut (),
            |parent, target, _| {
                // Entries are always used
                let Some((parent, ref_data, edge)) = parent else {
                    used_exports.insert(target, ModuleExportUsageInfo::All);
                    return Ok(GraphTraversalAction::Continue);
                };

                if remove_unused_imports {
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
                                #[cfg(debug_assertions)]
                                debug_unused_references_name.insert((
                                    parent,
                                    ref_data.binding_usage.export.clone(),
                                    target,
                                ));
                                unused_references_edges.insert(edge);
                                unused_references.insert(ref_data.reference);

                                return Ok(GraphTraversalAction::Skip);
                            } else {
                                #[cfg(debug_assertions)]
                                debug_unused_references_name.remove(&(
                                    parent,
                                    ref_data.binding_usage.export.clone(),
                                    target,
                                ));
                                unused_references_edges.remove(&edge);
                                unused_references.remove(&ref_data.reference);
                                // Continue, add export
                            }
                        }
                        ImportUsage::SideEffects => {
                            #[cfg(debug_assertions)]
                            debug_unused_references_name.remove(&(
                                parent,
                                ref_data.binding_usage.export.clone(),
                                target,
                            ));
                            unused_references_edges.remove(&edge);
                            unused_references.remove(&ref_data.reference);
                            // Continue, has to always be included
                        }
                    }
                }

                let entry = used_exports.entry(target);
                let is_first_visit = matches!(entry, Entry::Vacant(_));
                if entry.or_default().add(&ref_data.binding_usage.export) || is_first_visit {
                    // First visit, or the used exports changed. This can cause more imports to get
                    // used downstream.
                    Ok(GraphTraversalAction::Continue)
                } else {
                    Ok(GraphTraversalAction::Skip)
                }
            },
            |_, _| Ok(0),
        )?;

        // Compute cycles and select modules to be 'circuit breakers'
        // A circuit breaker module will need to eagerly export lazy getters for its exports to
        // break an evaluation cycle all other modules can export values after defining them
        let mut export_circuit_breakers = FxHashSet::default();
        graph.traverse_cycles(
            |e| e.chunking_type.is_parallel(),
            |cycle| {
                // To break cycles we need to ensure that no importing module can observe a
                // partially populated exports object.

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
            use once_cell::sync::Lazy;
            static PRINT_UNUSED_REFERENCES: Lazy<bool> = Lazy::new(|| {
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
        }

        Ok(BindingUsageInfo {
            unused_references,
            unused_references_edges,
            used_exports,
            export_circuit_breakers,
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
            (Self::Exports(l), ExportUsage::Named(r)) => {
                // Merge exports
                l.insert(r.clone())
            }
            (_, ExportUsage::Evaluation) => false,
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
