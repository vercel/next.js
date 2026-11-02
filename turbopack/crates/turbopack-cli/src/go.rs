//! Go entrypoints participate in the CLI's task graph and emit ordinary output assets.
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::{Context, Result, ensure};
use bincode::{Decode, Encode};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ResolvedVc, TaskInput, Vc};
use turbo_tasks_fs::{FileSystem, FileSystemPath, to_sys_path};
use turbo_unix_path::sys_to_unix;
use turbopack_core::{
    asset::AssetContent,
    ident::AssetIdent,
    issue::{IssueExt, module::ModuleIssue},
    output::OutputAssets,
    raw_output::RawOutput,
    virtual_source::VirtualSource,
};
use turbopack_go::{
    GoBuildContext, GoBuildOptions, GoBuildOutcome, GoBuildSession, GoBundleResult, filesystem,
    go_bundle_with_session, validate_source_path,
};

use crate::arguments::CommonArguments;

#[derive(Clone, Debug, Hash, PartialEq, Eq, Encode, NonLocalValue)]
pub struct GoBuild {
    pub go_context: GoBuildContext,
    session: ResolvedVc<GoBuildSession>,
    project: RcStr,
    files: Vec<RcStr>,
    output_name: RcStr,
}

/// Probing does not require a task engine. Attach the persistent session once the caller
/// has opened its backing storage, before starting compilation or acquiring watchers.
pub struct PreparedGoBuild {
    probe: GoBuildContext,
    project: RcStr,
    files: Vec<RcStr>,
    output_name: RcStr,
}

impl PreparedGoBuild {
    pub async fn connect(self) -> Result<Arc<GoBuild>> {
        let session = session_operation(self.project.clone(), self.probe.options)
            .resolve()
            .strongly_consistent()
            .await?;
        // The resident value may have been restored from disk. Retain its context, not
        // the probe's cancellation handle, so shutdown cancels the work actually running.
        let go_context = session.await?.go_context.clone();
        Ok(Arc::new(GoBuild {
            go_context,
            session,
            project: self.project,
            files: self.files,
            output_name: self.output_name,
        }))
    }
}

#[turbo_tasks::function(operation, root, session_dependent)]
fn session_operation(project: RcStr, options: GoBuildOptions) -> Vc<GoBuildSession> {
    GoBuildSession::persistent(format!("turbopack-cli:{project}").into(), options)
}

// Only the source/session identity enters the persistent compiler graph. The CLI owner
// passed to orchestration tasks also carries live watchers and cancellation state.
#[turbo_tasks::function(operation, root)]
fn bundle_operation(
    root: FileSystemPath,
    files: Vec<RcStr>,
    session: ResolvedVc<GoBuildSession>,
) -> Vc<GoBundleResult> {
    go_bundle_with_session(root, files, *session, BTreeMap::new())
}

impl TaskInput for GoBuild {
    fn is_transient(&self) -> bool {
        true
    }
}

impl<C> Decode<C> for GoBuild {
    fn decode<D: bincode::de::Decoder<Context = C>>(
        _: &mut D,
    ) -> std::result::Result<Self, bincode::error::DecodeError> {
        unreachable!("transient Go CLI inputs are never decoded")
    }
}

impl GoBuild {
    /// Called by the compilation graph when a watch session first needs these inputs.
    pub async fn start_watching(&self) -> Result<()> {
        let fs = filesystem(self.project.clone())
            .resolve()
            .strongly_consistent()
            .await?;
        let fs = fs.await?;
        if self.go_context.is_cancelled() {
            return Ok(());
        }
        fs.start_watching().await?;
        // Shutdown can overlap startup; the project watcher remains caller-owned.
        if self.go_context.is_cancelled() {
            fs.stop_watching().await;
        }
        self.go_context.start_module_cache_watching().await?;
        Ok(())
    }

    /// Stop input watching and settle compiler cancellation before the caller stops its engine.
    pub async fn stop_watching(&self) -> Result<()> {
        self.go_context.cancel();
        let fs = filesystem(self.project.clone())
            .resolve()
            .strongly_consistent()
            .await?;
        fs.await?.stop_watching().await;
        self.go_context.stop_module_cache_watching().await?;

        Ok(())
    }
}

pub fn is_go_entry(entry: &str) -> bool {
    Path::new(entry).extension().is_some_and(|ext| ext == "go")
}

