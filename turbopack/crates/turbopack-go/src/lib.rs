#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

//! Native Go file inputs. Discovery and compilation run in the original project; Turbo Tasks
//! records their filesystem dependencies and validates inputs across each external command.
mod inputs;
mod paths;
mod process;

use std::{
    collections::BTreeMap,
    ops::{Deref, DerefMut},
    path::{Path, PathBuf},
    sync::{
        LazyLock,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

use anyhow::{Context, Result, ensure};
use bincode::{Decode, Encode};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::{process::Command, sync::Semaphore};
use tokio_util::sync::CancellationToken;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, Invalidator, NonLocalValue, ResolvedVc, TransientInstance, Vc, get_invalidator,
    turbo_tasks,
};
use turbo_tasks_fs::{
    DiskFileSystem, DiskFileSystemMap, DiskWatcherConfig, File, FileContent, FileSystemPath,
    Permissions, to_sys_path,
};

use crate::inputs::{FileInput, Inputs, Tracker, directory};
pub use crate::paths::{paths_refer_to_same_file, validate_source_path};

#[derive(Debug)]
pub struct Cancellation {
    token: CancellationToken,

    lists: AtomicUsize,

    builds: AtomicUsize,

    module_configs: AtomicUsize,
}
// Session cancellation and counters contain no task values or references.
unsafe impl NonLocalValue for Cancellation {}

/// Resolved host toolchain and build options. Changing the installed toolchain requires a new
/// session. Versioned modules use the normal Go module cache, with downloads disabled during
/// builds.
#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, Encode, Decode)]
pub struct GoBuildOptions {
    pub go: RcStr,
    pub goroot: RcStr,
    pub version: RcStr,
    pub toolchain_fingerprint: Vec<u8>,
    pub goos: RcStr,
    pub goarch: RcStr,
    pub exe_suffix: RcStr,
    pub cache: RcStr,
    pub module_cache: RcStr,
    pub gopath: RcStr,
    pub path: RcStr,
    pub tags: RcStr,
    /// Poll source/module-cache watchers when native filesystem events are unavailable.
    pub poll_interval_ms: Option<u64>,
}

/// Process-local lifecycle state. Root CLI tasks intentionally remain transient; persistent
/// consumers use a session whose identity contains only the resolved build options.
#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, Encode, Decode)]
pub struct GoBuildContext {
    pub options: GoBuildOptions,
    #[bincode(skip, default = "fresh_cancellation")]
    pub cancellation: TransientInstance<Cancellation>,
}

fn fresh_cancellation() -> TransientInstance<Cancellation> {
    TransientInstance::new(Cancellation {
        token: CancellationToken::new(),
        lists: AtomicUsize::new(0),
        builds: AtomicUsize::new(0),
        module_configs: AtomicUsize::new(0),
    })
}

impl Deref for GoBuildContext {
    type Target = GoBuildOptions;
    fn deref(&self) -> &Self::Target {
        &self.options
    }
}
impl DerefMut for GoBuildContext {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.options
    }
}

