//! Intermediate tree shaking that uses global information but not good as the full tree shaking.

use anyhow::{Context, Result};
use auto_hash_map::AutoSet;
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{module_graph::ModuleGraph, resolve::ExportUsage};

use crate::chunk::EcmascriptChunkPlaceable;

#[turbo_tasks::function]
pub async fn get_module_export_usages(
    graph: ResolvedVc<ModuleGraph>,
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<Vc<ModuleExportUsageInfo>> {
    let export_usage_info = compute_export_usage_info(graph)
        .resolve_strongly_consistent()
        .await?;

    let export_usage_info = export_usage_info.await?;

    let Some(exports) = export_usage_info.used_exports.get(&module) else {
        // We exclude template files from tree shaking because they are entrypoints to the module
        // graph.
        return Ok(ModuleExportUsageInfo::All.cell());
    };

    Ok(exports.clone().cell())
}

#[turbo_tasks::function(operation)]
async fn compute_export_usage_info(graph: ResolvedVc<ModuleGraph>) -> Result<Vc<ExportUsageInfo>> {
    let mut used_exports = FxHashMap::<_, ModuleExportUsageInfo>::default();

    graph
        .await?
        .traverse_all_edges_unordered(|(_, ref_data), target| {
            if let Some(target_module) =
                ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(target.module)
            {
                let e = used_exports.entry(target_module).or_default();

                e.add(&ref_data.export);
            }

            Ok(())
        })
        .await
        .context("failed to traverse module graph")?;

    Ok(ExportUsageInfo { used_exports }.cell())
}

#[turbo_tasks::value]
#[derive(Default)]
pub struct ExportUsageInfo {
    used_exports: FxHashMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, ModuleExportUsageInfo>,
}

#[turbo_tasks::value]
#[derive(Default, Clone)]
pub enum ModuleExportUsageInfo {
    All,
    #[default]
    Evaluation,
    Exports(AutoSet<RcStr>),
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
