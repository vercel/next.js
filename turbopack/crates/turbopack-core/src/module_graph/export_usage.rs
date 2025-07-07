//! Intermediate tree shaking that uses global information but not good as the full tree shaking.

use anyhow::Result;
use auto_hash_map::AutoSet;
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{module::Module, module_graph::ModuleGraph, resolve::ExportUsage};

#[turbo_tasks::function(operation)]
pub async fn compute_export_usage_info(
    graph: ResolvedVc<ModuleGraph>,
) -> Result<Vc<ExportUsageInfo>> {
    let mut used_exports = FxHashMap::<_, ModuleExportUsageInfo>::default();

    graph
        .await?
        .traverse_all_edges_unordered(|(_, ref_data), target| {
            if let Some(target_module) = ResolvedVc::try_downcast::<Box<dyn Module>>(target.module)
            {
                let e = used_exports.entry(target_module).or_default();

                e.add(&ref_data.export);
            }

            Ok(())
        })
        .await?;

    Ok(ExportUsageInfo { used_exports }.cell())
}

#[turbo_tasks::value(transparent)]
pub struct OptionExportUsageInfo(Option<ResolvedVc<ExportUsageInfo>>);

#[turbo_tasks::value]
pub struct ExportUsageInfo {
    used_exports: FxHashMap<ResolvedVc<Box<dyn Module>>, ModuleExportUsageInfo>,
}

impl ExportUsageInfo {
    pub fn used_exports(&self, module: ResolvedVc<Box<dyn Module>>) -> Vc<ModuleExportUsageInfo> {
        if let Some(exports) = self.used_exports.get(&module) {
            exports.clone().cell()
        } else {
            // We exclude template files from tree shaking because they are entrypoints to the
            // module graph.
            ModuleExportUsageInfo::all()
        }
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
