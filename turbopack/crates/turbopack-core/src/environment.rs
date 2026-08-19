use std::{
    process::{Command, Stdio},
    str::FromStr,
};

use anyhow::{Context, Result, anyhow, bail};
use browserslist::Distrib;
use swc_core::ecma::preset_env::{Version, Versions};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::FileSystemPathOption;

use crate::target::CompileTarget;

static DEFAULT_NODEJS_VERSION: &str = "18.0.0";

#[turbo_tasks::value]
#[derive(Clone, Copy, Default, Hash, Debug)]
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

#[turbo_tasks::value(shared)]
pub enum ChunkLoading {
    Edge,
    /// CommonJS in Node.js
    NodeJs,
    /// `<script>` and `<link>` tags in the browser
    Dom,
    /// Everything inlined into one entry chunk
    SingleChunk,
}

impl ChunkLoading {
    pub fn can_split_async(&self) -> bool {
        matches!(self, ChunkLoading::NodeJs | ChunkLoading::Dom)
    }
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

#[turbo_tasks::value(task_input)]
#[derive(Debug, Hash, Clone, Copy)]
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
                Vc::default()
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
#[derive(Debug)]
#[turbo_tasks::value(transparent, serialization = "skip")]
pub struct RuntimeVersions(#[turbo_tasks(trace_ignore)] pub Versions);

/// Checks if a browser version field is either absent or at least the given version.
/// Supports major-only, major.minor, and major.minor.patch comparisons.
macro_rules! version_at_least {
    ($data:expr, $field:ident, $major:expr) => {
        $data.$field.is_none_or(|v| v.major >= $major)
    };
    ($data:expr, $field:ident, $major:expr, $minor:expr) => {
        $data
            .$field
            .is_none_or(|v| v.major > $major || (v.major == $major && v.minor >= $minor))
    };
    ($data:expr, $field:ident, $major:expr, $minor:expr, $patch:expr) => {
        $data.$field.is_none_or(|v| {
            v.major > $major
                || (v.major == $major && v.minor > $minor)
                || (v.major == $major && v.minor == $minor && v.patch >= $patch)
        })
    };
}

fn versions_support_global_this(data: &Versions) -> bool {
    version_at_least!(data, chrome, 71)
        && version_at_least!(data, opera, 58)
        && version_at_least!(data, edge, 79)
        && version_at_least!(data, firefox, 65)
        && version_at_least!(data, safari, 12, 1)
        && version_at_least!(data, node, 12)
        && version_at_least!(data, deno, 1)
        && version_at_least!(data, ios, 12, 2)
        && version_at_least!(data, samsung, 10)
        && version_at_least!(data, rhino, 1, 7, 14)
        && version_at_least!(data, opera_mobile, 50)
        && version_at_least!(data, electron, 5)
}

#[turbo_tasks::value_impl]
impl RuntimeVersions {
    /// Whether the environment supports `globalThis`.
    #[turbo_tasks::function]
    pub fn supports_global_this(&self) -> Vc<bool> {
        // https://github.com/zloirock/core-js/blob/84e45fba098dd3a177d5cf2247d06ab8e98d3790/packages/core-js-compat/src/data.mjs#L689-L695
        // "chrome": "71",
        // "opera": "58",
        // "edge": "79",
        // "firefox": "65",
        // "safari": "12.1",
        // "node": "12",
        // "deno": "1",
        // "ios": "12.2",
        // "samsung": "10",
        // "rhino": "1.7.14",
        // "opera_mobile": "50",
        // "electron": "5"
        Vc::cell(versions_support_global_this(&self.0))
    }

    /// Whether the environment supports arrow functions.
    #[turbo_tasks::function]
    pub fn supports_arrow_functions(&self) -> Vc<bool> {
        // https://github.com/babel/babel/blob/b0e3517dc566880e76b5f1f4dcf7fcecba58337d/packages/babel-compat-data/data/plugins.json#L363-L376
        // "chrome": "47",
        // "opera": "34",
        // "edge": "13",
        // "firefox": "43",
        // "safari": "10",
        // "node": "6",
        // "deno": "1",
        // "ios": "10",
        // "samsung": "5",
        // "rhino": "1.7.13",
        // "opera_mobile": "34",
        // "electron": "0.36"
        let data = &self.0;
        let supported = data.chrome.is_none_or(|v| v.major >= 47)
            && data.opera.is_none_or(|v| v.major >= 34)
            && data.edge.is_none_or(|v| v.major >= 13)
            && data.firefox.is_none_or(|v| v.major >= 43)
            && data.safari.is_none_or(|v| v.major >= 10)
            && data.node.is_none_or(|v| v.major >= 6)
            && data.deno.is_none_or(|v| v.major >= 1)
            && data.ios.is_none_or(|v| v.major >= 10)
            && data.samsung.is_none_or(|v| v.major >= 5)
            && data.rhino.is_none_or(|v| {
                v.major > 1
                    || (v.major == 1 && v.minor > 7)
                    || (v.major == 1 && v.minor == 7 && v.patch >= 13)
            })
            && data.opera_mobile.is_none_or(|v| v.major >= 34)
            && data.electron.is_none_or(|v| v.major > 0 || v.minor >= 36);

        Vc::cell(supported)
    }

    /// Whether the environment supports block scoping (let/const).
    #[turbo_tasks::function]
    pub fn supports_block_scoping(&self) -> Vc<bool> {
        // https://github.com/babel/babel/blob/b0e3517dc566880e76b5f1f4dcf7fcecba58337d/packages/babel-compat-data/data/plugins.json#L538
        // "chrome": "50",
        // "opera": "37",
        // "edge": "14",
        // "firefox": "53",
        // "safari": "11",
        // "node": "6",
        // "deno": "1",
        // "ios": "11",
        // "samsung": "5",
        // "opera_mobile": "37",
        // "electron": "1.1"
        let data = &self.0;
        let supported = data.chrome.is_none_or(|v| v.major >= 50)
            && data.opera.is_none_or(|v| v.major >= 37)
            && data.edge.is_none_or(|v| v.major >= 14)
            && data.firefox.is_none_or(|v| v.major >= 53)
            && data.safari.is_none_or(|v| v.major >= 11)
            && data.node.is_none_or(|v| v.major >= 6)
            && data.deno.is_none_or(|v| v.major >= 1)
            && data.ios.is_none_or(|v| v.major >= 11)
            && data.samsung.is_none_or(|v| v.major >= 5)
            && data.opera_mobile.is_none_or(|v| v.major >= 37)
            && data
                .electron
                .is_none_or(|v| v.major > 1 || (v.major == 1 && v.minor >= 1));

        Vc::cell(supported)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_global_this_support_for_ios_targets() {
        let ios_12_1 = Versions {
            ios: Some(Version::from_str("12.1").unwrap()),
            ..Default::default()
        };
        let ios_12_2 = Versions {
            ios: Some(Version::from_str("12.2").unwrap()),
            ..Default::default()
        };

        assert!(!versions_support_global_this(&ios_12_1));
        assert!(versions_support_global_this(&ios_12_2));
    }
}
