pub(crate) mod context_transition;

use std::collections::HashMap;

use anyhow::Result;
pub use context_transition::ContextTransition;
use turbo_tasks::{Value, Vc};
use turbopack_core::{
    compile_time_info::CompileTimeInfo, module::Module, reference_type::ReferenceType,
    source::Source,
};

use crate::{
    module_options::ModuleOptionsContext, resolve_options_context::ResolveOptionsContext,
    ModuleAssetContext,
};

/// Some kind of operation that is executed during reference processing. e. g.
/// you can transition to a different environment on a specific import
/// (reference).
#[turbo_tasks::value_trait]
pub trait Transition {
    /// Apply modifications/wrapping to the source asset
    fn process_source(self: Vc<Self>, asset: Vc<Box<dyn Source>>) -> Vc<Box<dyn Source>> {
        asset
    }
    /// Apply modifications to the compile-time information
    fn process_compile_time_info(
        self: Vc<Self>,
        compile_time_info: Vc<CompileTimeInfo>,
    ) -> Vc<CompileTimeInfo> {
        compile_time_info
    }
    /// Apply modifications/wrapping to the module options context
    fn process_module_options_context(
        self: Vc<Self>,
        context: Vc<ModuleOptionsContext>,
    ) -> Vc<ModuleOptionsContext> {
        context
    }
    /// Apply modifications/wrapping to the resolve options context
    fn process_resolve_options_context(
        self: Vc<Self>,
        context: Vc<ResolveOptionsContext>,
    ) -> Vc<ResolveOptionsContext> {
        context
    }
    /// Apply modifications/wrapping to the final asset
    fn process_module(
        self: Vc<Self>,
        module: Vc<Box<dyn Module>>,
        _context: Vc<ModuleAssetContext>,
    ) -> Vc<Box<dyn Module>> {
        module
    }
    /// Apply modifications to the context
    async fn process_context(
        self: Vc<Self>,
        context: Vc<ModuleAssetContext>,
    ) -> Result<Vc<ModuleAssetContext>> {
        let context = context.await?;
        let compile_time_info = self.process_compile_time_info(context.compile_time_info);
        let module_options_context =
            self.process_module_options_context(context.module_options_context);
        let resolve_options_context =
            self.process_resolve_options_context(context.resolve_options_context);
        let context = ModuleAssetContext::new(
            context.transitions,
            compile_time_info,
            module_options_context,
            resolve_options_context,
        );
        Ok(context)
    }
    /// Apply modification on the processing of the asset
    fn process(
        self: Vc<Self>,
        asset: Vc<Box<dyn Source>>,
        context: Vc<ModuleAssetContext>,
        reference_type: Value<ReferenceType>,
    ) -> Vc<Box<dyn Module>> {
        let asset = self.process_source(asset);
        let context = self.process_context(context);
        let m = context.process_default(asset, reference_type);
        self.process_module(m, context)
    }
}

#[turbo_tasks::value(transparent)]
pub struct TransitionsByName(HashMap<String, Vc<Box<dyn Transition>>>);
