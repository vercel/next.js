#![feature(arbitrary_self_types)]

use std::{collections::BTreeMap, io::Read, path::Path, process::Command};

use anyhow::{Result, ensure};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TurboTasks, Vc};
use turbo_tasks_backend::{
    BackendOptions, BackingStorageOptions, GitVersionInfo, StorageMode, TurboTasksBackend,
    turbo_backing_storage,
};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_go::{
    GoBuildContext, GoBuildOptions, GoBuildOutcome, GoBuildSession, GoBundleResult, filesystem,
    go_bundle_with_session,
};

#[turbo_tasks::function(operation, root)]
fn session_operation(scope: RcStr, options: GoBuildOptions) -> Vc<GoBuildSession> {
    GoBuildSession::persistent(scope, options)
}

#[turbo_tasks::function(operation, root)]
fn persistent_bundle(
    root: FileSystemPath,
    scope: RcStr,
    options: GoBuildOptions,
    generated: BTreeMap<RcStr, RcStr>,
) -> Vc<GoBundleResult> {
    go_bundle_with_session(
        root,
        vec![rcstr!("main.go")],
        GoBuildSession::persistent(scope, options),
        generated,
    )
}

// Each invocation is a fresh OS process, including Turbo Tasks registration and all Rust
// statics. The normal test runner also discovers this helper, in which case it does no work.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn persistent_child() -> Result<()> {
    let Ok(project) = std::env::var("GO_PERSISTENT_TEST_PROJECT") else {
        return Ok(());
    };
    let project = Path::new(&project);
    let mode = std::env::var("GO_PERSISTENT_TEST_MODE")?;
    let tool = std::env::var("TURBOPACK_GO").unwrap_or_else(|_| "go".into());
    let mut probe = GoBuildContext::host(Path::new(&tool), None, "").await?;
    if mode == "toolchain" {
        probe.options.toolchain_fingerprint.push(1);
    }
    if mode == "target" {
        probe.goos = rcstr!("linux");
        probe.goarch = rcstr!("amd64");
    }
    if mode == "tags" {
        probe.tags = rcstr!("persistent_cache_regression");
    }
    let options = probe.options;
    let scope: RcStr = project.to_string_lossy().into_owned().into();
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            storage_mode: Some(StorageMode::ReadWriteOnShutdown),
            small_preallocation: true,
            ..Default::default()
        },
        turbo_backing_storage(
            &project.parent().unwrap().join("task-cache"),
            &GitVersionInfo {
                describe: "go-persistent-test",
                dirty: false,
            },
            BackingStorageOptions {
                is_short_session: true,
                skip_compaction: true,
                ..Default::default()
            },
        )?
        .0,
    ));
    let expected = std::env::var("GO_PERSISTENT_TEST_EXPECTED")?;
    let expected_builds: usize = std::env::var("GO_PERSISTENT_TEST_BUILDS")?.parse()?;
    let output = project
        .parent()
        .unwrap()
        .join(format!("program{}", std::env::consts::EXE_SUFFIX));
    let result = tt
        .run_once(async move {
            let fs = filesystem(scope.clone())
                .resolve()
                .strongly_consistent()
                .await?;
            let session = session_operation(scope.clone(), options.clone())
                .resolve()
                .strongly_consistent()
                .await?;
            let context = session.await?.context.clone();
            ensure!(
                !context.is_cancelled(),
                "restored a previous process's cancellation"
            );
            let other = session_operation(format!("{scope}/other-owner").into(), options.clone())
                .read_strongly_consistent()
                .await?
                .context
                .clone();
            other.cancel();
            ensure!(!context.is_cancelled(), "owners shared cancellation state");
            let generated = BTreeMap::from([(
                rcstr!("generated.go"),
                if mode == "generated" {
                    rcstr!("package main\nfunc generated() string { return \"generated-v2\" }\n")
                } else {
                    rcstr!("package main\nfunc generated() string { return \"generated-v1\" }\n")
                },
            )]);
            let result = persistent_bundle(
                FileSystemPath {
                    fs: ResolvedVc::upcast(fs),
                    path: rcstr!(""),
                },
                scope,
                options,
                generated,
            )
            .read_strongly_consistent()
            .await?;
            ensure!(result.is_current()?, "restored stale input stamps");
            match &result.outcome {
                GoBuildOutcome::Failed(message) if expected == "error" => {
                    ensure!(message.contains("syntax error"), "{message}");
                }
                GoBuildOutcome::Success(file) if expected != "error" => {
                    let content = (*file).await?;
                    let FileContent::Content(file) = &*content else {
                        anyhow::bail!("missing executable")
                    };
                    let mut bytes = vec![];
                    file.read().read_to_end(&mut bytes)?;
                    std::fs::write(&output, bytes)?;
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        std::fs::set_permissions(&output, std::fs::Permissions::from_mode(0o755))?;
                    }
                    if mode == "target" {
                        ensure!(
                            std::fs::read(&output)?.starts_with(b"\x7fELF"),
                            "target did not produce ELF"
                        );
                    } else {
                        let response = Command::new(output).output()?;
                        ensure!(response.status.success(), "executable failed");
                        assert_eq!(String::from_utf8(response.stdout)?.trim(), expected);
                    }
                }
                other => anyhow::bail!("unexpected build outcome: {other:?}"),
            }
            assert_eq!(
                context.invocation_counts().1,
                expected_builds,
                "Go build invocations"
            );
            context.cancel();
            ensure!(
                session.await?.context.is_cancelled(),
                "shutdown cancelled the wrong runtime"
            );
            anyhow::Ok(())
        })
        .await;
    tt.stop_and_wait().await;
    result
}

