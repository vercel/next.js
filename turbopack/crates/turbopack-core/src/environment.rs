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
    Ok(resolve_browserslist_query(
        &browser_env.await?.browserslist_query,
    )?)
}

/// Resolve a browserslist query against the bundled browser compat data.
///
/// Next.js resolves the user's browserslist config on the JS side (with a frequently updated
/// `caniuse-lite`) and passes the result here as a comma-separated list of concrete
/// `<name> <version>` items. The bundled Rust-side `browserslist-data` snapshot is usually
/// older, so a concrete version can be unknown here even though the browser exists (e.g.
/// `chrome 154` when the data ends at 153). Dropping such versions (the legacy
/// `ignore_unknown_versions` behavior) can empty the whole result, which downstream readers
/// (SWC preset-env via `Targets::Versions`) interpret as "any target" and enable every compat
/// transform — silently downleveling modern output to ES5.
///
/// For concrete `<name> <version>` lists, clamp a version that is newer than everything in the
/// bundled data to the newest version of that browser in the data (counting released *and*
/// unreleased entries). Versions that are unknown but below the newest known one keep the
/// legacy behavior and are silently dropped, as do unknown node versions. Any other query
/// shape (ranges, percentages, combinators, …) keeps the legacy resolution behavior unchanged.
fn resolve_browserslist_query(query: &str) -> Result<Vec<Distrib>, browserslist::Error> {
    let items: Vec<&str> = query.split(',').map(str::trim).collect();
    let is_concrete_list = items.iter().all(|item| {
        let mut parts = item.split_whitespace();
        parts.next().is_some_and(|name| !name.is_empty())
            && parts.next().is_some_and(|version| !version.is_empty())
            && parts.next().is_none()
    });
    if !is_concrete_list {
        return legacy(query);
    }

    // Fast path: every version is known to the bundled data. This is the common case, so
    // resolve the whole list at once instead of probing each item below.
    match browserslist::resolve(
        items.iter(),
        &browserslist::Opts {
            ignore_unknown_versions: false,
            ..Default::default()
        },
    ) {
        Ok(distribs) => return Ok(distribs),
        Err(browserslist::Error::UnknownBrowserVersion(..))
        | Err(browserslist::Error::UnknownNodejsVersion(_)) => {}
        Err(e) => return Err(e),
    }

    // Recovery: clamp or drop the unknown versions, item by item.
    let mut corrected: Vec<String> = Vec::with_capacity(items.len());
    for item in items {
        match browserslist::resolve(
            [item],
            &browserslist::Opts {
                ignore_unknown_versions: false,
                ..Default::default()
            },
        ) {
            Ok(_) => corrected.push(item.to_string()),
            Err(browserslist::Error::UnknownBrowserVersion(name, version)) => {
                if let Some(clamp) = newest_known_clamp(&name, &version) {
                    corrected.push(clamp);
                }
                // Otherwise the version is unknown but not newer than the bundled data:
                // silently drop the item, matching `ignore_unknown_versions`.
            }
            // Unknown node.js versions are silently ignored, matching
            // `ignore_unknown_versions`.
            Err(browserslist::Error::UnknownNodejsVersion(_)) => {}
            Err(e) => return Err(e),
        }
    }
    if corrected.is_empty() {
        // Every item was dropped: same outcome as the legacy behavior.
        return Ok(vec![]);
    }
    // Every corrected item resolved successfully on its own above, so the combined query
    // cannot fail; resolving it as one query keeps union/sort/dedup identical to a direct
    // `browserslist::resolve` of the original list.
    browserslist::resolve(
        corrected,
        &browserslist::Opts {
            ignore_unknown_versions: false,
            ..Default::default()
        },
    )
}

/// Legacy resolution behavior: unknown versions are silently dropped.
fn legacy(query: &str) -> Result<Vec<Distrib>, browserslist::Error> {
    browserslist::resolve(
        query.split(','),
        &browserslist::Opts {
            ignore_unknown_versions: true,
            ..Default::default()
        },
    )
}

