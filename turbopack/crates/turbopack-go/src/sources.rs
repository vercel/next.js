//! Tracked source selection shared by declaration analysis and compilation.
use std::{collections::BTreeMap, io::Read, path::Path};

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
    /// The `module` directive of the selected go.mod; `None` only when there is no go.mod.
    pub module_path: Option<RcStr>,
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
    let mut module_path = None;
    loop {
        let module = root.join("go.mod")?;
        let module_file = to_sys_path(module.clone())
            .await?
            .context("Go module requires a disk filesystem")?;
        tracker.file(&module_file).await?;
        if let FileContent::Content(content) = &*module.read().await? {
            let mut source = String::new();
            content.read().read_to_string(&mut source)?;
            // Callers generate a go.mod only when none exists. Report a go.mod without a module
            // path here, instead of as a conflict with that generated go.mod.
            module_path = Some(module_directive(&source).with_context(|| {
                format!("{}: no module declaration in go.mod", module_file.display())
            })?);
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
            // DETERMINISM: Sources enter a BTreeMap before analysis or compilation.
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
        module_path,
        tracker.inputs,
        tracker.dirty,
        boundary,
    ))
}

/// Read the module path from go.mod, including the block form `module ( path )`. Go validates
/// the file again when it builds.
fn module_directive(go_mod: &str) -> Option<RcStr> {
    fn path(token: &str) -> Option<RcStr> {
        let token = token.trim();
        let path = if token.starts_with('"') {
            serde_json::from_str::<String>(token).ok()?
        } else if let Some(token) = token.strip_prefix('`') {
            token.strip_suffix('`')?.to_owned()
        } else {
            token.to_owned()
        };
        (!path.is_empty()).then(|| path.into())
    }
    let mut lines = go_mod
        .lines()
        .map(|line| line.split("//").next().unwrap_or_default().trim());
    while let Some(line) = lines.next() {
        let Some(rest) = line.strip_prefix("module") else {
            continue;
        };
        if !rest.starts_with(|ch: char| ch.is_whitespace() || matches!(ch, '"' | '`' | '(')) {
            continue;
        }
        let rest = rest.trim();
        let Some(block) = rest.strip_prefix('(') else {
            return path(rest);
        };
        // A block holds one line per directive; `module` accepts exactly one.
        for line in std::iter::once(block.trim()).chain(lines) {
            let (line, closed) = match line.strip_suffix(')') {
                Some(line) => (line.trim(), true),
                None => (line, false),
            };
            if !line.is_empty() {
                return path(line);
            }
            if closed {
                return None;
            }
        }
        return None;
    }
    None
}

// Discovery can rerun and redirect its output, but a captured generation must keep its
// original bytes and observations. Key this cell by those values instead of overwriting
// the discovery task's cell when files change.
#[turbo_tasks::function]
fn source_generation(
    root: FileSystemPath,
    files: BTreeMap<RcStr, RcStr>,
    module_path: Option<RcStr>,
    inputs: Inputs,
    dirty: bool,
    boundary: FileSystemPath,
) -> Vc<GoSourceSet> {
    GoSourceSet {
        root,
        files,
        module_path,
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
    bundle_sources(sources, session, generated, None).await
}

/// Compile generated entry files that import the selected sources as an ordinary package.
///
/// The selected directory is overlaid at `alias`, a module-relative directory that must not
/// exist. Its import path is the module path joined with `alias`, so source directory names
/// do not need to be valid import paths. Generated files under `alias` join that package;
/// the other generated Go files form the `main` package and must share one directory.
///
/// Go applies `internal` visibility to the alias path, not the source path. Place the alias
/// below every `x` whose `x/internal/...` packages the sources import, and place the `main`
/// package where it may import the alias.
#[turbo_tasks::function]
pub async fn go_package_bundle_from_sources(
    sources: ResolvedVc<GoSourceSet>,
    session: ResolvedVc<GoBuildSession>,
    alias: RcStr,
    generated: BTreeMap<RcStr, RcStr>,
) -> Result<Vc<GoBundleResult>> {
    bundle_sources(sources, session, generated, Some(alias)).await
}

/// A failed result for a source set the consumer rejected before compiling it, such as a
/// package the consumer cannot import. It carries the source selection's inputs, so
/// `read_with_validated_inputs` notices edits that may resolve the failure.
#[turbo_tasks::function]
pub async fn go_source_failure(
    sources: ResolvedVc<GoSourceSet>,
    session: ResolvedVc<GoBuildSession>,
    message: RcStr,
) -> Result<Vc<GoBundleResult>> {
    let sources = sources.await?;
    let outcome = if sources.dirty || !sources.inputs.is_current().await? {
        // As in `bundle_sources`: invalidate the stale observations so a retry rereads them.
        let project = to_sys_path(sources.boundary.clone())
            .await?
            .context("Go sources require a disk filesystem")?;
        Tracker::new(&sources.boundary, &project, &session.await?.go_context)
            .invalidate()
            .await?;
        GoBuildOutcome::Retry
    } else {
        GoBuildOutcome::Failed(message)
    };
    Ok(GoBundleResult {
        outcome,
        inputs: sources.inputs.clone(),
        root: sources.boundary.clone(),
        session,
    }
    .cell())
}

async fn bundle_sources(
    sources: ResolvedVc<GoSourceSet>,
    session: ResolvedVc<GoBuildSession>,
    generated: BTreeMap<RcStr, RcStr>,
    alias: Option<RcStr>,
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
        let (files, aliases) = match alias {
            None => (sources.files.keys().cloned().collect(), BTreeMap::new()),
            Some(alias) => {
                let first = sources
                    .files
                    .keys()
                    .next()
                    .context("Go package has no source files")?;
                let directory = Path::new(first.as_str())
                    .parent()
                    .context("Go source has no directory")?
                    .to_str()
                    .context("non-UTF8 Go path")?;
                ensure!(
                    alias
                        .split('/')
                        .all(|part| !part.is_empty() && part != "." && part != ".."),
                    "Go package alias must be a module-relative directory: {alias}"
                );
                (vec![], BTreeMap::from([(alias, RcStr::from(directory))]))
            }
        };
        let result = bundle(
            sources.root.clone(),
            sources.boundary.clone(),
            files,
            *session,
            generated,
            aliases,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn module_directive_reads_plain_quoted_and_commented_paths() {
        for (go_mod, expected) in [
            (
                "module example.com/app\n\ngo 1.24\n",
                Some("example.com/app"),
            ),
            (
                "// comment\nmodule \"example.com/q\" // trailing\n",
                Some("example.com/q"),
            ),
            ("module `example.com/raw`\n", Some("example.com/raw")),
            ("modules example.com/no\n", None),
            ("go 1.24\n", None),
            (
                "module (\n\texample.com/blk // comment\n)\n\ngo 1.24\n",
                Some("example.com/blk"),
            ),
            ("module(\n\n\t\"example.com/q\"\n)\n", Some("example.com/q")),
            ("module (\n)\n\ngo 1.24\n", None),
        ] {
            assert_eq!(module_directive(go_mod).as_deref(), expected, "{go_mod}");
        }
    }
}
