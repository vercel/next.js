use std::collections::HashMap;

use anyhow::Result;
use turbo_tasks::Value;
use turbopack_core::{
    asset::AssetVc, compile_time_info::CompileTimeInfoVc, module::ModuleVc,
    reference_type::ReferenceType,
};

use crate::{
    module_options::ModuleOptionsContextVc, resolve_options_context::ResolveOptionsContextVc,
    ModuleAssetContextVc,
};

/// Some kind of operation that is executed during reference processing. e. g.
/// you can transition to a different environment on a specific import
/// (reference).
#[turbo_tasks::value_trait]
pub trait Transition {
    /// Apply modifications/wrapping to the source asset
    fn process_source(&self, asset: AssetVc) -> AssetVc {
        asset
    }
    /// Apply modifications to the compile-time information
    fn process_compile_time_info(&self, compile_time_info: CompileTimeInfoVc) -> CompileTimeInfoVc {
        compile_time_info
    }
    /// Apply modifications/wrapping to the module options context
    fn process_module_options_context(
        &self,
        context: ModuleOptionsContextVc,
    ) -> ModuleOptionsContextVc {
        context
    }
    /// Apply modifications/wrapping to the resolve options context
    fn process_resolve_options_context(
        &self,
        context: ResolveOptionsContextVc,
    ) -> ResolveOptionsContextVc {
        context
    }
    /// Apply modifications/wrapping to the final asset
    fn process_module(&self, module: ModuleVc, _context: ModuleAssetContextVc) -> ModuleVc {
        module
    }
    /// Apply modifications to the context
    async fn process_context(
        self_vc: TransitionVc,
        context: ModuleAssetContextVc,
    ) -> Result<ModuleAssetContextVc> {
        let context = context.await?;
        let compile_time_info = self_vc.process_compile_time_info(context.compile_time_info);
        let module_options_context =
            self_vc.process_module_options_context(context.module_options_context);
        let resolve_options_context =
            self_vc.process_resolve_options_context(context.resolve_options_context);
        let context = ModuleAssetContextVc::new(
            context.transitions,
            compile_time_info,
            module_options_context,
            resolve_options_context,
        );
        Ok(context)
    }
    /// Apply modification on the processing of the asset
    fn process(
        self_vc: TransitionVc,
        asset: AssetVc,
        context: ModuleAssetContextVc,
        reference_type: Value<ReferenceType>,
    ) -> ModuleVc {
        let asset = self_vc.process_source(asset);
        let context = self_vc.process_context(context);
        let m = context.process_default(asset, reference_type);
        self_vc.process_module(m, context)
    }
}

#[turbo_tasks::value(transparent)]
pub struct TransitionsByName(HashMap<String, TransitionVc>);
