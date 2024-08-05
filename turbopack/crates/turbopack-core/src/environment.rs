use std::{
    process::{Command, Stdio},
    str::FromStr,
};

use anyhow::{anyhow, Context, Result};
use swc_core::ecma::preset_env::{Version, Versions};
use turbo_tasks::{RcStr, Value, Vc};
use turbo_tasks_env::ProcessEnv;

use crate::target::CompileTarget;

static DEFAULT_NODEJS_VERSION: &str = "16.0.0";

#[turbo_tasks::value]
#[derive(Default)]
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
    NodeJsBuildTime(Vc<NodeJsEnvironment>),
    NodeJsLambda(Vc<NodeJsEnvironment>),
    EdgeWorker(Vc<EdgeWorkerEnvironment>),
    Browser(Vc<BrowserEnvironment>),
    // TODO allow custom trait here
    Custom(u8),
}

#[turbo_tasks::value_impl]
impl Environment {
    #[turbo_tasks::function]
    pub async fn compile_target(self: Vc<Self>) -> Result<Vc<CompileTarget>> {
        let this = self.await?;
        Ok(match this.execution {
            ExecutionEnvironment::NodeJsBuildTime(node_env, ..)
            | ExecutionEnvironment::NodeJsLambda(node_env) => node_env.await?.compile_target,
            ExecutionEnvironment::Browser(_) => CompileTarget::unknown(),
            ExecutionEnvironment::EdgeWorker(_) => CompileTarget::unknown(),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn runtime_versions(self: Vc<Self>) -> Result<Vc<RuntimeVersions>> {
        let this = self.await?;
        Ok(match this.execution {
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
    pub async fn node_externals(self: Vc<Self>) -> Result<Vc<bool>> {
        let this = self.await?;
        Ok(match this.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(true)
            }
            ExecutionEnvironment::Browser(_) => Vc::cell(false),
            ExecutionEnvironment::EdgeWorker(_) => Vc::cell(false),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn supports_esm_externals(self: Vc<Self>) -> Result<Vc<bool>> {
        let this = self.await?;
        Ok(match this.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(true)
            }
            ExecutionEnvironment::Browser(_) => Vc::cell(false),
            ExecutionEnvironment::EdgeWorker(_) => Vc::cell(false),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn supports_commonjs_externals(self: Vc<Self>) -> Result<Vc<bool>> {
        let this = self.await?;
        Ok(match this.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(true)
            }
            ExecutionEnvironment::Browser(_) => Vc::cell(false),
            ExecutionEnvironment::EdgeWorker(_) => Vc::cell(true),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn supports_wasm(self: Vc<Self>) -> Result<Vc<bool>> {
        let this = self.await?;
        Ok(match this.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(true)
            }
            ExecutionEnvironment::Browser(_) => Vc::cell(false),
            ExecutionEnvironment::EdgeWorker(_) => Vc::cell(false),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn resolve_extensions(self: Vc<Self>) -> Result<Vc<Vec<RcStr>>> {
        let env = self.await?;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(vec![".js".into(), ".node".into(), ".json".into()])
            }
            ExecutionEnvironment::EdgeWorker(_) | ExecutionEnvironment::Browser(_) => {
                Vc::<Vec<RcStr>>::default()
            }
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn resolve_node_modules(self: Vc<Self>) -> Result<Vc<bool>> {
        let env = self.await?;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(true)
            }
            ExecutionEnvironment::EdgeWorker(_) | ExecutionEnvironment::Browser(_) => {
                Vc::cell(false)
            }
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn resolve_conditions(self: Vc<Self>) -> Result<Vc<Vec<RcStr>>> {
        let env = self.await?;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(vec!["node".into()])
            }
            ExecutionEnvironment::Browser(_) => Vc::<Vec<RcStr>>::default(),
            ExecutionEnvironment::EdgeWorker(_) => {
                Vc::cell(vec!["edge-light".into(), "worker".into()])
            }
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn cwd(self: Vc<Self>) -> Result<Vc<Option<RcStr>>> {
        let env = self.await?;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(env)
            | ExecutionEnvironment::NodeJsLambda(env) => env.await?.cwd,
            _ => Vc::cell(None),
        })
    }

    #[turbo_tasks::function]
    pub async fn rendering(self: Vc<Self>) -> Result<Vc<Rendering>> {
        let env = self.await?;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(_) | ExecutionEnvironment::NodeJsLambda(_) => {
                Rendering::Server.cell()
            }
            ExecutionEnvironment::EdgeWorker(_) => Rendering::Server.cell(),
            ExecutionEnvironment::Browser(_) => Rendering::Client.cell(),
            _ => Rendering::None.cell(),
        })
    }

    #[turbo_tasks::function]
    pub async fn chunk_loading(self: Vc<Self>) -> Result<Vc<ChunkLoading>> {
        let env = self.await?;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(_) | ExecutionEnvironment::NodeJsLambda(_) => {
                ChunkLoading::NodeJs.cell()
            }
            ExecutionEnvironment::EdgeWorker(_) => ChunkLoading::Edge.cell(),
            ExecutionEnvironment::Browser(_) => ChunkLoading::Dom.cell(),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }
}

pub enum NodeEnvironmentType {
    Server,
}

#[turbo_tasks::value(shared)]
pub struct NodeJsEnvironment {
    pub compile_target: Vc<CompileTarget>,
    pub node_version: Vc<NodeJsVersion>,
    // user specified process.cwd
    pub cwd: Vc<Option<RcStr>>,
}

impl Default for NodeJsEnvironment {
    fn default() -> Self {
        NodeJsEnvironment {
            compile_target: CompileTarget::current(),
            node_version: NodeJsVersion::default().cell(),
            cwd: Vc::cell(None),
        }
    }
}

#[turbo_tasks::value_impl]
impl NodeJsEnvironment {
    #[turbo_tasks::function]
    pub async fn runtime_versions(self: Vc<Self>) -> Result<Vc<RuntimeVersions>> {
        let str = match *self.await?.node_version.await? {
            NodeJsVersion::Current(process_env) => get_current_nodejs_version(process_env),
            NodeJsVersion::Static(version) => version,
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
    pub fn current(process_env: Vc<Box<dyn ProcessEnv>>) -> Vc<Self> {
        Self::cell(NodeJsEnvironment {
            compile_target: CompileTarget::current(),
            node_version: NodeJsVersion::cell(NodeJsVersion::Current(process_env)),
            cwd: Vc::cell(None),
        })
    }
}

#[turbo_tasks::value(shared)]
pub enum NodeJsVersion {
    Current(Vc<Box<dyn ProcessEnv>>),
    Static(Vc<RcStr>),
}

impl Default for NodeJsVersion {
    fn default() -> Self {
        NodeJsVersion::Static(Vc::cell(DEFAULT_NODEJS_VERSION.into()))
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

#[turbo_tasks::value(transparent)]
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
