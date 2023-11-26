use std::{
    fmt,
    net::SocketAddr,
    process::{Command, Stdio},
    str::FromStr,
};

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use swc_core::ecma::preset_env::{Version, Versions};
use turbo_tasks::{Value, Vc};
use turbo_tasks_env::ProcessEnv;

use crate::target::CompileTarget;

static DEFAULT_NODEJS_VERSION: &str = "16.0.0";

#[turbo_tasks::value(shared)]
#[derive(Default)]
pub struct ServerAddr(#[turbo_tasks(trace_ignore)] Option<SocketAddr>);

impl ServerAddr {
    pub fn new(addr: SocketAddr) -> Self {
        Self(Some(addr))
    }

    /// The hostname portion of the address, without the port. Prefers
    /// "localhost" when using a loopback address.
    pub fn hostname(&self) -> Option<String> {
        self.0.map(|addr| {
            if addr.ip().is_loopback() || addr.ip().is_unspecified() {
                "localhost".to_string()
            } else if addr.is_ipv6() {
                // When using an IPv6 address, we need to surround the IP in brackets to
                // distinguish it from the port's `:`.
                format!("[{}]", addr.ip())
            } else {
                addr.ip().to_string()
            }
        })
    }

    pub fn ip(&self) -> Option<String> {
        self.0.map(|addr| addr.ip().to_string())
    }

    pub fn port(&self) -> Option<u16> {
        self.0.map(|addr| addr.port())
    }

    /// Constructs a URL out of the address.
    pub fn to_string(&self) -> Result<String> {
        let (hostname, port) = self
            .hostname()
            .zip(self.port())
            .context("expected some server address")?;
        let protocol = Protocol::from(port);
        Ok(match port {
            80 | 443 => format!("{protocol}://{hostname}"),
            _ => format!("{protocol}://{hostname}:{port}"),
        })
    }
}

#[turbo_tasks::value_impl]
impl ServerAddr {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        ServerAddr(None).cell()
    }
}

/// A simple serializable structure meant to carry information about Turbopack's
/// server to node rendering processes.
#[derive(Debug, Serialize, Deserialize)]
pub struct ServerInfo {
    pub ip: String,
    pub port: u16,

    /// The protocol, either `http` or `https`
    pub protocol: Protocol,

    /// A formatted hostname (eg, "localhost") or the IP address of the server
    pub hostname: String,
}

#[derive(Copy, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    HTTP,
    HTTPS,
}

impl From<u16> for Protocol {
    fn from(value: u16) -> Self {
        match value {
            443 => Self::HTTPS,
            _ => Self::HTTP,
        }
    }
}

impl fmt::Display for Protocol {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::HTTP => f.write_str("http"),
            Self::HTTPS => f.write_str("https"),
        }
    }
}

impl TryFrom<&ServerAddr> for ServerInfo {
    type Error = anyhow::Error;

    fn try_from(addr: &ServerAddr) -> Result<Self> {
        if addr.0.is_none() {
            bail!("cannot unwrap ServerAddr");
        };
        let port = addr.port().unwrap();
        Ok(ServerInfo {
            ip: addr.ip().unwrap(),
            hostname: addr.hostname().unwrap(),
            port,
            protocol: Protocol::from(port),
        })
    }
}

#[turbo_tasks::value]
#[derive(Default)]
pub enum Rendering {
    #[default]
    None,
    Client,
    Server(Vc<ServerAddr>),
}

impl Rendering {
    pub fn is_none(&self) -> bool {
        matches!(self, Rendering::None)
    }
}

#[turbo_tasks::value]
#[derive(Default)]
pub enum ChunkLoading {
    #[default]
    None,
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
#[derive(PartialOrd, Ord, Debug, Hash, Clone, Copy)]
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
                    &browserslist::Opts::new(),
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
    pub async fn resolve_extensions(self: Vc<Self>) -> Result<Vc<Vec<String>>> {
        let env = self.await?;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(vec![
                    ".js".to_string(),
                    ".node".to_string(),
                    ".json".to_string(),
                ])
            }
            ExecutionEnvironment::EdgeWorker(_) | ExecutionEnvironment::Browser(_) => {
                Vc::<Vec<String>>::default()
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
    pub async fn resolve_conditions(self: Vc<Self>) -> Result<Vc<Vec<String>>> {
        let env = self.await?;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(..) | ExecutionEnvironment::NodeJsLambda(_) => {
                Vc::cell(vec!["node".to_string()])
            }
            ExecutionEnvironment::Browser(_) => Vc::<Vec<String>>::default(),
            ExecutionEnvironment::EdgeWorker(_) => Vc::cell(vec!["edge-worker".to_string()]),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn cwd(self: Vc<Self>) -> Result<Vc<Option<String>>> {
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
            ExecutionEnvironment::NodeJsBuildTime(env)
            | ExecutionEnvironment::NodeJsLambda(env) => {
                Rendering::Server(env.await?.server_addr).cell()
            }
            ExecutionEnvironment::EdgeWorker(env) => {
                Rendering::Server(env.await?.server_addr).cell()
            }
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
            ExecutionEnvironment::EdgeWorker(_) => ChunkLoading::None.cell(),
            ExecutionEnvironment::Browser(_) => ChunkLoading::Dom.cell(),
            _ => ChunkLoading::None.cell(),
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
    pub cwd: Vc<Option<String>>,
    pub server_addr: Vc<ServerAddr>,
}

impl Default for NodeJsEnvironment {
    fn default() -> Self {
        NodeJsEnvironment {
            compile_target: CompileTarget::current(),
            node_version: NodeJsVersion::default().cell(),
            cwd: Vc::cell(None),
            server_addr: ServerAddr::empty(),
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
    pub fn current(process_env: Vc<Box<dyn ProcessEnv>>, server_addr: Vc<ServerAddr>) -> Vc<Self> {
        Self::cell(NodeJsEnvironment {
            compile_target: CompileTarget::current(),
            node_version: NodeJsVersion::cell(NodeJsVersion::Current(process_env)),
            cwd: Vc::cell(None),
            server_addr,
        })
    }
}

#[turbo_tasks::value(shared)]
pub enum NodeJsVersion {
    Current(Vc<Box<dyn ProcessEnv>>),
    Static(Vc<String>),
}

impl Default for NodeJsVersion {
    fn default() -> Self {
        NodeJsVersion::Static(Vc::cell(DEFAULT_NODEJS_VERSION.to_owned()))
    }
}

#[turbo_tasks::value(shared)]
pub struct BrowserEnvironment {
    pub dom: bool,
    pub web_worker: bool,
    pub service_worker: bool,
    pub browserslist_query: String,
}

#[turbo_tasks::value(shared)]
pub struct EdgeWorkerEnvironment {
    pub server_addr: Vc<ServerAddr>,
}

#[turbo_tasks::value(transparent)]
pub struct RuntimeVersions(#[turbo_tasks(trace_ignore)] pub Versions);

#[turbo_tasks::function]
pub async fn get_current_nodejs_version(env: Vc<Box<dyn ProcessEnv>>) -> Result<Vc<String>> {
    let path_read = env.read("PATH".to_string()).await?;
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
            .to_owned(),
    ))
}
