use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileSystemPath, glob::Glob};
use turbopack_core::{
    compile_time_info::CompileTimeInfo,
    context::{AssetContext, ProcessResult},
    ident::Layer,
    reference_type::ReferenceType,
    resolve::{ModuleResolveResult, ResolveResult, options::ResolveOptions, parse::Request},
    source::Source,
};

#[turbo_tasks::value(shared)]
pub struct NoopAssetContext {
    pub compile_time_info: ResolvedVc<CompileTimeInfo>,
    pub layer: Layer,
}

#[turbo_tasks::value_impl]
impl AssetContext for NoopAssetContext {
    #[turbo_tasks::function]
    fn compile_time_info(&self) -> Vc<CompileTimeInfo> {
        *self.compile_time_info
    }

    fn layer(&self) -> Layer {
        self.layer.clone()
    }

    #[turbo_tasks::function]
    async fn resolve_options(
        self: Vc<Self>,
        _origin_path: FileSystemPath,
        _reference_type: ReferenceType,
    ) -> Result<Vc<ResolveOptions>> {
        Ok(ResolveOptions::default().cell())
    }

    #[turbo_tasks::function]
    async fn resolve_asset(
        self: Vc<Self>,
        _origin_path: FileSystemPath,
        _request: Vc<Request>,
        _resolve_options: Vc<ResolveOptions>,
        _reference_type: ReferenceType,
    ) -> Result<Vc<ModuleResolveResult>> {
        Ok(*ModuleResolveResult::unresolvable())
    }

    #[turbo_tasks::function]
    async fn process_resolve_result(
        self: Vc<Self>,
        _result: Vc<ResolveResult>,
        _reference_type: ReferenceType,
    ) -> Result<Vc<ModuleResolveResult>> {
        Ok(*ModuleResolveResult::unresolvable())
    }

    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        _asset: ResolvedVc<Box<dyn Source>>,
        _reference_type: ReferenceType,
    ) -> Result<Vc<ProcessResult>> {
        Ok(ProcessResult::Ignore.cell())
    }

    #[turbo_tasks::function]
    async fn with_transition(
        self: Vc<Self>,
        _transition: RcStr,
    ) -> Result<Vc<Box<dyn AssetContext>>> {
        Ok(Vc::upcast(self))
    }

    #[turbo_tasks::function]
    async fn side_effect_free_packages(&self) -> Result<Vc<Glob>> {
        Ok(Glob::new(rcstr!(""), Default::default()))
    }
}
