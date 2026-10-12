//! Provision official Go tools independently of a task engine or application framework.
pub mod artifact;
#[cfg_attr(not(feature = "embedded"), allow(dead_code))]
mod cache;
pub mod process;

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::{Context, Result, ensure};
pub use cache::default_cache_directory;
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Debug)]
pub enum ToolchainSource {
    Embedded,
    Executable(PathBuf),
}

#[derive(Default, Clone, Debug)]
pub struct PrepareOptions {
    pub cache_directory: Option<PathBuf>,
}

#[derive(Clone, Debug)]
pub struct PreparedToolchain {
    pub executable: PathBuf,
    pub goroot: PathBuf,
    pub version: String,
    pub host_os: String,
    pub host_arch: String,
    pub identity: String,
    /// Go's defaults resolved with the process's explicit cache settings and GOENV=off.
    pub environment: BTreeMap<String, String>,
    _lease: Option<Arc<cache::Lease>>,
}

impl PreparedToolchain {
    /// Apply toolchain selection to a command whose remaining environment the consumer owns.
    pub fn apply(&self, command: &mut Command) {
        command
            .env("GOROOT", &self.goroot)
            .env("GOENV", "off")
            .env("GOTOOLCHAIN", "local")
            .env("GOTELEMETRY", "off");
    }
    pub fn is_managed(&self) -> bool {
        self._lease.is_some()
    }
}

fn external_executable(path: &Path) -> Result<PathBuf> {
    let path = if path.components().count() == 1 && !path.is_absolute() {
        let name = if path.extension().is_none() {
            PathBuf::from(format!(
                "{}{}",
                path.display(),
                std::env::consts::EXE_SUFFIX
            ))
        } else {
            path.to_owned()
        };
        std::env::var_os("PATH")
            .into_iter()
            .flat_map(|path| std::env::split_paths(&path).collect::<Vec<_>>())
            .map(|directory| directory.join(&name))
            .find(|path| path.is_file())
            .context("explicit Go executable not found on PATH")?
    } else {
        path.to_owned()
    };
    std::fs::canonicalize(path).context("resolving the Go executable")
}

pub async fn prepare(
    source: ToolchainSource,
    options: PrepareOptions,
    cancellation: CancellationToken,
) -> Result<PreparedToolchain> {
    // Dropping this future also cancels a blocking extraction worker. It cannot publish
    // after checking this token, and its TempDir/lock guards clean up on completion.
    let guard = cancellation.clone().drop_guard();
    let (executable, goroot, identity, lease, expected): (
        PathBuf,
        Option<PathBuf>,
        String,
        Option<Arc<cache::Lease>>,
        Option<artifact::Artifact>,
    ) = match source {
        ToolchainSource::Executable(path) => (
            external_executable(&path)?,
            None,
            "external".to_owned(),
            None,
            None,
        ),
        ToolchainSource::Embedded => {
            #[cfg(not(feature = "embedded"))]
            anyhow::bail!(
                "this executable was built without embedded Go; supply --go or rebuild with \
                 embedded-go"
            );
            #[cfg(feature = "embedded")]
            {
                let artifact =
                    artifact::for_target(include_str!(concat!(env!("OUT_DIR"), "/target.txt")))?;
                let entries: Vec<artifact::Entry> =
                    serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/entries.json")))?;
                let bytes = include_bytes!(concat!(env!("OUT_DIR"), "/go.archive"));
                let base = match options.cache_directory {
                    Some(base) => base,
                    None => default_cache_directory()?,
                };
                let token = cancellation.clone();
                let selected = artifact.clone();
                let (root, lease) = tokio::task::spawn_blocking(move || {
                    cache::prepare(&selected, bytes, &entries, &base, &token)
                })
                .await??;
                let executable = root.join("bin").join(if artifact.os == "windows" {
                    "go.exe"
                } else {
                    "go"
                });
                (
                    executable,
                    Some(root),
                    artifact.key(),
                    Some(lease),
                    Some(artifact),
                )
            }
        }
    };
    #[cfg(not(feature = "embedded"))]
    let _ = options;
    let mut command = Command::new(&executable);
    command
        .env_clear()
        .env("GOENV", "off")
        .env("GOTOOLCHAIN", "local")
        .env("GOWORK", "off")
        .env("GOTELEMETRY", "off")
        .env("CGO_ENABLED", "0")
        .env("GOPROXY", "off")
        .env("GOSUMDB", "off");
    // Cache configuration remains an explicit process input. Compiler/target settings
    // and an ambient GOROOT must never redirect the selected installation.
    for name in [
        "HOME",
        "USERPROFILE",
        "LOCALAPPDATA",
        "APPDATA",
        "XDG_CACHE_HOME",
        "GOCACHE",
        "GOMODCACHE",
        "GOPATH",
        "SystemRoot",
        "TEMP",
        "TMP",
        "TMPDIR",
    ] {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    if let Some(root) = &goroot {
        command.env("GOROOT", root);
    }
    // Probe outside the user's module so its language directive cannot change discovery.
    command
        .current_dir(executable.parent().context("Go executable has no parent")?)
        .args([
            "env",
            "-json",
            "GOROOT",
            "GOVERSION",
            "GOHOSTOS",
            "GOHOSTARCH",
            "GOCACHE",
            "GOMODCACHE",
            "GOPATH",
        ]);
    let report = process::output(command, &cancellation).await?;
    ensure!(
        report.status.success(),
        "unable to query selected Go: {}",
        String::from_utf8_lossy(&report.stderr)
    );
    let environment: BTreeMap<String, String> = serde_json::from_slice(&report.stdout)?;
    let value = |name: &str| {
        environment
            .get(name)
            .cloned()
            .with_context(|| format!("Go did not report {name}"))
    };
    let root = std::fs::canonicalize(value("GOROOT")?)?;
    let version = value("GOVERSION")?;
    let host_os = value("GOHOSTOS")?;
    let host_arch = value("GOHOSTARCH")?;
    if let Some(expected) = expected {
        ensure!(
            version == expected.version
                && host_os == expected.os
                && host_arch == expected.arch
                && Some(&root) == goroot.as_ref(),
            "embedded Go identity mismatch"
        );
    }
    let identity = if lease.is_some() {
        identity
    } else {
        format!(
            "external:{}:{}:{}",
            executable.display(),
            root.display(),
            version
        )
    };
    let toolchain = PreparedToolchain {
        executable,
        goroot: root,
        version,
        host_os,
        host_arch,
        identity,
        environment,
        _lease: lease,
    };
    guard.disarm();
    Ok(toolchain)
}
