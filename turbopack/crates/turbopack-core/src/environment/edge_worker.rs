use std::str::FromStr;

use anyhow::{Result, anyhow};
use swc_core::ecma::preset_env::{Version, Versions};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};

use crate::{
    environment::{
        ChunkLoading, ExecutionEnvironment, Rendering, RuntimeVersions,
        nodejs::{NodeJsVersion, get_current_nodejs_version},
    },
    target::CompileTarget,
};

#[turbo_tasks::value(shared)]
pub struct EdgeWorkerEnvironment {
    // This isn't actually the Edge's worker environment, but we have to use some kind of version
    // for transpiling ECMAScript features. No tool supports Edge Workers as a separate
    // environment.
    pub node_version: ResolvedVc<NodeJsVersion>,
}

#[turbo_tasks::value_impl]
impl EdgeWorkerEnvironment {
    #[turbo_tasks::function]
    pub async fn runtime_versions(&self) -> Result<Vc<RuntimeVersions>> {
        let str = match *self.node_version.await? {
            NodeJsVersion::Current(process_env) => get_current_nodejs_version(*process_env),
            NodeJsVersion::Static(version) => *version,
        }
        .await?;

        Ok(Vc::cell(Versions {
            node: Some(
                Version::from_str(&str).map_err(|_| anyhow!("Node.js version parse error"))?,
            ),
            ..Default::default()
        }))
    }
}

#[turbo_tasks::value_impl]
impl ExecutionEnvironment for EdgeWorkerEnvironment {
    #[turbo_tasks::function]
    fn compile_target(&self) -> Vc<CompileTarget> {
        CompileTarget::unknown()
    }

    #[turbo_tasks::function]
    async fn runtime_versions(&self) -> Result<Vc<RuntimeVersions>> {
        let str = match *self.node_version.await? {
            NodeJsVersion::Current(process_env) => get_current_nodejs_version(*process_env),
            NodeJsVersion::Static(version) => *version,
        }
        .await?;

        Ok(Vc::cell(Versions {
            node: Some(
                Version::from_str(&str).map_err(|_| anyhow!("Node.js version parse error"))?,
            ),
            ..Default::default()
        }))
    }

    #[turbo_tasks::function]
    fn browserslist_query(&self) -> Vc<RcStr> {
        // TODO: This is a hack, browserslist_query is only used by CSS processing for
        // LightningCSS However, there is an issue where the CSS is not transitioned
        // to the client which we still have to solve. It does apply the
        // browserslist correctly because CSS Modules in client components is double-processed,
        // once for server once for browser.
        Vc::cell("".into())
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
        Vc::cell(true)
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
        Vc::cell(vec![rcstr!("edge-light"), rcstr!("worker")])
    }

    #[turbo_tasks::function]
    fn cwd(&self) -> Vc<Option<RcStr>> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    fn rendering(&self) -> Vc<Rendering> {
        Rendering::Server.cell()
    }

    #[turbo_tasks::function]
    fn chunk_loading(&self) -> Vc<ChunkLoading> {
        ChunkLoading::Edge.cell()
    }
}
