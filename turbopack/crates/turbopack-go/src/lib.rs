#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

//! Native Go file inputs. Discovery and compilation run in the original project; Turbo Tasks
//! records their filesystem dependencies and validates inputs across each external command.
mod inputs;
mod paths;
mod process;

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{
        LazyLock,
        atomic::{AtomicUsize, Ordering},
    },
};

use anyhow::{Context, Result, ensure};
use bincode::{Decode, Encode};
use serde::Deserialize;
use tokio::{process::Command, sync::Semaphore};
use tokio_util::sync::CancellationToken;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Invalidator, NonLocalValue, ResolvedVc, TransientInstance, Vc, get_invalidator,
    trace::TraceRawVcs, turbo_tasks,
};
use turbo_tasks_fs::{DiskFileSystem, File, FileContent, FileSystemPath, Permissions, to_sys_path};

use crate::inputs::{FileInput, Inputs, Tracker, directory};
pub use crate::paths::{paths_refer_to_same_file, validate_source_path};

#[derive(Debug, TraceRawVcs)]
pub struct Cancellation {
    #[turbo_tasks(trace_ignore)]
    token: CancellationToken,
    #[turbo_tasks(trace_ignore)]
    lists: AtomicUsize,
    #[turbo_tasks(trace_ignore)]
    builds: AtomicUsize,
    #[turbo_tasks(trace_ignore)]
    module_configs: AtomicUsize,
}
// Session cancellation and counters contain no task values or references.
unsafe impl NonLocalValue for Cancellation {}

/// Resolved host toolchain and build options. Changing the installed toolchain requires a new
/// session. Versioned modules use the normal Go module cache, with downloads disabled during
/// builds.
#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, TraceRawVcs, Encode)]
pub struct GoBuildContext {
    pub go: RcStr,
    pub goroot: RcStr,
    pub version: RcStr,
    pub goos: RcStr,
    pub goarch: RcStr,
    pub exe_suffix: RcStr,
    pub cache: RcStr,
    pub module_cache: RcStr,
    pub gopath: RcStr,
    pub path: RcStr,
    pub tags: RcStr,
    pub cancellation: TransientInstance<Cancellation>,
}

// A live build session cannot be restored from a persistent task cache.
impl<C> Decode<C> for GoBuildContext {
    fn decode<D: bincode::de::Decoder<Context = C>>(
        _: &mut D,
    ) -> std::result::Result<Self, bincode::error::DecodeError> {
        Err(bincode::error::DecodeError::Other(
            "Go build sessions are transient",
        ))
    }
}

