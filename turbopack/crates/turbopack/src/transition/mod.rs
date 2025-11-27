pub(crate) mod full_context_transition;

use anyhow::Result;
pub use full_context_transition::FullContextTransition;
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueDefault, Vc};
use turbopack_core::{
    compile_time_info::CompileTimeInfo, context::ProcessResult, module::Module,
    reference_type::ReferenceType, source::Source,
};
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

use crate::{
    ModuleAssetContext,
    module_options::{ModuleOptionsContext, transition_rule::TransitionRule},
};

/// Some kind of operation that is executed during reference processing. e. g.
/// you can transition to a different environment on a specific import
/// (reference).
#[turbo_tasks::value_trait]
pub trait Transition {
    /// Apply modifications/wrapping to the source asset
    #[turbo_tasks::function]
    fn process_source(self: Vc<Self>, asset: Vc<Box<dyn Source>>) -> Vc<Box<dyn Source>> {
        asset
    }

    /// Apply modifications to the compile-time information
    #[turbo_tasks::function]
    fn process_compile_time_info(
        self: Vc<Self>,
        compile_time_info: Vc<CompileTimeInfo>,
    ) -> Vc<CompileTimeInfo> {
        compile_time_info
    }

    /// Apply modifications/wrapping to the module options context
    #[turbo_tasks::function]
    fn process_module_options_context(
        self: Vc<Self>,
        module_options_context: Vc<ModuleOptionsContext>,
    ) -> Vc<ModuleOptionsContext> {
        module_options_context
    }

    /// Apply modifications/wrapping to the resolve options context
    #[turbo_tasks::function]
    fn process_resolve_options_context(
        self: Vc<Self>,
        resolve_options_context: Vc<ResolveOptionsContext>,
    ) -> Vc<ResolveOptionsContext> {
        resolve_options_context
    }

    /// Apply modifications/wrapping to the transition options
    #[turbo_tasks::function]
    fn process_transition_options(
        self: Vc<Self>,
        transition_options: Vc<TransitionOptions>,
    ) -> Vc<TransitionOptions> {
        transition_options
    }

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
        let compile_time_info =
            self.process_compile_time_info(*module_asset_context.compile_time_info);
        let module_options_context =
            self.process_module_options_context(*module_asset_context.module_options_context);
        let resolve_options_context =
            self.process_resolve_options_context(*module_asset_context.resolve_options_context);
        let layer = module_asset_context.layer.clone();
        let transition_options = self.process_transition_options(*module_asset_context.transitions);
        let module_asset_context = ModuleAssetContext::new(
            transition_options,
            compile_time_info,
            module_options_context,
            resolve_options_context,
            layer,
        );
        Ok(module_asset_context)
    }

    /// Apply modification on the processing of the asset
    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        asset: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        reference_type: ReferenceType,
    ) -> Result<Vc<ProcessResult>> {
        let asset = self.process_source(asset);
        let module_asset_context = self.process_context(module_asset_context);
        let asset = asset.to_resolved().await?;

        Ok(match &*module_asset_context
            .process_default(asset, reference_type)
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
        let path = &*source.ident().path().await?;
        for rule in &self.transition_rules {
            if rule.matches(source, path, reference_type).await? {
                return Ok(Some(rule.transition()));
            }
        }
        Ok(None)
    }
}