fn input_files(common: &CommonArguments) -> Result<(PathBuf, Vec<RcStr>)> {
    let base = std::fs::canonicalize(common.dir.as_deref().unwrap_or(Path::new(".")))?;
    // Normalize lexically so missing inputs can become available during a watch session.
    let paths: Vec<_> = common
        .entries
        .as_deref()
        .unwrap_or_default()
        .iter()
        .filter(|entry| is_go_entry(entry))
        .map(|entry| base.join(entry).normalize_lexically())
        .collect::<std::result::Result<_, _>>()?;
    let parent = paths
        .first()
        .context("supply .go input files")?
        .parent()
        .context("input has no directory")?;
    ensure!(
        paths.iter().all(|path| path.parent() == Some(parent)),
        "Go input files must share one directory"
    );
    let module = parent
        .ancestors()
        .find(|path| path.join("go.mod").is_file())
        .or_else(|| parent.ancestors().find(|path| path.is_dir()))
        .context("Go input directory does not exist")?;
    // Validate before canonicalizing: resolving a standalone source directory would erase a
    // symlink alias that the Go input tracker cannot safely consume.
    let source_root = if module.starts_with(&base) {
        base.as_path()
    } else {
        module
    };
    for path in &paths {
        validate_source_path(source_root, path)?;
    }
    let mut files = paths
        .iter()
        .map(|path| {
            let relative = path
                .strip_prefix(module)?
                .to_str()
                .context("non-UTF8 Go input")?;
            Ok(RcStr::from(sys_to_unix(relative)))
        })
        .collect::<Result<Vec<_>>>()?;
    files.sort();
    files.dedup();
    let module = std::fs::canonicalize(module)?;
    if let Some(root) = &common.root {
        let root = std::fs::canonicalize(root)?;
        ensure!(module.starts_with(root), "Go module is outside --root");
    }
    Ok((module, files))
}

pub async fn prepare(common: &CommonArguments) -> Result<Option<PreparedGoBuild>> {
    let Some(first) = common
        .entries
        .as_deref()
        .unwrap_or_default()
        .iter()
        .find(|entry| is_go_entry(entry))
    else {
        return Ok(None);
    };
    let (project, files) = input_files(common)?;
    let go_context = GoBuildContext::host(&common.go.go, None, &common.go.tags).await?;
    // Allocate the output directory before discovery records its parent's inventory.
    // Otherwise the first publication changes compiler inputs and misses the next warm cache.
    std::fs::create_dir_all(common.dir.as_deref().unwrap_or(Path::new(".")).join("dist"))
        .context("preparing Go output directory")?;
    let name = Path::new(first)
        .file_stem()
        .context("input has no filename")?
        .to_str()
        .context("non-UTF8 Go output name")?;
    Ok(Some(PreparedGoBuild {
        output_name: format!("{name}{}", go_context.exe_suffix).into(),
        project: project.to_str().context("non-UTF8 Go project")?.into(),
        files,
        probe: go_context,
    }))
}

/// Compile native inputs in the caller's graph and publish through the shared asset writer.
#[turbo_tasks::function]
pub async fn output_assets(
    build: Arc<GoBuild>,
    output_root: FileSystemPath,
) -> Result<Vc<OutputAssets>> {
    let fs = filesystem(build.project.clone())
        .resolve()
        .strongly_consistent()
        .await?;
    let root = fs.root().owned().await?;
    let path = output_root.join(&build.output_name)?;
    let output = to_sys_path(path.clone())
        .await?
        .context("Go output requires a disk filesystem")?;
    loop {
        if build.go_context.is_cancelled() {
            return Ok(OutputAssets::empty());
        }
        // The caller's root read can be interrupted while this cached task is still waiting
        // for graph consistency. Let this task unwind too, before shutdown stops scheduling.
        let result = tokio::select! {
            result = bundle_operation(root.clone(), build.files.clone(), build.session)
                .read_strongly_consistent() => result?,
            _ = build.go_context.cancelled() => return Ok(OutputAssets::empty()),
        };
        if build.go_context.is_cancelled() {
            return Ok(OutputAssets::empty());
        }
        // Files can change before watcher delivery or during compilation. Validation
        // invalidates those observations; retry the graph read before publishing any assets.
        if !result.validate().await? {
            continue;
        }
        match &result.outcome {
            GoBuildOutcome::Success(file) => {
                ensure!(
                    !result.is_input(&output)?,
                    "output must be outside tracked Go inputs and embed patterns"
                );
                let source =
                    VirtualSource::new(root.join(&build.files[0])?, AssetContent::file(**file));
                return Ok(Vc::cell(vec![ResolvedVc::upcast(
                    RawOutput::new(path, Vc::upcast(source))
                        .to_resolved()
                        .await?,
                )]));
            }
            GoBuildOutcome::Failed(message) => {
                ModuleIssue::new(
                    AssetIdent::from_path(root.join(&build.files[0])?).into_vc(),
                    rcstr!("Go compilation failed"),
                    message.clone(),
                    None,
                )
                .to_resolved()
                .await?
                .emit();
                return Ok(OutputAssets::empty());
            }
            GoBuildOutcome::Retry => continue,
            GoBuildOutcome::Cancelled => return Ok(OutputAssets::empty()),
        }
    }
}
