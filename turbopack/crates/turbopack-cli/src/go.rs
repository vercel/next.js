//! Native CLI consumer: Turbo Tasks owns discovery, invalidation and compilation.
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};

use anyhow::{Context, Result, ensure};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TurboTasks};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_fs::FileSystemPath;
use turbopack_go::{
    GoBuildContext, GoBuildOutcome, filesystem, go_bundle, paths_refer_to_same_file,
    validate_source_path,
};

use crate::arguments::BuildArguments;

fn absolute(path: &Path) -> Result<PathBuf> {
    let path = std::path::absolute(path)?;
    ensure!(
        !std::fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()),
        "output/cache symlinks are unsupported: {}",
        path.display()
    );
    std::fs::create_dir_all(path.parent().context("path has no parent")?)?;
    Ok(std::fs::canonicalize(path.parent().unwrap())?
        .join(path.file_name().context("path has no filename")?))
}

/// Rename a complete graph-owned executable into place. Failed builds retain the last output.
fn publish(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut temp = tempfile::NamedTempFile::new_in(path.parent().unwrap())?;
    temp.write_all(bytes)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        temp.as_file()
            .set_permissions(std::fs::Permissions::from_mode(0o755))?;
    }
    temp.persist(path).map_err(|error| error.error)?;
    Ok(())
}

async fn interrupted() -> Result<()> {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
        tokio::select! { result = tokio::signal::ctrl_c() => result?, _ = term.recv() => {} }
    }
    #[cfg(not(unix))]
    tokio::signal::ctrl_c().await?;
    Ok(())
}

/// Select the source language from the same positional inputs used by JS builds.
pub fn has_go_inputs(args: &BuildArguments) -> Result<bool> {
    let entries = args.common.entries.as_deref().unwrap_or_default();
    let count = entries
        .iter()
        .filter(|entry| Path::new(entry).extension().is_some_and(|ext| ext == "go"))
        .count();
    ensure!(
        count == 0 || count == entries.len(),
        "Go and JavaScript inputs cannot be mixed in one build"
    );
    Ok(count > 0)
}

fn input_files(args: &BuildArguments) -> Result<(PathBuf, Vec<RcStr>)> {
    let base = std::fs::canonicalize(args.common.dir.as_deref().unwrap_or(Path::new(".")))?;
    let entries = args
        .common
        .entries
        .as_ref()
        .context("supply .go input files")?;
    ensure!(!entries.is_empty(), "supply .go input files");
    // Normalize lexically so a missing input can become available in a watch session.
    let paths: Vec<_> = entries
        .iter()
        .map(|entry| {
            let mut path = PathBuf::new();
            for part in base.join(entry).components() {
                match part {
                    std::path::Component::CurDir => {}
                    std::path::Component::ParentDir => {
                        path.pop();
                    }
                    _ => path.push(part.as_os_str()),
                }
            }
            path
        })
        .collect();
    let parent = paths[0].parent().context("input has no directory")?;
    ensure!(
        paths.iter().all(|path| path.parent() == Some(parent)),
        "Go input files must share one directory"
    );
    let module = parent
        .ancestors()
        .find(|path| path.join("go.mod").is_file())
        .or_else(|| parent.ancestors().find(|path| path.is_dir()))
        .context("Go input directory does not exist")?;
    // Validate before canonicalizing the module: standalone entry directories can themselves
    // be symlinks, and resolving them would erase the unsupported source alias.
    let source_root = if module.starts_with(&base) {
        base.as_path()
    } else {
        module
    };
    for path in &paths {
        validate_source_path(source_root, path)?;
    }
    let mut files: Vec<RcStr> = paths
        .iter()
        .map(|path| {
            Ok(path
                .strip_prefix(module)?
                .to_str()
                .context("non-UTF8 Go input")?
                .replace('\\', "/")
                .into())
        })
        .collect::<Result<_>>()?;
    files.sort();
    files.dedup();
    let module = std::fs::canonicalize(module)?;
    if let Some(root) = &args.common.root {
        let root = std::fs::canonicalize(root)?;
        ensure!(module.starts_with(root), "Go module is outside --root");
    }
    Ok((module, files))
}

