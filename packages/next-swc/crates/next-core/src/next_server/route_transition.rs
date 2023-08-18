use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    core::compile_time_info::CompileTimeInfo,
    turbopack::{resolve_options_context::ResolveOptionsContext, transition::Transition},
};

#[turbo_tasks::value(shared)]
pub struct NextRouteTransition {
    pub server_compile_time_info: Vc<CompileTimeInfo>,
    pub server_resolve_options_context: Vc<ResolveOptionsContext>,
}

#[turbo_tasks::value_impl]
impl Transition for NextRouteTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: Vc<CompileTimeInfo>,
    ) -> Vc<CompileTimeInfo> {
        self.server_compile_time_info
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: Vc<ResolveOptionsContext>,
    ) -> Vc<ResolveOptionsContext> {
        self.server_resolve_options_context
    }
}
