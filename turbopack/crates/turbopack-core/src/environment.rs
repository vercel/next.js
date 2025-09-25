use std::{
    process::{Command, Stdio},
    str::FromStr,
};

use anyhow::{Context, Result, anyhow, bail};
use browserslist::Distrib;
use swc_core::ecma::preset_env::{Version, Versions};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TaskInput, Vc};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::FileSystemPathOption;

use crate::target::CompileTarget;

static DEFAULT_NODEJS_VERSION: &str = "18.0.0";

#[turbo_tasks::value]
#[derive(Clone, Copy, Default, Hash, TaskInput, Debug)]
pub enum Rendering {
    #[default]
    None,
    Client,
    Server,
}

impl Rendering {
    pub fn is_none(&self) -> bool {
        matches!(self, Rendering::None)
    }
}

#[turbo_tasks::value]
pub enum ChunkLoading {
    Edge,
    /// CommonJS in Node.js
    NodeJs,
    /// <script> and <link> tags in the browser
    Dom,
}

#[turbo_tasks::value]
pub struct Environment {
    // members must be private to avoid leaking non-custom types
    execution: ExecutionEnvironment,
}

#[turbo_tasks::value_impl]
impl Environment {
    #[turbo_tasks::function]
    pub fn new(execution: ExecutionEnvironment) -> Vc<Self> {
        Self::cell(Environment { execution })
    }
}

#[turbo_tasks::value]
#[derive(Debug, Hash, Clone, Copy, TaskInput)]
pub enum ExecutionEnvironment {
    NodeJsBuildTime(ResolvedVc<NodeJsEnvironment>),
    NodeJsLambda(ResolvedVc<NodeJsEnvironment>),
    EdgeWorker(ResolvedVc<EdgeWorkerEnvironment>),
    Browser(ResolvedVc<BrowserEnvironment>),
    // TODO allow custom trait here
    Custom(u8),
}

async fn resolve_browserslist(browser_env: ResolvedVc<BrowserEnvironment>) -> Result<Vec<Distrib>> {
    Ok(browserslist::resolve(
        browser_env.await?.browserslist_query.split(','),
        &browserslist::Opts {
            ignore_unknown_versions: true,
            ..Default::default()
        },
    )?)
}

