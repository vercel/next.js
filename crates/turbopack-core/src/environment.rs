use std::{
    process::{Command, Stdio},
    str::FromStr,
};

use anyhow::{anyhow, Context, Result};
use swc_core::ecma::preset_env::{Version, Versions};
use turbo_tasks::{
    primitives::{BoolVc, OptionStringVc, StringVc, StringsVc},
    Value,
};
use turbo_tasks_env::ProcessEnvVc;

use crate::target::CompileTargetVc;

static DEFAULT_NODEJS_VERSION: &str = "16.0.0";

#[turbo_tasks::value]
pub struct Environment {
    // members must be private to avoid leaking non-custom types
    execution: ExecutionEnvironment,
    intention: EnvironmentIntention,
}

#[turbo_tasks::value_impl]
impl EnvironmentVc {
    #[turbo_tasks::function]
    pub fn new(
        execution: Value<ExecutionEnvironment>,
        intention: Value<EnvironmentIntention>,
    ) -> Self {
        Self::cell(Environment {
            execution: execution.into_value(),
            intention: intention.into_value(),
        })
    }
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Debug, Hash, Clone, Copy)]
pub enum EnvironmentIntention {
    /// Intent to compute data needed for rendering
    Data,
    /// Intent to intercept requests before server handling
    Middleware,
    /// Intent to handle api requests
    Api,
    /// Intent to prerender on a server for hydration on a client
    Prerendering,
    /// Intent to render on a server
    ServerRendering,
    /// Intent to render into static content
    StaticRendering,
    /// Intent to render on the client
    Client,
    // TODO allow custom trait here
    Custom(u8),
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Debug, Hash, Clone, Copy)]
pub enum ExecutionEnvironment {
    NodeJsBuildTime(NodeJsEnvironmentVc),
    NodeJsLambda(NodeJsEnvironmentVc),
    EdgeFunction(NodeJsEnvironmentVc),
    Browser(BrowserEnvironmentVc),
    // TODO allow custom trait here
    Custom(u8),
}

#[turbo_tasks::value_impl]
impl EnvironmentVc {
    #[turbo_tasks::function]
    pub async fn compile_target(self) -> Result<CompileTargetVc> {
        let this = self.await?;
        Ok(match this.execution {
            ExecutionEnvironment::NodeJsBuildTime(node_env, ..)
            | ExecutionEnvironment::NodeJsLambda(node_env) => node_env.await?.compile_target,
            ExecutionEnvironment::Browser(_) => CompileTargetVc::unknown(),
            ExecutionEnvironment::EdgeFunction(_) => todo!(),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn runtime_versions(self) -> Result<RuntimeVersionsVc> {
        let this = self.await?;
        Ok(match this.execution {
            ExecutionEnvironment::NodeJsBuildTime(node_env, ..)
            | ExecutionEnvironment::NodeJsLambda(node_env) => node_env.runtime_versions(),
            ExecutionEnvironment::Browser(browser_env) => {
                RuntimeVersionsVc::cell(Versions::parse_versions(browserslist::resolve(
                    browser_env.await?.browserslist_query.split(','),
                    &browserslist::Opts::new(),
                )?)?)
            }
            ExecutionEnvironment::EdgeFunction(_) => todo!(),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn node_externals(self) -> Result<BoolVc> {
        let this = self.await?;
        Ok(match this.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                BoolVc::cell(true)
            }
            ExecutionEnvironment::Browser(_) => BoolVc::cell(false),
            ExecutionEnvironment::EdgeFunction(_) => BoolVc::cell(false),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn resolve_extensions(self) -> Result<StringsVc> {
        let env = self.await?;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                StringsVc::cell(vec![
                    ".js".to_string(),
                    ".node".to_string(),
                    ".json".to_string(),
                ])
            }
            ExecutionEnvironment::EdgeFunction(_) | ExecutionEnvironment::Browser(_) => {
                StringsVc::empty()
            }
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn resolve_node_modules(self) -> Result<BoolVc> {
        let env = self.await?;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                BoolVc::cell(true)
            }
            ExecutionEnvironment::EdgeFunction(_) | ExecutionEnvironment::Browser(_) => {
                BoolVc::cell(false)
            }
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn resolve_conditions(self) -> Result<StringsVc> {
        let env = self.await?;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                StringsVc::cell(vec!["node".to_string()])
            }
            ExecutionEnvironment::EdgeFunction(_) | ExecutionEnvironment::Browser(_) => {
                StringsVc::empty()
            }
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn cwd(self) -> Result<OptionStringVc> {
        let env = self.await?;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(env)
            | ExecutionEnvironment::NodeJsLambda(env) => env.await?.cwd,
            _ => OptionStringVc::cell(None),
        })
    }
}

pub enum NodeEnvironmentType {
    Server,
}

#[turbo_tasks::value(shared)]
pub struct NodeJsEnvironment {
    pub compile_target: CompileTargetVc,
    pub node_version: NodeJsVersionVc,
    // user specified process.cwd
    pub cwd: OptionStringVc,
}

impl Default for NodeJsEnvironment {
    fn default() -> Self {
        NodeJsEnvironment {
            compile_target: CompileTargetVc::current(),
            node_version: NodeJsVersionVc::default(),
            cwd: OptionStringVc::cell(None),
        }
    }
}

#[turbo_tasks::value_impl]
impl NodeJsEnvironmentVc {
    #[turbo_tasks::function]
    pub async fn runtime_versions(self) -> Result<RuntimeVersionsVc> {
        let str = match *self.await?.node_version.await? {
            NodeJsVersion::Current(process_env) => get_current_nodejs_version(StringVc::cell(
                process_env
                    .read("PATH")
                    .await?
                    .clone_value()
                    .context("env must have PATH")?,
            )),
            NodeJsVersion::Static(version) => version,
        }
        .await?;

        Ok(RuntimeVersionsVc::cell(Versions {
            node: Some(
                Version::from_str(&str).map_err(|_| anyhow!("Node.js version parse error"))?,
            ),
            ..Default::default()
        }))
    }

    #[turbo_tasks::function]
    pub fn current(process_env: ProcessEnvVc) -> Self {
        Self::cell(NodeJsEnvironment {
            compile_target: CompileTargetVc::current(),
            node_version: NodeJsVersionVc::cell(NodeJsVersion::Current(process_env)),
            cwd: OptionStringVc::cell(None),
        })
    }
}

#[turbo_tasks::value(shared)]
pub enum NodeJsVersion {
    Current(ProcessEnvVc),
    Static(StringVc),
}

impl Default for NodeJsVersionVc {
    fn default() -> Self {
        NodeJsVersion::Static(StringVc::cell(DEFAULT_NODEJS_VERSION.to_owned())).cell()
    }
}

#[turbo_tasks::value(shared)]
pub struct BrowserEnvironment {
    pub dom: bool,
    pub web_worker: bool,
    pub service_worker: bool,
    pub browserslist_query: String,
}

#[turbo_tasks::value(transparent)]
pub struct RuntimeVersions(#[turbo_tasks(trace_ignore)] pub Versions);

#[turbo_tasks::function]
pub async fn get_current_nodejs_version(path_env: StringVc) -> Result<StringVc> {
    let mut cmd = Command::new("node");
    cmd.arg("--version");
    cmd.env_clear();
    cmd.env("PATH", path_env.await?.clone());
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());

    Ok(StringVc::cell(
        String::from_utf8(cmd.output()?.stdout)?
            .strip_prefix('v')
            .context("Version must begin with v")?
            .strip_suffix('\n')
            .context("Version must end with \\n")?
            .to_owned(),
    ))
}