#[test]
fn executable_cache_survives_processes_and_invalidates_inputs() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let project = temp.path().join("project");
    std::fs::create_dir_all(project.join("internal/message"))?;
    let project = std::fs::canonicalize(project)?;
    std::fs::write(
        project.join("go.mod"),
        "module example.com/persistent\ngo 1.24\n",
    )?;
    let main = "package main\nimport (\"fmt\"; _ \"embed\"; \
                \"example.com/persistent/internal/message\")\n//go:embed asset.txt\nvar asset \
                string\nfunc main() { fmt.Println(message.Value + \":\" + asset + \":\" + \
                generated()) }\n";
    std::fs::write(project.join("main.go"), main)?;
    std::fs::write(project.join("asset.txt"), "asset-v1")?;
    std::fs::write(
        project.join("internal/message/message.go"),
        "package message\nconst Value = \"dependency-v1\"\n",
    )?;
    let run = |mode: &str, expected: &str, builds: usize| -> Result<()> {
        let output = Command::new(std::env::current_exe()?)
            .args(["--exact", "persistent_child", "--nocapture"])
            .env("GO_PERSISTENT_TEST_PROJECT", &project)
            .env("GO_PERSISTENT_TEST_MODE", mode)
            .env("GO_PERSISTENT_TEST_EXPECTED", expected)
            .env("GO_PERSISTENT_TEST_BUILDS", builds.to_string())
            .output()?;
        ensure!(
            output.status.success(),
            "{mode}:\n{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        Ok(())
    };
    run("cold", "dependency-v1:asset-v1:generated-v1", 1)?;
    run("warm", "dependency-v1:asset-v1:generated-v1", 0)?;
    std::fs::write(
        project.join("internal/message/message.go"),
        "package message\nconst Value = \"dependency-v2\"\n",
    )?;
    run("dependency", "dependency-v2:asset-v1:generated-v1", 1)?;
    std::fs::write(project.join("asset.txt"), "asset-v2")?;
    run("embed", "dependency-v2:asset-v2:generated-v1", 1)?;
    std::fs::write(project.join("main.go"), format!("{main}\ninvalid syntax\n"))?;
    run("syntax", "error", 1)?;
    run("syntax-retry", "error", 1)?;
    std::fs::write(project.join("main.go"), main)?;
    run("repair", "dependency-v2:asset-v2:generated-v1", 1)?;
    run("generated", "dependency-v2:asset-v2:generated-v2", 1)?;
    run("toolchain", "dependency-v2:asset-v2:generated-v1", 1)?;
    run("tags", "dependency-v2:asset-v2:generated-v1", 1)?;
    // Distinct from the host target on macOS/Windows; on Linux/amd64 the earlier host
    // result is already the requested target and should be reused.
    let target_builds =
        usize::from(std::env::consts::OS != "linux" || std::env::consts::ARCH != "x86_64");
    run(
        "target",
        "dependency-v2:asset-v2:generated-v1",
        target_builds,
    )?;
    run("warm", "dependency-v2:asset-v2:generated-v1", 0)?;
    Ok(())
}
