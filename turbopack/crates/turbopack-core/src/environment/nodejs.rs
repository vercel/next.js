use std::{
    process::{Command, Stdio},
    str::FromStr,
};

use anyhow::{Context, Result, anyhow, bail};
use swc_core::ecma::preset_env::{Version, Versions};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_env::ProcessEnv;

use crate::{
    environment::{ChunkLoading, ExecutionEnvironment, Rendering, RuntimeVersions},
    target::CompileTarget,
};

const DEFAULT_NODEJS_VERSION: &str = "18.0.0";

#[turbo_tasks::value(shared)]
pub struct NodeJsEnvironment {
    pub compile_target: ResolvedVc<CompileTarget>,
    pub node_version: ResolvedVc<NodeJsVersion>,
    // user specified process.cwd
    pub cwd: ResolvedVc<Option<RcStr>>,
}

impl Default for NodeJsEnvironment {
    fn default() -> Self {
        NodeJsEnvironment {
            compile_target: CompileTarget::current_raw().resolved_cell(),
            node_version: NodeJsVersion::default().resolved_cell(),
            cwd: ResolvedVc::cell(None),
        }
    }
}

#[turbo_tasks::value_impl]
impl NodeJsEnvironment {
    #[turbo_tasks::function]
    pub async fn runtime_versions(&self) -> Result<Vc<RuntimeVersions>> {
        let str = match *self.node_version.await? {
            NodeJsVersion::Current(process_env) => get_current_nodejs_version(*process_env),
            NodeJsVersion::Static(version) => *version,
        }
        .await?;

        Ok(Vc::cell(Versions {
            node: Some(
                Version::from_str(&str)
                    .map_err(|_| anyhow!("Failed to parse Node.js version: '{}'", str))?,
            ),
            ..Default::default()
        }))
    }

    #[turbo_tasks::function]
    pub async fn current(process_env: ResolvedVc<Box<dyn ProcessEnv>>) -> Result<Vc<Self>> {
        Ok(Self::cell(NodeJsEnvironment {
            compile_target: CompileTarget::current().to_resolved().await?,
            node_version: NodeJsVersion::cell(NodeJsVersion::Current(process_env))
                .to_resolved()
                .await?,
            cwd: ResolvedVc::cell(None),
        }))
    }
}

#[turbo_tasks::value(shared)]
pub enum NodeJsVersion {
    /// Use the version of Node.js that is available from the environment (via `node --version`)
    Current(ResolvedVc<Box<dyn ProcessEnv>>),
    /// Use the specified version of Node.js.
    Static(ResolvedVc<RcStr>),
}

impl Default for NodeJsVersion {
    fn default() -> Self {
        NodeJsVersion::Static(ResolvedVc::cell(DEFAULT_NODEJS_VERSION.into()))
    }
}

#[turbo_tasks::value_impl]
impl ExecutionEnvironment for NodeJsEnvironment {
    #[turbo_tasks::function]
    fn compile_target(&self) -> Vc<CompileTarget> {
        *self.compile_target
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
                Version::from_str(&str)
                    .map_err(|_| anyhow!("Failed to parse Node.js version: '{}'", str))?,
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
        Vc::cell(true)
    }

    #[turbo_tasks::function]
    fn supports_esm_externals(&self) -> Vc<bool> {
        Vc::cell(true)
    }

    #[turbo_tasks::function]
    fn supports_commonjs_externals(&self) -> Vc<bool> {
        Vc::cell(true)
    }

    #[turbo_tasks::function]
    fn supports_wasm(&self) -> Vc<bool> {
        Vc::cell(true)
    }

    #[turbo_tasks::function]
    fn resolve_extensions(&self) -> Vc<Vec<RcStr>> {
        Vc::cell(vec![rcstr!(".js"), rcstr!(".node"), rcstr!(".json")])
    }

    #[turbo_tasks::function]
    fn resolve_node_modules(&self) -> Vc<bool> {
        Vc::cell(true)
    }

    #[turbo_tasks::function]
    fn resolve_conditions(&self) -> Vc<Vec<RcStr>> {
        Vc::cell(vec![rcstr!("node")])
    }

    #[turbo_tasks::function]
    fn cwd(&self) -> Vc<Option<RcStr>> {
        *self.cwd
    }

    #[turbo_tasks::function]
    fn rendering(&self) -> Vc<Rendering> {
        Rendering::Server.cell()
    }

    #[turbo_tasks::function]
    fn chunk_loading(&self) -> Vc<ChunkLoading> {
        ChunkLoading::NodeJs.cell()
    }
}

#[turbo_tasks::function]
pub async fn get_current_nodejs_version(env: Vc<Box<dyn ProcessEnv>>) -> Result<Vc<RcStr>> {
    let path_read = env.read(rcstr!("PATH")).await?;
    let path = path_read.as_ref().context("env must have PATH")?;
    let mut cmd = Command::new("node");
    cmd.arg("--version");
    cmd.env_clear();
    cmd.env("PATH", path);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());

    let output = cmd.output()?;

    if !output.status.success() {
        bail!(
            "'node --version' command failed{}{}",
            output
                .status
                .code()
                .map(|c| format!(" with exit code {c}"))
                .unwrap_or_default(),
            String::from_utf8(output.stderr)
                .map(|stderr| format!(": {stderr}"))
                .unwrap_or_default()
        );
    }

    let version = String::from_utf8(output.stdout)
        .context("failed to parse 'node --version' output as utf8")?;
    if let Some(version_number) = version.strip_prefix("v") {
        Ok(Vc::cell(version_number.trim().into()))
    } else {
        bail!(
            "Expected 'node --version' to return a version starting with 'v', but received: '{}'",
            version
        )
    }
}