impl GoBuildContext {
    pub async fn host(go: &Path, cache: Option<&Path>, tags: &str) -> Result<Self> {
        let go = if go.components().count() == 1 && !go.is_absolute() {
            let name = if go.extension().is_none() {
                PathBuf::from(format!("{}{}", go.display(), std::env::consts::EXE_SUFFIX))
            } else {
                go.to_owned()
            };
            std::env::var_os("PATH")
                .into_iter()
                .flat_map(|path| std::env::split_paths(&path).collect::<Vec<_>>())
                .map(|directory| directory.join(&name))
                .find(|candidate| candidate.is_file())
                .context("Go not found on PATH; install Go 1.24 or newer or use --go")?
        } else {
            go.to_owned()
        };
        let go = std::fs::canonicalize(go).context("resolving the Go executable")?;
        let token = CancellationToken::new();
        let mut command = Command::new(&go);
        command
            .env("GOENV", "off")
            .env("GOTOOLCHAIN", "local")
            .env("GOWORK", "off")
            .args([
                "env",
                "-json",
                "GOROOT",
                "GOVERSION",
                "GOHOSTOS",
                "GOHOSTARCH",
                "GOEXE",
                "GOCACHE",
                "GOMODCACHE",
                "GOPATH",
            ]);
        let report = process::output(command, &token).await?;
        ensure!(
            report.status.success(),
            "unable to query Go: {}",
            String::from_utf8_lossy(&report.stderr)
        );
        let env: BTreeMap<String, String> = serde_json::from_slice(&report.stdout)?;
        let version = env
            .get("GOVERSION")
            .context("Go did not report its version")?;
        let minor = version
            .strip_prefix("go1.")
            .and_then(|v| v.split('.').next())
            .and_then(|v| v.parse::<u32>().ok());
        ensure!(
            minor.is_some_and(|v| v >= 24),
            "Go 1.24 or newer is required (found {version})"
        );
        let goroot = std::fs::canonicalize(env.get("GOROOT").context("Go did not report GOROOT")?)?;
        let custom_cache = cache.is_some();
        let cache = cache
            .map(Path::to_owned)
            .unwrap_or_else(|| PathBuf::from(&env["GOCACHE"]));
        let module_cache = PathBuf::from(&env["GOMODCACHE"]);
        ensure!(
            !custom_cache
                || !std::fs::symlink_metadata(&cache)
                    .is_ok_and(|metadata| metadata.file_type().is_symlink()),
            "Go build cache symlinks are unsupported: {}",
            cache.display()
        );
        std::fs::create_dir_all(&module_cache)?;
        let mut path = vec![goroot.join("bin")];
        path.extend(
            std::env::var_os("PATH")
                .into_iter()
                .flat_map(|p| std::env::split_paths(&p).collect::<Vec<_>>()),
        );
        Ok(Self {
            go: go.to_str().context("non-UTF8 Go executable")?.into(),
            goroot: goroot.to_str().context("non-UTF8 GOROOT")?.into(),
            version: version.as_str().into(),
            goos: env["GOHOSTOS"].as_str().into(),
            goarch: env["GOHOSTARCH"].as_str().into(),
            exe_suffix: if env["GOHOSTOS"] == "windows" {
                rcstr!(".exe")
            } else {
                rcstr!("")
            },
            cache: paths::resolve_directory(&cache)?
                .to_str()
                .context("non-UTF8 Go cache")?
                .into(),
            module_cache: std::fs::canonicalize(module_cache)?
                .to_str()
                .context("non-UTF8 module cache")?
                .into(),
            gopath: env["GOPATH"].as_str().into(),
            path: std::env::join_paths(path)?
                .to_str()
                .context("non-UTF8 PATH")?
                .into(),
            tags: tags.into(),
            cancellation: TransientInstance::new(Cancellation {
                token,
                lists: AtomicUsize::new(0),
                builds: AtomicUsize::new(0),
                module_configs: AtomicUsize::new(0),
            }),
        })
    }

    pub fn cancel(&self) {
        self.cancellation.token.cancel();
    }
    pub async fn cancelled(&self) {
        self.cancellation.token.cancelled().await;
    }
    pub fn is_cancelled(&self) -> bool {
        self.cancellation.token.is_cancelled()
    }

    fn command(&self, directory: &Path) -> Command {
        let mut command = Command::new(self.go.as_str());
        command
            .current_dir(directory)
            .env_clear()
            .env("PATH", self.path.as_str())
            .env("GOROOT", self.goroot.as_str())
            .env("GOOS", self.goos.as_str())
            .env("GOARCH", self.goarch.as_str())
            .env("CGO_ENABLED", "0")
            .env("GOENV", "off")
            .env("GOTOOLCHAIN", "local")
            .env("GOWORK", "off")
            .env("GOPROXY", "off")
            .env("GOSUMDB", "off")
            .env("GOVCS", "*:off")
            .env("GOCACHE", self.cache.as_str())
            .env("GOMODCACHE", self.module_cache.as_str())
            .env("GOPATH", self.gopath.as_str())
            .env("GOTELEMETRY", "off");
        #[cfg(windows)]
        for name in ["SystemRoot", "TEMP", "TMP"] {
            if let Some(value) = std::env::var_os(name) {
                command.env(name, value);
            }
        }
        command
    }

