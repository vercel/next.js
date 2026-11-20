//! Tracked source selection shared by declaration analysis and compilation.
use std::{collections::BTreeMap, io::Read, path::Path};

use anyhow::{Context, Result, ensure};
use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, ResolvedVc, Vc};
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
    /// The `module` directive of the selected go.mod, when one exists.
    pub module_path: Option<RcStr>,
    /// Whether `root` is the directory of a go.mod. Otherwise `root` is the source directory,
    /// because no go.mod exists between it and the boundary.
    pub has_go_mod: bool,
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
    let mut has_go_mod = false;
    loop {
        let module = root.join("go.mod")?;
        tracker
            .file(
                &to_sys_path(module.clone())
                    .await?
                    .context("Go module requires a disk filesystem")?,
            )
            .await?;
        if let FileContent::Content(content) = &*module.read().await? {
            let mut source = String::new();
            content.read().read_to_string(&mut source)?;
            module_path = module_directive(&source);
            has_go_mod = true;
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
        module_path,
        has_go_mod,
        tracker.inputs,
        tracker.dirty,
        boundary,
    ))
}

/// Read the module path from go.mod. Go validates the file again when it builds.
fn module_directive(go_mod: &str) -> Option<RcStr> {
    for line in go_mod.lines() {
        let line = line.split("//").next().unwrap_or_default().trim();
        let Some(rest) = line.strip_prefix("module") else {
            continue;
        };
        if !rest.starts_with(|ch: char| ch.is_whitespace() || ch == '"' || ch == '`') {
            continue;
        }
        let rest = rest.trim();
        let path = if rest.starts_with('"') {
            serde_json::from_str::<String>(rest).ok()?
        } else if let Some(rest) = rest.strip_prefix('`') {
            rest.strip_suffix('`')?.to_owned()
        } else {
            rest.to_owned()
        };
        return (!path.is_empty()).then(|| path.into());
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
    has_go_mod: bool,
    inputs: Inputs,
    dirty: bool,
    boundary: FileSystemPath,
) -> Vc<GoSourceSet> {
    GoSourceSet {
        root,
        files,
        module_path,
        has_go_mod,
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
    bundle_sources(Selection::Files(sources), session, generated).await
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
    bundle_sources(
        Selection::Packages(BTreeMap::from([(alias, sources)]), None),
        session,
        generated,
    )
    .await
}

/// Compile generated entry files that import several selected source directories as ordinary
/// packages, in one `go build`.
///
/// `packages` maps each module-relative alias to the sources overlaid there, with the same
/// rules as [`go_package_bundle_from_sources`]. Generated files under an alias join that
/// package. Generated Go files directly in `entrypoint`, a module-relative directory, form the
/// `main` package. Other generated Go files form additional packages that `main` can import,
/// for example to re-export a package that `internal` visibility hides from `main`.
///
/// All source sets must share one boundary and one module: either the same go.mod, or no go.mod
/// at all. Go builds one main module, so directories from different modules are rejected.
/// [`go_packages_root`] returns the directory that aliases and generated paths are relative to.
/// Without a go.mod, it is the nearest common ancestor of the source directories, which then
/// needs a generated `go.mod` like a single directory does.
#[turbo_tasks::function]
pub async fn go_packages_bundle_from_sources(
    packages: BTreeMap<RcStr, ResolvedVc<GoSourceSet>>,
    session: ResolvedVc<GoBuildSession>,
    entrypoint: RcStr,
    generated: BTreeMap<RcStr, RcStr>,
) -> Result<Vc<GoBundleResult>> {
    ensure!(
        is_relative_directory(&entrypoint),
        "Go entrypoint must be a module-relative directory: {entrypoint}"
    );
    bundle_sources(
        Selection::Packages(packages, Some(entrypoint)),
        session,
        generated,
    )
    .await
}

enum Selection {
    /// Named files form the `main` package.
    Files(ResolvedVc<GoSourceSet>),
    /// Source directories overlaid as importable packages, keyed by alias, and the directory of
    /// the generated `main` package when other generated packages exist.
    Packages(BTreeMap<RcStr, ResolvedVc<GoSourceSet>>, Option<RcStr>),
}

fn is_relative_directory(path: &str) -> bool {
    path.split('/')
        .all(|part| !part.is_empty() && part != "." && part != "..")
}

impl GoSourceSet {
    /// The selected source directory.
    pub fn directory(&self) -> Result<FileSystemPath> {
        let first = self
            .files
            .keys()
            .next()
            .context("Go package has no source files")?;
        let directory = Path::new(first.as_str())
            .parent()
            .context("Go source has no directory")?
            .to_str()
            .context("non-UTF8 Go path")?;
        Ok(FileSystemPath {
            fs: self.root.fs,
            path: match (self.root.path.is_empty(), directory.is_empty()) {
                (_, true) => self.root.path.clone(),
                (true, false) => directory.into(),
                (false, false) => format!("{}/{directory}", self.root.path).into(),
            },
        })
    }
}

/// The directory Go commands run from when `sets` are compiled into one executable, which
/// aliases and generated paths are relative to. Directories sharing a go.mod use its module root.
/// Directories without one use their nearest common ancestor, which has no go.mod either:
/// discovery observed every directory up to the boundary. Directories from different modules
/// are rejected.
pub fn go_packages_root(sets: &[&GoSourceSet]) -> Result<FileSystemPath> {
    let first = sets.first().context("supply at least one Go package")?;
    ensure!(
        sets.iter()
            .all(|sources| sources.boundary == first.boundary),
        "Go packages must share one source boundary"
    );
    if first.has_go_mod {
        ensure!(
            sets.iter()
                .all(|sources| sources.has_go_mod && sources.root == first.root),
            "Go packages compiled into one executable must belong to one Go module; found \
             directories with different go.mod files or without one"
        );
        return Ok(first.root.clone());
    }
    ensure!(
        sets.iter().all(|sources| !sources.has_go_mod),
        "Go packages compiled into one executable must belong to one Go module; found directories \
         with different go.mod files or without one"
    );
    // Without go.mod, each set's root is its own source directory.
    let mut common: Option<Vec<&str>> = None;
    for sources in sets {
        ensure!(
            sources.root.fs == first.root.fs,
            "Go packages must share one filesystem"
        );
        let parts: Vec<&str> = sources
            .root
            .path
            .split('/')
            .filter(|part| !part.is_empty())
            .collect();
        common = Some(match common {
            None => parts,
            Some(common) => common
                .into_iter()
                .zip(parts)
                .take_while(|(a, b)| a == b)
                .map(|(a, _)| a)
                .collect(),
        });
    }
    let root = FileSystemPath {
        fs: first.root.fs,
        path: common.unwrap_or_default().join("/").into(),
    };
    ensure!(
        root == first.boundary || first.boundary.get_path_to(&root).is_some(),
        "Go sources are outside their boundary"
    );
    Ok(root)
}

/// Select the directory Go commands run from and each alias's source directory relative to it.
fn package_root(
    sets: &[(RcStr, ReadRef<GoSourceSet>)],
) -> Result<(FileSystemPath, BTreeMap<RcStr, RcStr>)> {
    for (alias, _) in sets {
        ensure!(
            is_relative_directory(alias),
            "Go package alias must be a module-relative directory: {alias}"
        );
    }
    let root = go_packages_root(
        &sets
            .iter()
            .map(|(_, sources)| &**sources)
            .collect::<Vec<_>>(),
    )?;
    let mut aliases = BTreeMap::new();
    for (alias, sources) in sets {
        let directory = sources.directory()?;
        let relative = if directory == root {
            ""
        } else {
            root.get_path_to(&directory)
                .context("Go package outside its module")?
        };
        ensure!(
            aliases
                .insert(alias.clone(), RcStr::from(relative))
                .is_none(),
            "duplicate Go package alias: {alias}"
        );
    }
    Ok((root, aliases))
}

async fn bundle_sources(
    selection: Selection,
    session: ResolvedVc<GoBuildSession>,
    generated: BTreeMap<RcStr, RcStr>,
) -> Result<Vc<GoBundleResult>> {
    let mut sets = vec![];
    match &selection {
        Selection::Files(sources) => sets.push((RcStr::default(), sources.await?)),
        Selection::Packages(packages, _) => {
            ensure!(!packages.is_empty(), "supply at least one Go package");
            for (alias, sources) in packages {
                sets.push((alias.clone(), sources.await?));
            }
        }
    }
    let boundary = sets[0].1.boundary.clone();
    let go_context = &session.await?.go_context;
    let mut stale = false;
    for (_, sources) in &sets {
        stale |= sources.dirty || !sources.inputs.is_current().await?;
    }
    let mut result = if stale {
        GoBundleResult {
            outcome: GoBuildOutcome::Retry,
            inputs: Inputs::default(),
            root: boundary.clone(),
            session,
        }
    } else {
        let (root, files, aliases, entrypoint) = match &selection {
            Selection::Files(_) => {
                let sources = &sets[0].1;
                (
                    sources.root.clone(),
                    sources.files.keys().cloned().collect(),
                    BTreeMap::new(),
                    None,
                )
            }
            Selection::Packages(_, entrypoint) => {
                let (root, aliases) = package_root(&sets)?;
                (root, vec![], aliases, entrypoint.clone())
            }
        };
        let result = bundle(root, files, *session, generated, aliases, entrypoint).await?;
        stale = !result.is_current().await?;
        for (_, sources) in &sets {
            stale |= !sources.inputs.is_current().await?;
        }
        (*result).clone()
    };
    if stale {
        let project = to_sys_path(boundary.clone())
            .await?
            .context("Go sources require a disk filesystem")?;
        Tracker::new(&boundary, &project, go_context)
            .invalidate()
            .await?;
        result.outcome = GoBuildOutcome::Retry;
    }
    // Preserve the compiler's observations for overlapping inputs. A stale attempt must not
    // replace its compiler fingerprint with the earlier analysis fingerprint.
    for (_, sources) in &sets {
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
    }
    result.root = boundary;
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
        ] {
            assert_eq!(module_directive(go_mod).as_deref(), expected, "{go_mod}");
        }
    }
}
