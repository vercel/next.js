use anyhow::Result;
use turbopack_core::compile_time_info::CompileTimeInfoVc;

use crate::{
    module_options::ModuleOptionsContextVc,
    resolve_options_context::ResolveOptionsContextVc,
    transition::{Transition, TransitionVc},
};

/// A transition that only affects the asset context.
#[turbo_tasks::value(shared)]
pub struct ContextTransition {
    compile_time_info: CompileTimeInfoVc,
    module_options_context: ModuleOptionsContextVc,
    resolve_options_context: ResolveOptionsContextVc,
}

#[turbo_tasks::value_impl]
impl ContextTransitionVc {
    #[turbo_tasks::function]
    pub async fn new(
        compile_time_info: CompileTimeInfoVc,
        module_options_context: ModuleOptionsContextVc,
        resolve_options_context: ResolveOptionsContextVc,
    ) -> Result<ContextTransitionVc> {
        Ok(ContextTransition {
            module_options_context,
            resolve_options_context,
            compile_time_info,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Transition for ContextTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: CompileTimeInfoVc,
    ) -> CompileTimeInfoVc {
        self.compile_time_info
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        _context: ModuleOptionsContextVc,
    ) -> ModuleOptionsContextVc {
        self.module_options_context
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: ResolveOptionsContextVc,
    ) -> ResolveOptionsContextVc {
        self.resolve_options_context
    }
}