/// Returns a concrete `<name> <version>` clamp item when `version` is newer than the newest
/// version of `name` in the bundled compat data, and `None` otherwise (including when the
/// versions can't be determined or compared).
///
/// The newest in-data version counts released *and* unreleased entries: `last 1 <name>
/// version` only considers released versions, so `unreleased <name> versions` has to be
/// included to find versions that are present in the data but not yet released.
fn newest_known_clamp(name: &str, version: &str) -> Option<String> {
    let mut newest: Option<(Version, String)> = None;
    for query in [
        format!("last 1 {name} version"),
        format!("unreleased {name} versions"),
    ] {
        if let Ok(distribs) = browserslist::resolve(
            [&query],
            &browserslist::Opts {
                ignore_unknown_versions: true,
                ..Default::default()
            },
        ) {
            for distrib in distribs {
                // Joined versions like `16.6-16.7` compare by their lower bound, matching
                // `Versions::parse_versions`. Unparseable versions (e.g. `safari tp`) can't
                // be compared, so they are never clamp targets.
                if let Some(candidate) = distrib
                    .version()
                    .split('-')
                    .next()
                    .and_then(|v| v.parse::<Version>().ok())
                    && newest
                        .as_ref()
                        .is_none_or(|(current, _)| candidate > *current)
                {
                    newest = Some((candidate, distrib.version().to_string()));
                }
            }
        }
    }
    let (known, known_version) = newest?;
    let requested: Version = version.split('-').next()?.parse().ok()?;
    (requested > known).then(|| format!("{name} {known_version}"))
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

#[turbo_tasks::value_impl]
impl RuntimeVersions {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn resolve(query: &str) -> Result<Vec<(String, String)>, browserslist::Error> {
        resolve_browserslist_query(query).map(|distribs| {
            distribs
                .iter()
                .map(|d| (d.name().to_string(), d.version().to_string()))
                .collect()
        })
    }

    /// The newest version of `name` in the bundled data, counting released *and* unreleased
    /// entries. (`last 1 <name> version` alone would only consider released versions.)
    fn newest_in_data(name: &str) -> (String, String) {
        let mut candidates: Vec<(String, String)> = vec![];
        for query in [
            format!("last 1 {name} version"),
            format!("unreleased {name} versions"),
        ] {
            if let Ok(distribs) = browserslist::resolve([&query], &browserslist::Opts::default()) {
                candidates.extend(
                    distribs
                        .iter()
                        .map(|d| (d.name().to_string(), d.version().to_string())),
                );
            }
        }
        candidates
            .into_iter()
            .max_by_key(|(_, version)| {
                version
                    .split('-')
                    .next()
                    .and_then(|v| v.parse::<Version>().ok())
            })
            .unwrap()
    }

    /// A concrete version newer than anything in the bundled data clamps to the newest version
    /// of that browser in the data (including unreleased entries) instead of being silently
    /// dropped. On current data this distinguishes the clamp target (chrome 153, unreleased)
    /// from the newest *released* version (`last 1 chrome version`, chrome 150).
    #[test]
    fn clamps_unknown_newer_version_to_newest_in_data() {
        let newest = newest_in_data("chrome");
        let clamped = resolve("chrome 99999").unwrap();
        assert_eq!(clamped, vec![newest]);
    }

    /// Clamping applies per item in a concrete list.
    #[test]
    fn clamps_mixed_list() {
        let newest = newest_in_data("chrome");
        let resolved = resolve("chrome 99999, safari 16.4").unwrap();
        assert_eq!(
            resolved,
            vec![newest, ("safari".to_string(), "16.4".to_string())]
        );
    }

    /// Known versions resolve exactly as before.
    #[test]
    fn known_version_unchanged() {
        assert_eq!(
            resolve("chrome 102").unwrap(),
            vec![("chrome".to_string(), "102".to_string())]
        );
    }

    /// A version that is in the data but marked unreleased resolves to itself (it is known,
    /// so it is neither clamped nor dropped). Chrome 153 is unreleased in the current data;
    /// should a data bump mark it released, this test still holds.
    #[test]
    fn known_unreleased_version_unchanged() {
        assert_eq!(
            resolve("chrome 153").unwrap(),
            vec![("chrome".to_string(), "153".to_string())]
        );
    }

    /// A version that is unknown but below the newest known one is still silently dropped.
    #[test]
    fn unknown_version_below_max_is_dropped() {
        // `ie 1` is not in the bundled data (data starts at 5.5), and 1 < 11.
        assert_eq!(resolve("ie 1").unwrap(), Vec::<(String, String)>::new());
    }

    /// Unknown browser names still error.
    #[test]
    fn unknown_browser_errors() {
        assert!(matches!(
            resolve("notabrowser 99"),
            Err(browserslist::Error::BrowserNotFound(_))
        ));
    }

    /// Malformed queries still error.
    #[test]
    fn malformed_query_errors() {
        assert!(matches!(resolve("%%%"), Err(browserslist::Error::Nom(_))));
    }

    /// Unknown node versions are still silently ignored.
    #[test]
    fn unknown_node_version_ignored() {
        assert_eq!(
            resolve("node 99.99.99").unwrap(),
            Vec::<(String, String)>::new()
        );
    }

    /// Unknown electron versions still error.
    #[test]
    fn unknown_electron_version_errors() {
        assert!(matches!(
            resolve("electron 999.0"),
            Err(browserslist::Error::UnknownElectronVersion(_))
        ));
    }

    /// Non-concrete query shapes keep the legacy behavior: no clamping.
    #[test]
    fn non_concrete_query_not_clamped() {
        assert_eq!(
            resolve("chrome >= 99999").unwrap(),
            Vec::<(String, String)>::new()
        );
        assert!(!resolve("last 1 chrome version").unwrap().is_empty());
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
