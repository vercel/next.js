use anyhow::Result;
use swc_core::ecma::preset_env::Versions;
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;

use crate::{
    environment::{ChunkLoading, ExecutionEnvironment, Rendering, RuntimeVersions},
    target::CompileTarget,
};

#[turbo_tasks::value(shared)]
pub struct BrowserEnvironment {
    pub dom: bool,
    pub web_worker: bool,
    pub service_worker: bool,
    pub browserslist_query: RcStr,
}

#[turbo_tasks::value_impl]
impl ExecutionEnvironment for BrowserEnvironment {
    #[turbo_tasks::function]
    fn compile_target(&self) -> Vc<CompileTarget> {
        CompileTarget::unknown()
    }

    #[turbo_tasks::function]
    async fn runtime_versions(&self) -> Result<Vc<RuntimeVersions>> {
        let distribs = browserslist::resolve(
            self.browserslist_query.split(','),
            &browserslist::Opts {
                ignore_unknown_versions: true,
                ..Default::default()
            },
        )?;
        Ok(Vc::cell(Versions::parse_versions(distribs)?))
    }

    #[turbo_tasks::function]
    fn browserslist_query(&self) -> Vc<RcStr> {
        Vc::cell(self.browserslist_query.clone())
    }

    #[turbo_tasks::function]
    fn node_externals(&self) -> Vc<bool> {
        Vc::cell(false)
    }

    #[turbo_tasks::function]
    fn supports_esm_externals(&self) -> Vc<bool> {
        Vc::cell(false)
    }

    #[turbo_tasks::function]
    fn supports_commonjs_externals(&self) -> Vc<bool> {
        Vc::cell(false)
    }

    #[turbo_tasks::function]
    fn supports_wasm(&self) -> Vc<bool> {
        Vc::cell(false)
    }

    #[turbo_tasks::function]
    fn resolve_extensions(&self) -> Vc<Vec<RcStr>> {
        Vc::<Vec<RcStr>>::default()
    }

    #[turbo_tasks::function]
    fn resolve_node_modules(&self) -> Vc<bool> {
        Vc::cell(false)
    }

    #[turbo_tasks::function]
    fn resolve_conditions(&self) -> Vc<Vec<RcStr>> {
        Vc::<Vec<RcStr>>::default()
    }

    #[turbo_tasks::function]
    fn cwd(&self) -> Vc<Option<RcStr>> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    fn rendering(&self) -> Vc<Rendering> {
        Rendering::Client.cell()
    }

    #[turbo_tasks::function]
    fn chunk_loading(&self) -> Vc<ChunkLoading> {
        ChunkLoading::Dom.cell()
    }
}