#[turbo_tasks::value_impl]
impl Environment {
    #[turbo_tasks::function]
    pub async fn compile_target(&self) -> Result<Vc<CompileTarget>> {
        Ok(match self.execution {
            ExecutionEnvironment::NodeJsBuildTime(node_env, ..)
            | ExecutionEnvironment::NodeJsLambda(node_env) => *node_env.await?.compile_target,
            ExecutionEnvironment::Browser(_) => CompileTarget::unknown(),
            ExecutionEnvironment::EdgeWorker(_) => CompileTarget::unknown(),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn runtime_versions(&self) -> Result<Vc<RuntimeVersions>> {
        Ok(match self.execution {
            ExecutionEnvironment::NodeJsBuildTime(node_env, ..)
            | ExecutionEnvironment::NodeJsLambda(node_env) => node_env.runtime_versions(),
            ExecutionEnvironment::Browser(browser_env) => {
                let distribs = resolve_browserslist(browser_env).await?;
                Vc::cell(Versions::parse_versions(distribs)?)
            }
            ExecutionEnvironment::EdgeWorker(edge_env) => edge_env.runtime_versions(),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn browserslist_query(&self) -> Result<Vc<RcStr>> {
        Ok(match self.execution {
            ExecutionEnvironment::NodeJsBuildTime(_)
            | ExecutionEnvironment::NodeJsLambda(_)
            | ExecutionEnvironment::EdgeWorker(_) =>
            // TODO: This is a hack, browserslist_query is only used by CSS processing for
            // LightningCSS However, there is an issue where the CSS is not transitioned
            // to the client which we still have to solve. It does apply the
            // browserslist correctly because CSS Modules in client components is double-processed,
            // once for server once for browser.
            {
                Vc::cell(rcstr!(""))
            }
            ExecutionEnvironment::Browser(browser_env) => {
                Vc::cell(browser_env.await?.browserslist_query.clone())
            }
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub fn node_externals(&self) -> Vc<bool> {
        match self.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(true)
            }
            ExecutionEnvironment::Browser(_) => Vc::cell(false),
            ExecutionEnvironment::EdgeWorker(_) => Vc::cell(false),
            ExecutionEnvironment::Custom(_) => todo!(),
        }
    }

    #[turbo_tasks::function]
    pub fn supports_esm_externals(&self) -> Vc<bool> {
        match self.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(true)
            }
            ExecutionEnvironment::Browser(_) => Vc::cell(false),
            ExecutionEnvironment::EdgeWorker(_) => Vc::cell(false),
            ExecutionEnvironment::Custom(_) => todo!(),
        }
    }

    #[turbo_tasks::function]
    pub fn supports_commonjs_externals(&self) -> Vc<bool> {
        match self.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(true)
            }
            ExecutionEnvironment::Browser(_) => Vc::cell(false),
            ExecutionEnvironment::EdgeWorker(_) => Vc::cell(true),
            ExecutionEnvironment::Custom(_) => todo!(),
        }
    }

    #[turbo_tasks::function]
    pub fn supports_wasm(&self) -> Vc<bool> {
        match self.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(true)
            }
            ExecutionEnvironment::Browser(_) => Vc::cell(false),
            ExecutionEnvironment::EdgeWorker(_) => Vc::cell(false),
            ExecutionEnvironment::Custom(_) => todo!(),
        }
    }

    #[turbo_tasks::function]
    pub fn resolve_extensions(&self) -> Vc<Vec<RcStr>> {
        let env = self;
        match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(vec![rcstr!(".js"), rcstr!(".node"), rcstr!(".json")])
            }
            ExecutionEnvironment::EdgeWorker(_) | ExecutionEnvironment::Browser(_) => {
                Vc::<Vec<RcStr>>::default()
            }
            ExecutionEnvironment::Custom(_) => todo!(),
        }
    }

    #[turbo_tasks::function]
    pub fn resolve_node_modules(&self) -> Vc<bool> {
        let env = self;
        match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(true)
            }
            ExecutionEnvironment::EdgeWorker(_) | ExecutionEnvironment::Browser(_) => {
                Vc::cell(false)
            }
            ExecutionEnvironment::Custom(_) => todo!(),
        }
    }

    #[turbo_tasks::function]
    pub fn resolve_conditions(&self) -> Vc<Vec<RcStr>> {
        let env = self;
        match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(vec![rcstr!("node")])
            }
            ExecutionEnvironment::Browser(_) => Vc::<Vec<RcStr>>::default(),
            ExecutionEnvironment::EdgeWorker(_) => {
                Vc::cell(vec![rcstr!("edge-light"), rcstr!("worker")])
            }
            ExecutionEnvironment::Custom(_) => todo!(),
        }
    }

    #[turbo_tasks::function]
    pub async fn cwd(&self) -> Result<Vc<FileSystemPathOption>> {
        let env = self;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(env)
            | ExecutionEnvironment::NodeJsLambda(env) => *env.await?.cwd,
            _ => Vc::cell(None),
        })
    }

    #[turbo_tasks::function]
    pub fn rendering(&self) -> Vc<Rendering> {
        let env = self;
        match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(_) | ExecutionEnvironment::NodeJsLambda(_) => {
                Rendering::Server.cell()
            }
            ExecutionEnvironment::EdgeWorker(_) => Rendering::Server.cell(),
            ExecutionEnvironment::Browser(_) => Rendering::Client.cell(),
            _ => Rendering::None.cell(),
        }
    }

    #[turbo_tasks::function]
    pub fn chunk_loading(&self) -> Vc<ChunkLoading> {
        let env = self;
        match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(_) | ExecutionEnvironment::NodeJsLambda(_) => {
                ChunkLoading::NodeJs.cell()
            }
            ExecutionEnvironment::EdgeWorker(_) => ChunkLoading::Edge.cell(),
            ExecutionEnvironment::Browser(_) => ChunkLoading::Dom.cell(),
            ExecutionEnvironment::Custom(_) => todo!(),
        }
    }
}

pub enum NodeEnvironmentType {
    Server,
}

#[turbo_tasks::value(shared)]
pub struct NodeJsEnvironment {
    pub compile_target: ResolvedVc<CompileTarget>,
    pub node_version: ResolvedVc<NodeJsVersion>,
    // user specified process.cwd
    pub cwd: ResolvedVc<FileSystemPathOption>,
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

#[turbo_tasks::value(shared)]
pub struct BrowserEnvironment {
    pub dom: bool,
    pub web_worker: bool,
    pub service_worker: bool,
    pub browserslist_query: RcStr,
}

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

// TODO preset_env_base::Version implements Serialize/Deserialize incorrectly
#[turbo_tasks::value(transparent, serialization = "none")]
pub struct RuntimeVersions(#[turbo_tasks(trace_ignore)] pub Versions);

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
