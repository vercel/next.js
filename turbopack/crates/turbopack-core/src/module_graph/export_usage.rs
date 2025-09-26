//! Intermediate tree shaking that uses global information but not good as the full tree shaking.

use anyhow::Result;
use auto_hash_map::AutoSet;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{module::Module, module_graph::ModuleGraph, resolve::ExportUsage};

#[turbo_tasks::function(operation)]
pub async fn compute_export_usage_info(
    graph: ResolvedVc<ModuleGraph>,
) -> Result<Vc<ExportUsageInfo>> {
    let mut used_exports = FxHashMap::<_, ModuleExportUsageInfo>::default();
    let graph = graph.read_graphs().await?;
    graph.traverse_all_edges_unordered(|(_, ref_data), target| {
        let e = used_exports.entry(target.module).or_default();

        e.add(&ref_data.export);

        Ok(())
    })?;

    // Compute cycles and select modules to be 'circuit breakers'
    // A circuit breaker module will need to eagerly export lazy getters for its exports to break an
    // evaluation cycle all other modules can export values after defining them
    let mut circuit_breakers = FxHashSet::default();
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
            circuit_breakers.extend(cycle.iter().map(|n| n.module));
        },
    )?;

    Ok(ExportUsageInfo {
        used_exports,
        circuit_breakers,
    }
    .cell())
}

#[turbo_tasks::value(transparent)]
pub struct OptionExportUsageInfo(Option<ResolvedVc<ExportUsageInfo>>);

#[turbo_tasks::value]
pub struct ExportUsageInfo {
    used_exports: FxHashMap<ResolvedVc<Box<dyn Module>>, ModuleExportUsageInfo>,
    circuit_breakers: FxHashSet<ResolvedVc<Box<dyn Module>>>,
}

#[turbo_tasks::value(shared)]
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

impl ExportUsageInfo {
    pub async fn used_exports(
        &self,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<ModuleExportUsage>> {
        let is_circuit_breaker = self.circuit_breakers.contains(&module);
        let export_usage = if let Some(exports) = self.used_exports.get(&module) {
            exports.clone().resolved_cell()
        } else {
            // We exclude template files from tree shaking because they are entrypoints to the
            // module graph.
            ModuleExportUsageInfo::all().to_resolved().await?
        };
        Ok(ModuleExportUsage {
            export_usage,
            is_circuit_breaker,
        }
        .cell())
    }
}

#[turbo_tasks::value]
#[derive(Default, Clone)]
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
    fn add(&mut self, usage: &ExportUsage) {
        match (&mut *self, usage) {
            (Self::All, _) => {}
            (_, ExportUsage::All) => {
                *self = Self::All;
            }
            (Self::Evaluation, ExportUsage::Named(name)) => {
                // Promote evaluation to something more specific
                *self = Self::Exports(AutoSet::from_iter([name.clone()]));
            }

            (Self::Exports(l), ExportUsage::Named(r)) => {
                // Merge exports
                l.insert(r.clone());
            }

            (_, ExportUsage::Evaluation) => {
                // Ignore evaluation
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