    /// Discovery/compiler invocation attempts in this session, including retries.
    /// These counters do not write files or affect task memoization.
    pub fn invocation_counts(&self) -> (usize, usize) {
        (
            self.cancellation.lists.load(Ordering::Relaxed),
            self.cancellation.builds.load(Ordering::Relaxed),
        )
    }

    /// Go module-configuration subprocess attempts, excluding standalone inputs without go.mod.
    pub fn module_configuration_invocations(&self) -> usize {
        self.cancellation.module_configs.load(Ordering::Relaxed)
    }
}

#[turbo_tasks::function(operation, root)]
pub fn filesystem(path: RcStr) -> Vc<DiskFileSystem> {
    DiskFileSystem::new(rcstr!("go"), Vc::cell(path))
}

#[derive(Deserialize, Default, Debug, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
struct Package {
    #[serde(default)]
    dir: String,
    #[serde(default)]
    import_path: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    standard: bool,
    module: Option<Module>,
    #[serde(default)]
    go_files: Vec<String>,
    #[serde(default)]
    ignored_go_files: Vec<String>,
    #[serde(default)]
    invalid_go_files: Vec<String>,
    #[serde(default)]
    embed_files: Vec<String>,
    #[serde(default)]
    embed_patterns: Vec<String>,
    #[serde(default)]
    imports: Vec<String>,
    #[serde(default)]
    cgo_files: Vec<String>,
    #[serde(default)]
    s_files: Vec<String>,
    #[serde(default)]
    syso_files: Vec<String>,
    error: Option<serde_json::Value>,
    #[serde(default)]
    deps_errors: Vec<serde_json::Value>,
    #[serde(default)]
    incomplete: bool,
    #[serde(default)]
    dep_only: bool,
}

#[derive(Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
struct Module {
    #[serde(default)]
    path: String,
    #[serde(default)]
    main: bool,
    #[serde(default)]
    go_mod: String,
    replace: Option<serde_json::Value>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "PascalCase")]
struct ModuleConfig {
    module: Option<Module>,
    replace: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    require: Vec<Requirement>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Requirement {
    path: String,
    version: String,
}

// Go's module cache escapes uppercase ASCII as ! followed by its lowercase form.
fn module_escape(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        if ch.is_ascii_uppercase() {
            escaped.push('!');
            escaped.push(ch.to_ascii_lowercase());
        } else {
            escaped.push(ch);
        }
    }
    escaped
}

#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, TraceRawVcs, Encode, Decode)]
struct BuildPlan {
    files: Vec<RcStr>,
    inputs: Inputs,
}

#[turbo_tasks::value(shared)]
struct Discovery {
    outcome: DiscoveryOutcome,
    inputs: Inputs,
}

#[turbo_tasks::value(shared)]
enum DiscoveryOutcome {
    Ready(BuildPlan),
    Failed(RcStr),
    Retry,
    Cancelled,
}

static GO_ACTIONS: LazyLock<Semaphore> = LazyLock::new(|| Semaphore::new(2));

/// Go parses module configuration. Key the subprocess by go.mod's recorded fingerprint so
/// unrelated source edits reuse its result. Including live stamps also lets discovery retry
/// this query if go.mod changes while the command runs, even if its contents are restored.
#[turbo_tasks::function]
async fn module_configuration(
    project: RcStr,
    input: FileInput,
    context: GoBuildContext,
) -> Result<Vc<RcStr>> {
    if !input.exists() {
        return Ok(Vc::cell(rcstr!("{}")));
    }
    let mut command = context.command(Path::new(project.as_str()));
    context
        .cancellation
        .module_configs
        .fetch_add(1, Ordering::Relaxed);
    command.args(["mod", "edit", "-json"]);
    let report = process::output(command, &context.cancellation.token).await?;
    ensure!(
        report.status.success(),
        "{}",
        diagnostic(&report.stderr, Path::new(project.as_str()))
    );
    Ok(Vc::cell(String::from_utf8(report.stdout)?.into()))
}