pub async fn build(build: &BuildArguments) -> Result<()> {
    ensure!(has_go_inputs(build)?, "supply .go input files");
    ensure!(
        build.common.target.is_none(),
        "native Go builds do not accept --target"
    );
    ensure!(
        !build.common.persistent_caching && build.common.cache_dir.is_none(),
        "native Go builds do not support persistent task caching"
    );
    ensure!(
        !build.no_minify && !build.no_sourcemap && !build.no_scope_hoist,
        "JavaScript optimization flags do not apply to Go inputs"
    );
    ensure!(
        build.common.log_level.is_none() && !build.common.show_all && !build.common.log_detail,
        "Go diagnostics do not support JavaScript issue filtering options"
    );
    ensure!(
        !build.common.full_stats,
        "Go builds do not currently expose --full-stats"
    );
    let (project, files) = input_files(build)?;
    let args = &build.go;
    let context = tokio::select! {
        context = GoBuildContext::host(&args.go, args.go_cache.as_deref(), &args.tags) => context?,
        signal = interrupted() => { signal?; return Ok(()); }
    };
    let name = Path::new(&build.common.entries.as_ref().unwrap()[0])
        .file_stem()
        .context("input has no filename")?
        .to_string_lossy();
    let target = absolute(&args.output.clone().unwrap_or_else(|| {
        build
            .common
            .dir
            .as_deref()
            .unwrap_or(Path::new("."))
            .join("dist")
            .join(format!("{name}{}", context.exe_suffix))
    }))?;
    for input in files
        .iter()
        .map(|file| project.join(file.as_str()))
        .chain(["go.mod", "go.sum", "go.work", "go.work.sum"].map(|file| project.join(file)))
    {
        ensure!(
            !paths_refer_to_same_file(&input, &target)?,
            "output must not overwrite Go source or module configuration"
        );
    }
    ensure!(
        target
            .extension()
            .is_none_or(|ext| !ext.eq_ignore_ascii_case("go")),
        "Go output cannot have a .go extension"
    );
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    ));
    let path: RcStr = project.to_str().context("non-UTF8 Go project")?.into();
    let module_cache = context.module_cache.clone();
    let (fs, cache_fs) = tt
        .run_once(async move {
            let fs = filesystem(path).resolve().strongly_consistent().await?;
            let cache_fs = filesystem(module_cache)
                .resolve()
                .strongly_consistent()
                .await?;
            // One-shot builds also need events while discovery/compilation are running.
            fs.await?.start_watching().await?;
            cache_fs.await?.start_watching().await?;
            Ok((fs, cache_fs))
        })
        .await?;
    let cancel = context.clone();
    let signals = tokio::spawn(async move {
        let result = interrupted().await;
        cancel.cancel();
        result
    });
    let mut previous = None;
    let mut previous_error = String::new();
    let result = async {
        loop {
            let build_context = context.clone();
            let inputs = files.clone();
            // Cancel the graph read inside its once task. Dropping only run_once's receiver
            // leaves that task waiting for graph consistency and can block stop_and_wait.
            let result = tt
                .run_once(async move {
                    let root = FileSystemPath { fs: ResolvedVc::upcast(fs), path: rcstr!("") };
                    tokio::select! {
                        result = go_bundle(root, inputs, build_context.clone()).read_strongly_consistent() => result.map(Some),
                        _ = build_context.cancelled() => Ok(None),
                    }
                })
                .await
                .map_err(|error| anyhow::anyhow!("{error:#}"))?;
            let Some(result) = result else {
                break;
            };
            if !result.is_current()? {
                tt.run_once(async move {
                    fs.await?.invalidate();
                    cache_fs.await?.invalidate();
                    Ok(())
                })
                .await?;
                continue;
            }
            match &result.outcome {
                GoBuildOutcome::Success(file) => {
                    let file = *file;
                    if previous != Some(file) || !target.exists() {
                        let bytes = tt
                            .run_once(async move {
                                let file = file.await?;
                                let turbo_tasks_fs::FileContent::Content(file) = &*file else {
                                    anyhow::bail!("missing native executable")
                                };
                                let mut bytes = Vec::new();
                                file.read().read_to_end(&mut bytes)?;
                                Ok(bytes)
                            })
                            .await?;
                        if !result.is_current()? {
                            continue;
                        }
                        ensure!(
                            !result.is_input(&target)?,
                            "output must be outside tracked Go inputs and embed patterns; choose \
                             another --output path"
                        );
                        publish(&target, &bytes)?;
                        println!("native executable: {}", target.display());
                        previous = Some(file);
                    }
                    previous_error.clear();
                }
                GoBuildOutcome::Failed(message) => {
                    let message = message.to_string();
                    if !args.watch {
                        anyhow::bail!("{message}");
                    }
                    if message != previous_error {
                        eprintln!("{message}");
                        previous_error = message;
                    }
                }
                GoBuildOutcome::Retry => continue,
                GoBuildOutcome::Cancelled => break,
            }
            if !args.watch {
                break;
            }
            tokio::select! {
                _ = context.cancelled() => break,
                _ = tokio::time::sleep(Duration::from_millis(100)) => {}
            }
        }
        Ok(())
    }
    .await;
    context.cancel();
    signals.abort();
    tt.run_once(async move {
        fs.await?.stop_watching().await;
        cache_fs.await?.stop_watching().await;
        Ok(())
    })
    .await?;
    tt.stop_and_wait().await;
    result
}

