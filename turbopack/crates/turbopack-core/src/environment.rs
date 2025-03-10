use std::{
    process::{Command, Stdio},
    str::FromStr,
};

use anyhow::{anyhow, Context, Result};
use swc_core::ecma::preset_env::{Version, Versions};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TaskInput, Value, Vc};
use turbo_tasks_env::ProcessEnv;

use crate::target::CompileTarget;

static DEFAULT_NODEJS_VERSION: &str = "16.0.0";

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
    pub fn new(execution: Value<ExecutionEnvironment>) -> Vc<Self> {
        Self::cell(Environment {
            execution: execution.into_value(),
        })
    }
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Hash, Clone, Copy)]
pub enum ExecutionEnvironment {
    NodeJsBuildTime(ResolvedVc<NodeJsEnvironment>),
    NodeJsLambda(ResolvedVc<NodeJsEnvironment>),
    EdgeWorker(ResolvedVc<EdgeWorkerEnvironment>),
    Browser(ResolvedVc<BrowserEnvironment>),
    // TODO allow custom trait here
    Custom(u8),
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
                Vc::cell(Versions::parse_versions(browserslist::resolve(
                    browser_env.await?.browserslist_query.split(','),
                    &browserslist::Opts::default(),
                )?)?)
            }
            ExecutionEnvironment::EdgeWorker(_) => todo!(),
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
                Vc::cell(vec![".js".into(), ".node".into(), ".json".into()])
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
                Vc::cell(vec!["node".into()])
            }
            ExecutionEnvironment::Browser(_) => Vc::<Vec<RcStr>>::default(),
            ExecutionEnvironment::EdgeWorker(_) => {
                Vc::cell(vec!["edge-light".into(), "worker".into()])
            }
            ExecutionEnvironment::Custom(_) => todo!(),
        }
    }

    #[turbo_tasks::function]
    pub async fn cwd(&self) -> Result<Vc<Option<RcStr>>> {
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
                Version::from_str(&str).map_err(|_| anyhow!("Node.js version parse error"))?,
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
    Current(ResolvedVc<Box<dyn ProcessEnv>>),
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
pub struct EdgeWorkerEnvironment {}

// TODO preset_env_base::Version implements Serialize/Deserialize incorrectly
#[turbo_tasks::value(transparent, serialization = "none")]
pub struct RuntimeVersions(#[turbo_tasks(trace_ignore)] pub Versions);

#[turbo_tasks::function]
pub async fn get_current_nodejs_version(env: Vc<Box<dyn ProcessEnv>>) -> Result<Vc<RcStr>> {
    let path_read = env.read("PATH".into()).await?;
    let path = path_read.as_ref().context("env must have PATH")?;
    let mut cmd = Command::new("node");
    cmd.arg("--version");
    cmd.env_clear();
    cmd.env("PATH", path);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());

    Ok(Vc::cell(
        String::from_utf8(cmd.output()?.stdout)?
            .strip_prefix('v')
            .context("Version must begin with v")?
            .strip_suffix('\n')
            .context("Version must end with \\n")?
            .into(),
    ))
}
