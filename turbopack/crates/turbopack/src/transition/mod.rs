pub(crate) mod full_context_transition;

use anyhow::Result;
pub use full_context_transition::FullContextTransition;
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueDefault, Vc};
use turbopack_core::{
    context::ProcessResult, module::Module, reference_type::ReferenceType, source::Source,
};

use crate::{ModuleAssetContext, module_options::transition_rule::TransitionRule};

/// Some kind of operation that is executed during reference processing. e. g.
/// you can transition to a different environment on a specific import
/// (reference).
#[turbo_tasks::value_trait]
pub trait Transition {
    /// Apply modifications/wrapping to the final asset
    #[turbo_tasks::function]
    fn process_module(
        self: Vc<Self>,
        module: Vc<Box<dyn Module>>,
        _context: Vc<ModuleAssetContext>,
    ) -> Vc<Box<dyn Module>> {
        module
    }

    /// Apply modifications to the context
    #[turbo_tasks::function]
    async fn process_context(
        self: Vc<Self>,
        module_asset_context: Vc<ModuleAssetContext>,
    ) -> Result<Vc<ModuleAssetContext>> {
        let module_asset_context = module_asset_context.await?;
        let module_asset_context = ModuleAssetContext::new(
            *module_asset_context.transitions,
            *module_asset_context.compile_time_info,
            *module_asset_context.module_options_context,
            *module_asset_context.resolve_options_context,
            module_asset_context.layer.clone(),
        );
        Ok(module_asset_context)
    }

    /// Apply modification on the processing of the asset
    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        reference_type: ReferenceType,
    ) -> Result<Vc<ProcessResult>> {
        let module_asset_context = self.process_context(module_asset_context);
        let source = source.to_resolved().await?;

        Ok(match &*module_asset_context
            .process_default(source, reference_type)
            .await?
            .await?
        {
            ProcessResult::Module(m) => ProcessResult::Module(
                self.process_module(**m, module_asset_context)
                    .to_resolved()
                    .await?,
            ),
            ProcessResult::Unknown(source) => ProcessResult::Unknown(*source),
            ProcessResult::Ignore => ProcessResult::Ignore,
        }
        .cell())
    }
}

#[turbo_tasks::value(shared)]
#[derive(Default)]
pub struct TransitionOptions {
    pub named_transitions: FxHashMap<RcStr, ResolvedVc<Box<dyn Transition>>>,
    pub transition_rules: Vec<TransitionRule>,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_impl]
impl ValueDefault for TransitionOptions {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::default().cell()
    }
}

impl TransitionOptions {
    pub fn get_named(&self, name: RcStr) -> Option<ResolvedVc<Box<dyn Transition>>> {
        self.named_transitions.get(&name).copied()
    }

    pub async fn get_by_rules(
        &self,
        source: ResolvedVc<Box<dyn Source>>,
        reference_type: &ReferenceType,
    ) -> Result<Option<ResolvedVc<Box<dyn Transition>>>> {
        if self.transition_rules.is_empty() {
            return Ok(None);
        }
        let path = &source.ident().await?.path;
        for rule in &self.transition_rules {
            if rule.matches(source, path, reference_type).await? {
                return Ok(Some(rule.transition()));
            }
        }
        Ok(None)
    }
}