#[cfg(test)]
mod tests {
    use clap::Parser;

    use crate::{
        arguments::{Arguments, BuildArguments},
        go::{has_go_inputs, input_files},
    };

    fn build(arguments: &[&str]) -> BuildArguments {
        let Arguments::Build(args) = Arguments::try_parse_from(arguments).unwrap() else {
            panic!("expected build")
        };
        args
    }

    #[test]
    fn dispatches_by_source_extension() {
        assert!(
            has_go_inputs(&build(&["turbopack-cli", "build", "main.go", "helper.go"])).unwrap()
        );
        assert!(!has_go_inputs(&build(&["turbopack-cli", "build", "main.ts"])).unwrap());
        assert!(has_go_inputs(&build(&["turbopack-cli", "build", "main.go", "main.ts"])).is_err());
        assert!(Arguments::try_parse_from(["turbopack-cli", "go-build"]).is_err());
    }

    #[test]
    fn resolves_file_inputs_and_keeps_missing_files_for_watch() {
        let temp = tempfile::tempdir().unwrap();
        let module = std::fs::canonicalize(temp.path()).unwrap();
        std::fs::write(module.join("go.mod"), "module example.com/files\ngo 1.24\n").unwrap();
        std::fs::create_dir(module.join("cmd")).unwrap();
        let dir = module.join("cmd");
        let args = build(&[
            "turbopack-cli",
            "build",
            "./missing.go",
            "../cmd/helper.go",
            "helper.go",
            "--dir",
            dir.to_str().unwrap(),
            "--watch",
        ]);
        let (root, files) = input_files(&args).unwrap();
        assert_eq!(root, module);
        assert_eq!(
            files.iter().map(|file| file.as_str()).collect::<Vec<_>>(),
            ["cmd/helper.go", "cmd/missing.go"]
        );
        let absolute = dir.join("missing.go");
        let args = build(&["turbopack-cli", "build", absolute.to_str().unwrap()]);
        assert_eq!(input_files(&args).unwrap().1[0].as_str(), "cmd/missing.go");
        let args = build(&[
            "turbopack-cli",
            "build",
            "main.go",
            "cmd/helper.go",
            "--dir",
            module.to_str().unwrap(),
        ]);
        assert!(format!("{:#}", input_files(&args).unwrap_err()).contains("share one directory"));
        let args = build(&[
            "turbopack-cli",
            "build",
            "missing.go",
            "--dir",
            dir.to_str().unwrap(),
            "--root",
            dir.to_str().unwrap(),
        ]);
        assert!(format!("{:#}", input_files(&args).unwrap_err()).contains("outside --root"));
    }
}