fn arguments(files: &[RcStr]) -> Vec<String> {
    files
        .iter()
        .map(|file| {
            format!(
                "./{}",
                Path::new(file.as_str())
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
            )
        })
        .collect()
}

fn entry_directory(project: &Path, files: &[RcStr]) -> Result<PathBuf> {
    ensure!(!files.is_empty(), "supply at least one .go input file");
    let directory = Path::new(files[0].as_str())
        .parent()
        .context("input has no directory")?;
    for file in files {
        let path = Path::new(file.as_str());
        ensure!(
            !path.is_absolute()
                && path
                    .components()
                    .all(|p| matches!(p, std::path::Component::Normal(_)))
                && path.extension().is_some_and(|ext| ext == "go"),
            "Go inputs must be project-relative .go filenames: {file}"
        );
        ensure!(
            path.parent() == Some(directory),
            "Go input files must share one directory"
        );
    }
    Ok(project.join(directory).components().collect())
}

async fn list(directory: &Path, files: &[RcStr], context: &GoBuildContext) -> Result<Vec<Package>> {
    context.cancellation.lists.fetch_add(1, Ordering::Relaxed);
    let mut command = context.command(directory);
    command
        .args([
            "list",
            "-deps",
            "-json=Dir,ImportPath,Name,Standard,Module,GoFiles,IgnoredGoFiles,InvalidGoFiles,\
             EmbedFiles,EmbedPatterns,Imports,CgoFiles,SFiles,SysoFiles,Error,DepsErrors,\
             Incomplete,DepOnly",
            "-e",
            "-mod=readonly",
            "-buildvcs=false",
            "-trimpath",
        ])
        .arg(format!("-tags={}", context.tags))
        .args(arguments(files));
    let report = process::output(command, &context.cancellation.token).await?;
    ensure!(
        report.status.success(),
        "{}",
        diagnostic(&report.stderr, directory)
    );
    Ok(serde_json::Deserializer::from_slice(&report.stdout)
        .into_iter::<Package>()
        .collect::<std::result::Result<_, _>>()?)
}