// Installed toolchains are immutable within a session. Hash their contents once when resolving
// the host, so restoring an identical SDK copy keeps its identity despite new timestamps/inodes.
// pkg/mod may hold an independently changing module cache and is deliberately excluded.
fn toolchain_fingerprint(go: &Path, goroot: &Path) -> Result<Vec<u8>> {
    let mut digest = Sha256::new();
    digest.update(std::fs::read(go)?);
    // GOENV=off disables user configuration, but Go still reads SDK defaults from go.env.
    // read() follows file symlinks, so the consumed target contents participate too.
    match std::fs::read(goroot.join("go.env")) {
        Ok(contents) => {
            digest.update([1]);
            digest.update((contents.len() as u64).to_le_bytes());
            digest.update(contents);
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => digest.update([0]),
        Err(error) => return Err(error).context("fingerprinting GOROOT/go.env"),
    }
    let mut pending = vec![
        goroot.join("src"),
        goroot.join("pkg/include"),
        goroot.join("pkg/tool"),
    ];
    let mut visited_directories = std::collections::BTreeSet::new();
    let mut buffer = [0u8; 64 * 1024];
    while let Some(path) = pending.pop() {
        // Follow toolchain symlinks and hash the consumed bytes; the Go installation can
        // legitimately contain links even though application-source symlinks are unsupported.
        let metadata = std::fs::metadata(&path)?;
        let relative = path.strip_prefix(goroot)?.to_string_lossy();
        digest.update((relative.len() as u64).to_le_bytes());
        digest.update(relative.as_bytes());
        if metadata.is_dir() {
            digest.update([0]);
            if !visited_directories.insert(std::fs::canonicalize(&path)?) {
                continue;
            }
            let mut entries = std::fs::read_dir(path)?
                .map(|entry| Ok(entry?.path()))
                .collect::<Result<Vec<_>>>()?;
            entries.sort();
            pending.extend(entries);
        } else {
            ensure!(
                metadata.is_file(),
                "unsupported Go toolchain input: {}",
                path.display()
            );
            digest.update([1]);
            digest.update(metadata.len().to_le_bytes());
            let mut file = std::fs::File::open(path)?;
            loop {
                let len = std::io::Read::read(&mut file, &mut buffer)?;
                if len == 0 {
                    break;
                }
                digest.update(&buffer[..len]);
            }
        }
    }
    Ok(digest.finalize().to_vec())
}

#[cfg(test)]
#[test]
fn toolchain_identity_survives_sdk_copies_and_excludes_module_caches() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let original = temp.path().join("original");
    let restored = temp.path().join("restored");
    let files = [
        ("bin/go", "go executable"),
        ("src/runtime/source.go", "runtime source"),
        ("pkg/include/textflag.h", "assembler header"),
        ("pkg/tool/host/compile", "compiler"),
    ];
    for root in [&original, &restored] {
        for (path, content) in files {
            let path = root.join(path);
            std::fs::create_dir_all(path.parent().unwrap())?;
            std::fs::write(path, content)?;
        }
    }
    let fingerprint = toolchain_fingerprint(&original.join("bin/go"), &original)?;
    let restored_fingerprint = || toolchain_fingerprint(&restored.join("bin/go"), &restored);
    assert_eq!(fingerprint, restored_fingerprint()?);
    let modules = restored.join("pkg/mod/example.com/library@v1.0.0");
    std::fs::create_dir_all(&modules)?;
    std::fs::write(modules.join("library.go"), "module cache contents")?;
    assert_eq!(fingerprint, restored_fingerprint()?);
    for (path, content) in files {
        std::fs::write(restored.join(path), format!("{content} changed"))?;
        assert_ne!(fingerprint, restored_fingerprint()?, "{path}");
        std::fs::write(restored.join(path), content)?;
        assert_eq!(fingerprint, restored_fingerprint()?);
    }
    let settings = "GOEXPERIMENT=default-experiment\n";
    std::fs::write(original.join("go.env"), settings)?;
    let with_settings = toolchain_fingerprint(&original.join("bin/go"), &original)?;
    assert_ne!(fingerprint, with_settings);
    let go_env = restored.join("go.env");
    std::fs::write(&go_env, settings)?;
    assert_eq!(with_settings, restored_fingerprint()?);
    std::fs::write(&go_env, "GOEXPERIMENT=changed-experiment\n")?;
    assert_ne!(with_settings, restored_fingerprint()?);
    std::fs::write(&go_env, "")?;
    assert_ne!(
        fingerprint,
        restored_fingerprint()?,
        "an empty go.env is present"
    );
    std::fs::remove_file(&go_env)?;
    assert_eq!(fingerprint, restored_fingerprint()?);
    #[cfg(unix)]
    {
        let target = temp.path().join("sdk-settings");
        std::fs::write(&target, settings)?;
        std::os::unix::fs::symlink(&target, &go_env)?;
        assert_eq!(with_settings, restored_fingerprint()?);
        std::fs::write(&target, "GOEXPERIMENT=changed-symlink-target\n")?;
        assert_ne!(with_settings, restored_fingerprint()?);
        std::fs::remove_file(go_env)?;
        assert_eq!(fingerprint, restored_fingerprint()?);
    }
    Ok(())
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
            options: GoBuildOptions {
                go: go.to_str().context("non-UTF8 Go executable")?.into(),
                goroot: goroot.to_str().context("non-UTF8 GOROOT")?.into(),
                version: version.as_str().into(),
                toolchain_fingerprint: toolchain_fingerprint(&go, &goroot)?,
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
                poll_interval_ms: None,
            },
            cancellation: fresh_cancellation(),
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

/// Serializable compiler identity with process-local cancellation and counters. Keep this value
/// resident so restoring other task data cannot replace an active session's lifecycle state.
#[turbo_tasks::value(evict = "never")]
pub struct GoBuildSession {
    pub context: GoBuildContext,
}
impl GoBuildSession {
    pub fn new(context: GoBuildContext) -> Vc<Self> {
        Self { context }.cell()
    }

    /// Scope must identify the lifecycle owner consistently across restarts. The caller must
    /// retain the returned value's context for cancellation, rather than the probe's context.
    pub fn persistent(scope: RcStr, options: GoBuildOptions) -> Vc<Self> {
        persistent_session(scope, options)
    }
}

#[turbo_tasks::function]
fn persistent_session(scope: RcStr, options: GoBuildOptions) -> Vc<GoBuildSession> {
    // Leading-underscore arguments are excluded from task identity by Turbo Tasks.
    // Keep this namespace in the key even though Go commands do not consume it.
    let _ = scope;
    GoBuildSession::new(GoBuildContext {
        options,
        cancellation: fresh_cancellation(),
    })
}

#[turbo_tasks::function]
fn shared_session(context: GoBuildContext) -> Vc<GoBuildSession> {
    GoBuildSession::new(context)
}

#[turbo_tasks::function(operation, root)]
pub fn filesystem(path: RcStr) -> Vc<DiskFileSystem> {
    filesystem_with_poll_interval(path, None).connect()
}

/// Use one configured filesystem identity for module-cache reads, watching and invalidation.
#[turbo_tasks::function(operation, root)]
pub fn filesystem_with_poll_interval(
    path: RcStr,
    poll_interval_ms: Option<u64>,
) -> Vc<DiskFileSystem> {
    DiskFileSystem::new_with_options(
        rcstr!("go"),
        Vc::cell(path),
        Vec::new(),
        DiskWatcherConfig {
            poll_interval: poll_interval_ms.map(Duration::from_millis),
            ..Default::default()
        },
        DiskFileSystemMap::empty(),
    )
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
    h_files: Vec<String>,
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
    // Go 1.24 emits null for an empty requirement slice.
    require: Option<Vec<Requirement>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Requirement {
    path: String,
    version: String,
}

#[cfg(test)]
#[test]
fn module_configuration_accepts_absent_null_and_empty_requirements() {
    for json in [r#"{}"#, r#"{"Require":null}"#, r#"{"Require":[]}"#] {
        let config: ModuleConfig = serde_json::from_str(json).unwrap();
        assert!(config.require.unwrap_or_default().is_empty());
    }
    let config: ModuleConfig = serde_json::from_str(
        r#"{"Require":[{"Path":"example.com/dependency","Version":"v1.2.3"}]}"#,
    )
    .unwrap();
    let requirements = config.require.unwrap();
    assert_eq!(requirements.len(), 1);
    assert_eq!(requirements[0].path, "example.com/dependency");
    assert_eq!(requirements[0].version, "v1.2.3");
    assert!(serde_json::from_str::<ModuleConfig>(r#"{"Require":{}}"#).is_err());
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
#[derive(Clone, Debug, Hash, PartialEq, Eq, Encode, Decode)]
struct BuildPlan {
    files: Vec<RcStr>,
    inputs: Inputs,
    assembly_flags: BTreeMap<RcStr, RcStr>,
    generated: BTreeMap<RcStr, RcStr>,
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
    go_session: ResolvedVc<GoBuildSession>,
) -> Result<Vc<RcStr>> {
    let go_context = go_session.await?.context.clone();
    if !input.exists() {
        return Ok(Vc::cell(rcstr!("{}")));
    }
    let mut command = go_context.command(Path::new(project.as_str()));
    go_context
        .cancellation
        .module_configs
        .fetch_add(1, Ordering::Relaxed);
    command.args(["mod", "edit", "-json"]);
    let report = process::output(command, &go_context.cancellation.token).await?;
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

/// Materialize generated source bytes outside the project. The virtual paths remain in the
/// original package directory; neither source files nor module metadata are modified.
fn overlay(project: &Path, generated: &BTreeMap<RcStr, RcStr>) -> Result<tempfile::TempDir> {
    let temp = tempfile::Builder::new()
        .prefix("turbopack-go-overlay-")
        .tempdir()?;
    let mut replacements = BTreeMap::new();
    for (index, (path, content)) in generated.iter().enumerate() {
        let virtual_path = project.join(path.as_str());
        ensure!(
            !virtual_path.exists(),
            "generated Go input already exists: {}",
            virtual_path.display()
        );
        let source = temp.path().join(format!("{index}.go"));
        std::fs::write(&source, content.as_str())?;
        replacements.insert(virtual_path, source);
    }
    std::fs::write(
        temp.path().join("overlay.json"),
        serde_json::to_vec(&serde_json::json!({ "Replace": replacements }))?,
    )?;
    Ok(temp)
}

async fn list(
    directory: &Path,
    files: &[RcStr],
    go_context: &GoBuildContext,
    project: &Path,
    generated: &BTreeMap<RcStr, RcStr>,
) -> Result<Vec<Package>> {
    go_context
        .cancellation
        .lists
        .fetch_add(1, Ordering::Relaxed);
    let overlay = overlay(project, generated)?;
    let mut command = go_context.command(directory);
    command
        .arg("list")
        .arg(format!(
            "-overlay={}",
            overlay.path().join("overlay.json").display()
        ))
        .args([
            "-deps",
            "-json=Dir,ImportPath,Name,Standard,Module,GoFiles,IgnoredGoFiles,InvalidGoFiles,\
             EmbedFiles,EmbedPatterns,Imports,CgoFiles,SFiles,HFiles,SysoFiles,Error,DepsErrors,\
             Incomplete,DepOnly",
            "-e",
            "-mod=readonly",
            "-buildvcs=false",
            "-trimpath",
        ])
        .arg(format!("-tags={}", go_context.tags))
        .args(arguments(files));
    let report = process::output(command, &go_context.cancellation.token).await?;
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

/// Track assembly include candidates conservatively, without interpreting Go's preprocessor
/// conditions. Its include search starts in the package directory, even for nested headers;
/// toolchain headers and the generated go_asm.h are resolved by Go when no local file exists.
async fn observe_assembly_includes(
    tracker: &mut Tracker<'_>,
    directory: &Path,
    assembly: &[String],
    headers: &[String],
    goroot: &Path,
) -> Result<Vec<RcStr>> {
    static INCLUDES: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r#"(?m)^\s*#\s*include\s+("(?:\\.|[^"\\])*")"#).unwrap()
    });
    let mut pending: Vec<_> = assembly
        .iter()
        .chain(headers)
        .map(|name| directory.join(name))
        .collect();
    let mut seen = std::collections::BTreeSet::new();
    while let Some(path) = pending.pop() {
        if !seen.insert(path.clone()) {
            continue;
        }
        tracker.file(&path).await?;
        let content = match std::fs::read_to_string(&path) {
            Ok(content) => content,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("reading assembly source: {}", path.display()));
            }
        };
        for capture in INCLUDES.captures_iter(&content) {
            let name: String = serde_json::from_str(&capture[1])
                .context("assembly include names must use JSON-compatible quoted strings")?;
            let mut include = directory.to_owned();
            for part in Path::new(&name).components() {
                match part {
                    std::path::Component::CurDir => {}
                    std::path::Component::ParentDir => {
                        // Check before normalizing parent components so a symlink cannot hide
                        // behind a/../b and change which file Go actually opens.
                        ensure!(
                            !std::fs::symlink_metadata(&include)
                                .is_ok_and(|metadata| metadata.file_type().is_symlink()),
                            "Go source symlinks are unsupported: {}",
                            include.display()
                        );
                        include.pop();
                    }
                    part => include.push(part.as_os_str()),
                }
            }
            if ["src", "pkg/include", "pkg/tool"]
                .iter()
                .any(|root| include.starts_with(goroot.join(root)))
            {
                // These absolute toolchain includes are guarded by the session fingerprint.
                continue;
            }
            tracker
                .parents(include.parent().context("assembly include has no parent")?)
                .await?;
            pending.push(include);
        }
    }
    Ok(seen
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned().into())
        .collect())
}

async fn observe_packages(
    tracker: &mut Tracker<'_>,
    packages: &[Package],
    project: &Path,
    module: &str,
    goroot: &Path,
) -> Result<BTreeMap<RcStr, RcStr>> {
    let mut assembly_flags = BTreeMap::new();
    for pkg in packages {
        if pkg.standard {
            continue;
        }
        // Track unresolved local imports and their nearest existing ancestors, so creation of a
        // previously missing package invalidates discovery without walking unrelated subtrees.
        for import in pkg.imports.iter().chain(std::iter::once(&pkg.import_path)) {
            if let Some(relative) = import
                .strip_prefix(module)
                .and_then(|path| {
                    // An import equal to the module path refers to its root package.
                    // Missing packages have no Dir in go list's output, so this is also
                    // needed to watch for the first source file appearing there.
                    if path.is_empty() {
                        Some(path)
                    } else {
                        path.strip_prefix('/')
                    }
                })
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
            .chain(&pkg.s_files)
            .chain(&pkg.h_files)
            .chain(&pkg.syso_files)
        {
            tracker.file(&dir.join(file)).await?;
        }
        // Go list reports package headers, but not quoted includes in subdirectories.
        // Observe these recursively too, including missing paths so a later repair invalidates
        // discovery. Go still owns preprocessing, assembly selection and compilation.
        let assembly_inputs =
            observe_assembly_includes(tracker, dir, &pkg.s_files, &pkg.h_files, goroot).await?;
        if !pkg.s_files.is_empty() {
            // Go's own cache omits nested includes from HFiles. Salt only this imported
            // package's assembler action, so Go cannot reuse an object with stale headers.
            let inputs: BTreeMap<_, _> = assembly_inputs
                .into_iter()
                .map(|path| {
                    let input = tracker.inputs.files[&path].clone();
                    (path, input)
                })
                .collect();
            let digest =
                Sha256::digest(bincode::encode_to_vec(inputs, bincode::config::standard())?);
            assembly_flags.insert(
                pkg.import_path.as_str().into(),
                format!("-D=__TURBOPACK_GO_ASSEMBLY_INPUT_HASH__=0x{digest:x}").into(),
            );
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
    Ok(assembly_flags)
}

// Re-register filesystem observations and validate live stamps in every process. Compilation
// remains persistent: an unchanged build plan restores its executable without invoking Go build.
#[turbo_tasks::function(session_dependent)]
async fn discover(
    root: FileSystemPath,
    files: Vec<RcStr>,
    go_session: ResolvedVc<GoBuildSession>,
    generated: BTreeMap<RcStr, RcStr>,
) -> Result<Vc<Discovery>> {
    let go_context = go_session.await?.context.clone();
    let _permit = tokio::select! {
        permit = GO_ACTIONS.acquire() => permit?,
        _ = go_context.cancellation.token.cancelled() => return Ok(Discovery { outcome: DiscoveryOutcome::Cancelled, inputs: Inputs::default() }.cell()),
    };
    let project = to_sys_path(root.clone())
        .await?
        .context("Go inputs require a disk filesystem")?;
    let mut tracker = Tracker::new(&root, &project, &go_context);
    let run = async {
        let build_cache = Path::new(go_context.cache.as_str());
        ensure!(
            !paths::directories_overlap(build_cache, &project)?
                && !paths::directories_overlap(
                    build_cache,
                    Path::new(go_context.module_cache.as_str())
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
            *go_session,
        )
        .await?;
        let config: ModuleConfig = serde_json::from_str(&config)?;
        ensure!(
            config.replace.as_ref().is_none_or(Vec::is_empty),
            "Go module replacements are not supported in this release"
        );
        // Even an unresolved dependency needs cache dependencies. Downloading a module can
        // repair it without changing go.mod/go.sum, so retain reads for its future cache entries.
        let cache = Path::new(go_context.module_cache.as_str());
        for requirement in config.require.iter().flatten() {
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
        let packages = list(&directory, &files, &go_context, &project, &generated).await?;
        let assembly_flags = observe_packages(
            &mut tracker,
            &packages,
            &project,
            module,
            Path::new(go_context.goroot.as_str()),
        )
        .await?;
        // Newly discovered files/directories were not guarded during the first command.
        // Only that registration window needs a second Go scan. For named files importing
        // only standard packages, all mutable inputs were already registered above.
        let added_inputs =
            registered != (tracker.inputs.files.len(), tracker.inputs.directories.len());
        let structure_changed = !tracker.dirty
            && added_inputs
            && packages != list(&directory, &files, &go_context, &project, &generated).await?;
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
                pkg.cgo_files.is_empty(),
                "CGO dependencies are unsupported: {}",
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
            generated,
            inputs: tracker.inputs.compiler_inputs(),
            assembly_flags,
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
        Err(_) if go_context.is_cancelled() => DiscoveryOutcome::Cancelled,
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
    // FileContent persists only its hash; keep the full executable bytes in this task.
    Success(ResolvedVc<File>),
    Failed(RcStr),
    Retry(Option<Invalidator>),
    Cancelled,
}

#[turbo_tasks::function]
async fn compile(
    project: RcStr,
    plan: BuildPlan,
    go_session: ResolvedVc<GoBuildSession>,
) -> Result<Vc<Compilation>> {
    let go_context = go_session.await?.context.clone();
    let _permit = tokio::select! {
        permit = GO_ACTIONS.acquire() => permit?,
        _ = go_context.cancellation.token.cancelled() => {
            Completion::session_dependent().await?;
            return Ok(Compilation::Cancelled.cell());
        },
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
    let executable = temp
        .path()
        .join(format!("program{}", go_context.exe_suffix));
    go_context
        .cancellation
        .builds
        .fetch_add(1, Ordering::Relaxed);
    let overlay = overlay(Path::new(project.as_str()), &plan.generated)?;
    let mut command = go_context.command(&directory);
    command
        .arg("build")
        .arg(format!(
            "-overlay={}",
            overlay.path().join("overlay.json").display()
        ))
        .args(["-mod=readonly", "-buildvcs=false", "-trimpath"])
        .arg(format!("-tags={}", go_context.tags))
        .arg("-o")
        .arg(&executable);
    for (package, flags) in &plan.assembly_flags {
        command.arg(format!("-asmflags={package}={flags}"));
    }
    command.args(arguments(&plan.files));
    let report = match process::output(command, &go_context.cancellation.token).await {
        Err(_) if go_context.is_cancelled() => {
            Completion::session_dependent().await?;
            return Ok(Compilation::Cancelled.cell());
        }
        Err(error) => {
            Completion::session_dependent().await?;
            return Ok(Compilation::Failed(format!("{error:#}").into()).cell());
        }
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
            File::from(std::fs::read(&executable)?)
                .with_permissions(Permissions::Executable)
                .cell()
                .to_resolved()
                .await?,
        )
    } else {
        // A nonzero exit may reflect transient host/cache failures as well as source errors.
        // Keep failure memoization within this process, and retry after a restart.
        Completion::session_dependent().await?;
        Compilation::Failed(diagnostic(&report.stderr, &directory).into())
    };
    Ok(outcome.cell())
}

// Reconstructing hash-only FileContent after a cache restore must not rerun the compiler.
#[turbo_tasks::function]
async fn executable_content(file: ResolvedVc<File>) -> Result<Vc<FileContent>> {
    Ok(FileContent::Content((*file.await?).clone()).cell())
}

fn directory_input(path: &RcStr) -> Result<inputs::DirectoryInput> {
    directory(Path::new(path.as_str()))
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct GoBundleResult {
    pub outcome: GoBuildOutcome,
    inputs: Inputs,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
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
    go_session: ResolvedVc<GoBuildSession>,
    generated: BTreeMap<RcStr, RcStr>,
) -> Result<Vc<GoBundleResult>> {
    let go_context = go_session.await?.context.clone();
    files.extend(generated.keys().cloned());
    files.sort();
    files.dedup();
    let discovery = discover(root.clone(), files, *go_session, generated).await?;
    let outcome = match &discovery.outcome {
        DiscoveryOutcome::Ready(plan) => {
            let project = to_sys_path(root.clone())
                .await?
                .context("Go inputs require a disk filesystem")?;
            let compiled = compile(
                project.to_str().context("non-UTF8 project")?.into(),
                plan.clone(),
                *go_session,
            )
            .await?;
            match &*compiled {
                Compilation::Success(file) => {
                    GoBuildOutcome::Success(executable_content(**file).to_resolved().await?)
                }
                Compilation::Failed(message) => GoBuildOutcome::Failed(message.clone()),
                Compilation::Cancelled => GoBuildOutcome::Cancelled,
                Compilation::Retry(retry) => {
                    if let Some(retry) = retry {
                        retry.invalidate(&*turbo_tasks());
                    }
                    Tracker::new(&root, &project, &go_context)
                        .invalidate()
                        .await?;
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
    go_context: GoBuildContext,
) -> Vc<GoBundleResult> {
    bundle(root, files, shared_session(go_context), BTreeMap::new())
}

/// Compile named sources with additional generated files in the same directory. Generated
/// source bytes are part of task identity, and original project inputs retain normal tracking.
#[turbo_tasks::function(operation, root)]
pub fn go_bundle_with_generated_files(
    root: FileSystemPath,
    files: Vec<RcStr>,
    go_context: GoBuildContext,
    generated: BTreeMap<RcStr, RcStr>,
) -> Vc<GoBundleResult> {
    bundle(root, files, shared_session(go_context), generated)
}

/// Session-valued entrypoint for Next-specific persistent endpoint tasks. Generated source
/// content is task input; the resolved toolchain stays a value dependency of compiler tasks.
#[turbo_tasks::function]
pub fn go_bundle_with_session(
    root: FileSystemPath,
    files: Vec<RcStr>,
    session: ResolvedVc<GoBuildSession>,
    generated: BTreeMap<RcStr, RcStr>,
) -> Vc<GoBundleResult> {
    bundle(root, files, *session, generated)
}
