//! Tracked source selection shared by declaration analysis and compilation.
use std::{collections::BTreeMap, io::Read};

use anyhow::{Context, Result, ensure};
use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileContent, FileSystemPath, to_sys_path};

use crate::{
    GoBuildOutcome, GoBuildSession, GoBundleResult, bundle,
    inputs::{Inputs, Tracker},
};

/// Selection uses named-file Go semantics, including for the directory mode: platform
/// suffixes and build tags do not filter explicitly selected entry files.
#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, Encode, Decode)]
pub enum GoSourceSelection {
    /// Names relative to the selected directory. Unlisted siblings are excluded.
    Files(Vec<RcStr>),
    /// All regular .go siblings except _test.go, with additions and removals tracked.
    Directory,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct GoSourceSet {
    pub root: FileSystemPath,
    /// Source bytes keyed by module-relative names; generated sources are supplied separately.
    pub files: BTreeMap<RcStr, RcStr>,
    inputs: Inputs,
    dirty: bool,
    boundary: FileSystemPath,
}

/// Find the nearest go.mod within boundary, falling back to the source directory. Reads of
/// absent go.mod files are dependencies too, so creating a nearer module changes selection.
#[turbo_tasks::function(session_dependent)]
pub async fn go_source_set(
    boundary: FileSystemPath,
    directory: FileSystemPath,
    selection: GoSourceSelection,
    session: ResolvedVc<GoBuildSession>,
) -> Result<Vc<GoSourceSet>> {
    ensure!(
        boundary.get_path_to(&directory).is_some(),
        "Go sources are outside their boundary"
    );
    let project = to_sys_path(boundary.clone())
        .await?
        .context("Go sources require a disk filesystem")?;
    let go_context = &session.await?.go_context;
    let mut tracker = Tracker::new(&boundary, &project, go_context);
    let mut root = directory.clone();
    loop {
        let module = root.join("go.mod")?;
        tracker
            .file(
                &to_sys_path(module.clone())
                    .await?
                    .context("Go module requires a disk filesystem")?,
            )
            .await?;
        if module.read().await?.is_content() {
            break;
        }
        if root == boundary {
            root = directory.clone();
            break;
        }
        root = root.parent();
    }
    // Analysis may compile a host helper before the application's build reaches discovery.
    // Enforce the same cache-placement contract before that helper can write its cache.
    crate::validate_build_cache(
        &to_sys_path(root.clone())
            .await?
            .context("Go module requires a disk filesystem")?,
        go_context,
    )?;
    let names = match selection {
        GoSourceSelection::Files(names) => names,
        GoSourceSelection::Directory => {
            tracker
                .dir(
                    &to_sys_path(directory.clone())
                        .await?
                        .context("Go directory requires a disk filesystem")?,
                )
                .await?;
            let mut names = vec![];
            if let DirectoryContent::Entries(entries) = &*directory.read_dir().await? {
                for (name, entry) in entries {
                    if name.ends_with(".go")
                        && !name.ends_with("_test.go")
                        && matches!(entry, DirectoryEntry::File(_))
                    {
                        names.push(name.clone());
                    }
                }
            }
            names
        }
    };
    let mut files = BTreeMap::new();
    for name in names {
        ensure!(
            !name.contains(['/', '\\']) && name.ends_with(".go"),
            "Go source names must be .go filenames: {name}"
        );
        let path = directory.join(&name)?;
        tracker
            .file(
                &to_sys_path(path.clone())
                    .await?
                    .context("Go source requires a disk filesystem")?,
            )
            .await?;
        let content = path.read().await?;
        let FileContent::Content(content) = &*content else {
            anyhow::bail!("Go source is missing: {name}");
        };
        let mut source = String::new();
        content.read().read_to_string(&mut source)?;
        files.insert(
            root.get_path_to(&path)
                .context("Go source outside module")?
                .into(),
            source.into(),
        );
    }
    Ok(source_generation(
        root,
        files,
        tracker.inputs,
        tracker.dirty,
        boundary,
    ))
}

// Discovery can rerun and redirect its output, but a captured generation must keep its
// original bytes and observations. Key this cell by those values instead of overwriting
// the discovery task's cell when files change.
#[turbo_tasks::function]
fn source_generation(
    root: FileSystemPath,
    files: BTreeMap<RcStr, RcStr>,
    inputs: Inputs,
    dirty: bool,
    boundary: FileSystemPath,
) -> Vc<GoSourceSet> {
    GoSourceSet {
        root,
        files,
        inputs,
        dirty,
        boundary,
    }
    .cell()
}

/// Compile the source identity that was used for analysis. The validity token includes
/// selection observations as well as the compiler's transitive inputs.
#[turbo_tasks::function]
pub async fn go_bundle_from_sources(
    sources: ResolvedVc<GoSourceSet>,
    session: ResolvedVc<GoBuildSession>,
    generated: BTreeMap<RcStr, RcStr>,
) -> Result<Vc<GoBundleResult>> {
    let sources = sources.await?;
    let go_context = &session.await?.go_context;
    let mut stale = sources.dirty || !sources.inputs.is_current().await?;
    let mut result = if stale {
        GoBundleResult {
            outcome: GoBuildOutcome::Retry,
            inputs: sources.inputs.clone(),
            root: sources.boundary.clone(),
            session,
        }
    } else {
        let result = bundle(
            sources.root.clone(),
            sources.files.keys().cloned().collect(),
            *session,
            generated,
        )
        .await?;
        stale = !result.is_current().await? || !sources.inputs.is_current().await?;
        (*result).clone()
    };
    if stale {
        let project = to_sys_path(sources.boundary.clone())
            .await?
            .context("Go sources require a disk filesystem")?;
        Tracker::new(&sources.boundary, &project, go_context)
            .invalidate()
            .await?;
        result.outcome = GoBuildOutcome::Retry;
    }
    // Preserve the compiler's observations for overlapping inputs. A stale attempt must not
    // replace its compiler fingerprint with the earlier analysis fingerprint.
    for (path, input) in &sources.inputs.files {
        result
            .inputs
            .files
            .entry(path.clone())
            .or_insert_with(|| input.clone());
    }
    for (path, input) in &sources.inputs.directories {
        result
            .inputs
            .directories
            .entry(path.clone())
            .or_insert_with(|| input.clone());
    }
    result.root = sources.boundary.clone();
    Ok(result.cell())
}