fn diagnostic(bytes: &[u8], directory: &Path) -> String {
    String::from_utf8_lossy(bytes)
        .lines()
        .map(|line| {
            if let Some(end) = line.find(".go:") {
                let name = &line[..end + 3];
                if !Path::new(name).is_absolute() && !name.contains(' ') {
                    return format!("{}{}", directory.join(name).display(), &line[end + 3..]);
                }
            }
            line.to_owned()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

async fn observe_packages(
    tracker: &mut Tracker<'_>,
    packages: &[Package],
    project: &Path,
    module: &str,
) -> Result<()> {
    for pkg in packages {
        if pkg.standard {
            continue;
        }
        // Track unresolved local imports and their nearest existing ancestors, so creation of a
        // previously missing package invalidates discovery without walking unrelated subtrees.
        for import in pkg.imports.iter().chain(std::iter::once(&pkg.import_path)) {
            if let Some(relative) = import
                .strip_prefix(module)
                .and_then(|p| p.strip_prefix('/'))
                .filter(|_| !module.is_empty())
            {
                tracker.parents(&project.join(relative)).await?;
            }
        }
        if pkg.dir.is_empty() {
            continue;
        }
        let dir = Path::new(&pkg.dir);
        tracker.dir(dir).await?;
        if let Some(module) = &pkg.module {
            ensure!(
                module.replace.is_none(),
                "Go module replacements are not supported in this release"
            );
            if !module.go_mod.is_empty() {
                tracker.file(Path::new(&module.go_mod)).await?;
            }
        }
        for file in pkg
            .go_files
            .iter()
            .chain(&pkg.embed_files)
            .chain(&pkg.ignored_go_files)
            .chain(&pkg.invalid_go_files)
        {
            tracker.file(&dir.join(file)).await?;
        }
        // Go embed patterns may gain matches in directories not yet containing a selected file.
        // Observe directory inventories only underneath each pattern's fixed prefix.
        tracker
            .inputs
            .embed_patterns
            .entry(pkg.dir.as_str().into())
            .or_default()
            .extend(
                pkg.embed_patterns
                    .iter()
                    .map(|pattern| pattern.as_str().into()),
            );
        for pattern in &pkg.embed_patterns {
            let pattern = pattern.strip_prefix("all:").unwrap_or(pattern);
            let mut prefix = PathBuf::new();
            for part in pattern.split('/') {
                if part.contains(['*', '?', '[']) {
                    break;
                }
                prefix.push(part);
            }
            let base = dir.join(prefix);
            if base.is_dir() {
                tracker.tree(&base).await?;
            } else {
                if pattern.contains(['*', '?', '[']) {
                    tracker.tree(base.parent().unwrap_or(dir)).await?;
                } else {
                    tracker.parents(base.parent().unwrap_or(dir)).await?;
                }
            }
        }
    }
    Ok(())
}

#[turbo_tasks::function]
async fn discover(
    root: FileSystemPath,
    files: Vec<RcStr>,
    context: GoBuildContext,
) -> Result<Vc<Discovery>> {
    let _permit = tokio::select! {
        permit = GO_ACTIONS.acquire() => permit?,
        _ = context.cancellation.token.cancelled() => return Ok(Discovery { outcome: DiscoveryOutcome::Cancelled, inputs: Inputs::default() }.cell()),
    };
    let project = to_sys_path(root.clone())
        .await?
        .context("Go inputs require a disk filesystem")?;
    let mut tracker = Tracker::new(&root, &project, &context);
    let run = async {
        let build_cache = Path::new(context.cache.as_str());
        ensure!(
            !paths::directories_overlap(build_cache, &project)?
                && !paths::directories_overlap(
                    build_cache,
                    Path::new(context.module_cache.as_str())
                )?,
            "Go build cache must be outside the source project and module cache; choose another \
             --go-cache path"
        );
        std::fs::create_dir_all(build_cache)?;
        let directory = entry_directory(&project, &files)?;
        tracker.parents(&directory).await?;
        for file in &files {
            tracker.file(&project.join(file.as_str())).await?;
        }
        for file in ["go.mod", "go.sum", "go.work", "go.work.sum"] {
            tracker.file(&project.join(file)).await?;
        }
        if tracker.dirty || !tracker.inputs.is_current()? {
            return Ok(None);
        }
        ensure!(
            !project.join("go.work").exists(),
            "Go workspaces are not supported in this release"
        );
        let config = module_configuration(
            project.to_str().context("non-UTF8 Go project")?.into(),
            tracker.inputs.files[project.join("go.mod").to_str().unwrap()].clone(),
            context.clone(),
        )
        .await?;
        let config: ModuleConfig = serde_json::from_str(&config)?;
        ensure!(
            config.replace.as_ref().is_none_or(Vec::is_empty),
            "Go module replacements are not supported in this release"
        );
        // Even an unresolved dependency needs cache dependencies. Downloading a module can
        // repair it without changing go.mod/go.sum, so retain reads for its future cache entries.
        let cache = Path::new(context.module_cache.as_str());
        for requirement in &config.require {
            ensure!(
                Path::new(&requirement.path)
                    .components()
                    .all(|part| matches!(part, std::path::Component::Normal(_)))
                    && !requirement.version.contains(['/', '\\']),
                "invalid Go module requirement path"
            );
            let path = module_escape(&requirement.path);
            let version = module_escape(&requirement.version);
            tracker
                .parents(&cache.join(format!("{path}@{version}")))
                .await?;
            let download = cache.join("cache/download").join(path).join("@v");
            tracker
                .file(&download.join(format!("{version}.mod")))
                .await?;
            tracker
                .file(&download.join(format!("{version}.ziphash")))
                .await?;
        }
        let module = config.module.as_ref().map_or("", |m| m.path.as_str());
        let registered = (tracker.inputs.files.len(), tracker.inputs.directories.len());
        let packages = list(&directory, &files, &context).await?;
        observe_packages(&mut tracker, &packages, &project, module).await?;
        // Newly discovered files/directories were not guarded during the first command.
        // Only that registration window needs a second Go scan. For named files importing
        // only standard packages, all mutable inputs were already registered above.
        let added_inputs =
            registered != (tracker.inputs.files.len(), tracker.inputs.directories.len());
        let structure_changed = !tracker.dirty
            && added_inputs
            && packages != list(&directory, &files, &context).await?;
        if tracker.dirty || structure_changed || !tracker.inputs.is_current()? {
            return Ok(None);
        }
        let mut main = false;
        for pkg in &packages {
            ensure!(
                pkg.error.is_none() && pkg.deps_errors.is_empty() && !pkg.incomplete,
                "{}",
                pkg.error
                    .as_ref()
                    .or_else(|| pkg.deps_errors.first())
                    .map_or_else(
                        || format!("incomplete Go package: {}", pkg.import_path),
                        |e| {
                            e.get("Err")
                                .and_then(serde_json::Value::as_str)
                                .unwrap_or("Go dependency discovery failed")
                                .to_owned()
                        }
                    )
            );
            if pkg.standard {
                continue;
            }
            ensure!(
                pkg.cgo_files.is_empty() && pkg.s_files.is_empty() && pkg.syso_files.is_empty(),
                "only pure-Go dependencies are supported: {}",
                pkg.import_path
            );
            if !pkg.dep_only {
                ensure!(
                    pkg.name == "main" && !main,
                    "Go inputs must form one package main"
                );
                main = true;
            }
        }
        ensure!(main, "Go inputs must define package main");
        Ok::<_, anyhow::Error>(Some(BuildPlan {
            files: files.clone(),
            inputs: tracker.inputs.compiler_inputs(),
        }))
    }
    .await;
    let outcome = match run {
        Ok(None) => {
            tracker.invalidate().await?;
            if let Some(invalidator) = get_invalidator() {
                invalidator.invalidate(&*turbo_tasks());
            }
            DiscoveryOutcome::Retry
        }
        Ok(Some(plan)) => DiscoveryOutcome::Ready(plan),
        Err(_) if context.is_cancelled() => DiscoveryOutcome::Cancelled,
        Err(error) => DiscoveryOutcome::Failed(format!("{error:#}").into()),
    };
    Ok(Discovery {
        outcome,
        inputs: tracker.inputs,
    }
    .cell())
}

#[turbo_tasks::value(shared)]
enum Compilation {
    Success(ResolvedVc<FileContent>),
    Failed(RcStr),
    Retry(Option<Invalidator>),
    Cancelled,
}

#[turbo_tasks::function]
async fn compile(
    project: RcStr,
    plan: BuildPlan,
    context: GoBuildContext,
) -> Result<Vc<Compilation>> {
    let _permit = tokio::select! {
        permit = GO_ACTIONS.acquire() => permit?,
        _ = context.cancellation.token.cancelled() => return Ok(Compilation::Cancelled.cell()),
    };
    let directory = entry_directory(Path::new(project.as_str()), &plan.files)?;
    if !plan.inputs.is_current()? {
        return Ok(Compilation::Retry(get_invalidator()).cell());
    }
    let before: BTreeMap<_, _> = plan
        .inputs
        .directories
        .keys()
        .map(|path| Ok((path.clone(), directory_input(path)?)))
        .collect::<Result<_>>()?;
    let temp = tempfile::Builder::new()
        .prefix("turbopack-go-output-")
        .tempdir()?;
    let executable = temp.path().join(format!("program{}", context.exe_suffix));
    context.cancellation.builds.fetch_add(1, Ordering::Relaxed);
    let mut command = context.command(&directory);
    command
        .args(["build", "-mod=readonly", "-buildvcs=false", "-trimpath"])
        .arg(format!("-tags={}", context.tags))
        .arg("-o")
        .arg(&executable)
        .args(arguments(&plan.files));
    let report = match process::output(command, &context.cancellation.token).await {
        Err(_) if context.is_cancelled() => return Ok(Compilation::Cancelled.cell()),
        Err(error) => return Ok(Compilation::Failed(format!("{error:#}").into()).cell()),
        Ok(report) => report,
    };
    let after: BTreeMap<_, _> = plan
        .inputs
        .directories
        .keys()
        .map(|path| Ok((path.clone(), directory_input(path)?)))
        .collect::<Result<_>>()?;
    if before != after || !plan.inputs.is_current()? {
        return Ok(Compilation::Retry(get_invalidator()).cell());
    }
    let outcome = if report.status.success() {
        Compilation::Success(
            FileContent::Content(
                File::from(std::fs::read(&executable)?).with_permissions(Permissions::Executable),
            )
            .cell()
            .to_resolved()
            .await?,
        )
    } else {
        Compilation::Failed(diagnostic(&report.stderr, &directory).into())
    };
    Ok(outcome.cell())
}

fn directory_input(path: &RcStr) -> Result<inputs::DirectoryInput> {
    directory(Path::new(path.as_str()))
}

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub struct GoBundleResult {
    pub outcome: GoBuildOutcome,
    inputs: Inputs,
}

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum GoBuildOutcome {
    Success(ResolvedVc<FileContent>),
    Failed(RcStr),
    Retry,
    Cancelled,
}

impl GoBundleResult {
    pub fn is_input(&self, path: &Path) -> Result<bool> {
        self.inputs.contains_input(path)
    }

    pub fn is_current(&self) -> Result<bool> {
        self.inputs.is_current()
    }
}

#[turbo_tasks::function]
async fn bundle(
    root: FileSystemPath,
    mut files: Vec<RcStr>,
    context: GoBuildContext,
) -> Result<Vc<GoBundleResult>> {
    files.sort();
    files.dedup();
    let discovery = discover(root.clone(), files, context.clone()).await?;
    let outcome = match &discovery.outcome {
        DiscoveryOutcome::Ready(plan) => {
            let project = to_sys_path(root.clone())
                .await?
                .context("Go inputs require a disk filesystem")?;
            let compiled = compile(
                project.to_str().context("non-UTF8 project")?.into(),
                plan.clone(),
                context.clone(),
            )
            .await?;
            match &*compiled {
                Compilation::Success(file) => GoBuildOutcome::Success(*file),
                Compilation::Failed(message) => GoBuildOutcome::Failed(message.clone()),
                Compilation::Cancelled => GoBuildOutcome::Cancelled,
                Compilation::Retry(retry) => {
                    if let Some(retry) = retry {
                        retry.invalidate(&*turbo_tasks());
                    }
                    Tracker::new(&root, &project, &context).invalidate().await?;
                    if let Some(invalidator) = get_invalidator() {
                        invalidator.invalidate(&*turbo_tasks());
                    }
                    GoBuildOutcome::Retry
                }
            }
        }
        DiscoveryOutcome::Failed(message) => GoBuildOutcome::Failed(message.clone()),
        DiscoveryOutcome::Retry => GoBuildOutcome::Retry,
        DiscoveryOutcome::Cancelled => GoBuildOutcome::Cancelled,
    };
    Ok(GoBundleResult {
        outcome,
        inputs: discovery.inputs.clone(),
    }
    .cell())
}

/// Named files form one native executable. Imported packages retain normal Go file selection.
#[turbo_tasks::function(operation, root)]
pub fn go_bundle(
    root: FileSystemPath,
    files: Vec<RcStr>,
    context: GoBuildContext,
) -> Vc<GoBundleResult> {
    bundle(root, files, context)
}
