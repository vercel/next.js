#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use std::{
    collections::BTreeMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::{Context, Result, ensure};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TurboTasks};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_fs::{DiskFileSystem, FileContent, FileSystemPath};
use turbopack_go::{
    GoBuildContext, GoBuildOutcome, filesystem, filesystem_with_poll_interval,
    go_bundle_with_generated_files,
};

fn copy_tree(source: &Path, target: &Path) -> Result<()> {
    std::fs::create_dir_all(target)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            copy_tree(&entry.path(), &target.join(entry.file_name()))?;
        } else {
            std::fs::copy(entry.path(), target.join(entry.file_name()))?;
        }
    }
    Ok(())
}

struct Session {
    temp: tempfile::TempDir,
    project: PathBuf,
    tt: Arc<TurboTasks<TurboTasksBackend>>,
    fs: ResolvedVc<DiskFileSystem>,
    go_context: GoBuildContext,
}
impl Session {
    async fn new() -> Result<Self> {
        let temp = tempfile::tempdir()?;
        let project = temp.path().join("project");
        copy_tree(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixture"),
            &project,
        )?;
        let project = std::fs::canonicalize(project)?;
        // The documented fixture is also used for manual edits. Give each test its own
        // deterministic initial asset without modifying that working example.
        std::fs::write(project.join("cmd/files/assets/message.txt"), "embedded-v1")?;
        let tool = std::env::var("TURBOPACK_GO").unwrap_or_else(|_| "go".into());
        let go_context = GoBuildContext::host(Path::new(&tool), None, "").await?;
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: None,
                small_preallocation: true,
                ..Default::default()
            },
            noop_backing_storage(),
        ));
        let path: RcStr = project.to_string_lossy().into_owned().into();
        let fs = tt
            .run_once(async move { filesystem(path).resolve().strongly_consistent().await })
            .await?;
        Ok(Self {
            temp,
            project,
            tt,
            fs,
            go_context,
        })
    }
    async fn fetch(&self, files: &[&str]) -> Result<Vec<u8>> {
        self.fetch_generated(files, BTreeMap::new()).await
    }
    async fn fetch_generated(
        &self,
        files: &[&str],
        generated: BTreeMap<RcStr, RcStr>,
    ) -> Result<Vec<u8>> {
        let files = files.iter().map(|file| RcStr::from(*file)).collect();
        let fs = self.fs;
        let go_context = self.go_context.clone();
        self.tt
            .run_once(async move {
                let result = go_bundle_with_generated_files(
                    FileSystemPath {
                        fs: ResolvedVc::upcast(fs),
                        path: rcstr!(""),
                    },
                    files,
                    go_context,
                    generated,
                )
                .read_strongly_consistent()
                .await?;
                ensure!(result.is_current()?, "stale result");
                let file = match &result.outcome {
                    GoBuildOutcome::Success(file) => *file,
                    GoBuildOutcome::Failed(message) => anyhow::bail!("{message}"),
                    GoBuildOutcome::Retry => {
                        anyhow::bail!("Go inputs changed during the build; retry")
                    }
                    GoBuildOutcome::Cancelled => anyhow::bail!("Go build cancelled"),
                }
                .await?;
                let FileContent::Content(file) = &*file else {
                    anyhow::bail!("missing executable")
                };
                let mut bytes = Vec::new();
                file.read().read_to_end(&mut bytes)?;
                Ok(bytes)
            })
            .await
    }
    async fn invalidate(&self) -> Result<()> {
        let fs = self.fs;
        self.tt
            .run_once(async move {
                fs.await?.invalidate();
                Ok(())
            })
            .await
    }
    async fn write(&self, path: &str, text: &str) -> Result<()> {
        let target = self.project.join(path);
        std::fs::create_dir_all(target.parent().unwrap())?;
        std::fs::write(target, text)?;
        self.invalidate().await
    }
    async fn replace(&self, path: &str, before: &str, after: &str) -> Result<()> {
        let text = std::fs::read_to_string(self.project.join(path))?;
        assert!(text.contains(before));
        self.write(path, &text.replace(before, after)).await
    }
    fn counts(&self) -> (usize, usize) {
        self.go_context.invocation_counts()
    }
    async fn run(&self, files: &[&str]) -> Result<String> {
        self.run_bytes(self.fetch(files).await?).await
    }
    async fn run_bytes(&self, bytes: Vec<u8>) -> Result<String> {
        let path = self
            .temp
            .path()
            .join(format!("program{}", std::env::consts::EXE_SUFFIX));
        let mut temp = tempfile::NamedTempFile::new_in(self.temp.path())?;
        temp.write_all(&bytes)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            temp.as_file()
                .set_permissions(std::fs::Permissions::from_mode(0o755))?;
        }
        // Close the writable handle before publishing the executable.
        temp.into_temp_path()
            .persist(&path)
            .map_err(|error| error.error)?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        let output = loop {
            match tokio::process::Command::new(&path).output().await {
                Ok(output) => break output,
                // A concurrently forked compiler can briefly inherit a writable handle
                // until exec closes it, even after this process has closed its own handle.
                Err(error)
                    if error.kind() == std::io::ErrorKind::ExecutableFileBusy
                        && std::time::Instant::now() < deadline =>
                {
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                }
                Err(error) => return Err(error.into()),
            }
        };
        ensure!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        Ok(String::from_utf8(output.stdout)?)
    }
    async fn body(&self, expected: &str) -> Result<()> {
        let json: serde_json::Value = serde_json::from_str(&self.run(FILES).await?)?;
        assert_eq!(json["body"], expected);
        Ok(())
    }
    async fn eventually_run(&self, files: &[&str], expected: &str) -> Result<()> {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
        loop {
            let observed = self.run(files).await;
            if observed
                .as_ref()
                .is_ok_and(|output| output.trim() == expected)
            {
                return Ok(());
            }
            ensure!(
                std::time::Instant::now() < deadline,
                "timed out waiting for {expected}: {observed:?}"
            );
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    }
    async fn stop(self) {
        self.tt.stop_and_wait().await;
    }
}
const FILES: &[&str] = &["cmd/files/main.go", "cmd/files/helper.go"];

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn explicit_files_memoization_dependencies_and_recovery() -> Result<()> {
    let session = Session::new().await?;
    let reordered = [FILES[1], FILES[0], FILES[0]];
    let (a, b) = tokio::join!(session.fetch(FILES), session.fetch(&reordered));
    assert_eq!(a?, b?);
    session.body("explicit-v1:helper-v1:embedded-v1").await?;
    assert_eq!(session.counts(), (2, 1));
    assert_eq!(session.go_context.module_configuration_invocations(), 1);
    session
        .replace(
            "cmd/files/unused.go",
            "unlisted sibling must not run",
            "still excluded",
        )
        .await?;
    session.body("explicit-v1:helper-v1:embedded-v1").await?;
    // write() explicitly invalidates the entire filesystem, including discovery.
    // Go's resulting inputs still exclude this sibling, so compilation is reused.
    assert_eq!(session.counts().1, 1, "unlisted contents must not rebuild");
    let before = session.counts();
    session
        .replace("cmd/files/helper.go", "explicit-v1", "explicit-v2")
        .await?;
    session.body("explicit-v2:helper-v1:embedded-v1").await?;
    assert!(
        session.counts().0 >= before.0 + 2,
        "Go must rediscover source edits"
    );
    assert_eq!(session.counts().1, before.1 + 1);
    let before = session.counts();
    session
        .replace("internal/message/message.go", "helper-v1", "helper-v2")
        .await?;
    session.body("explicit-v2:helper-v2:embedded-v1").await?;
    assert!(
        session.counts().0 >= before.0 + 2,
        "Go must rediscover imported source edits"
    );
    assert_eq!(session.counts().1, before.1 + 1);
    let before = session.counts();
    session
        .write("cmd/files/assets/message.txt", "embedded-v2")
        .await?;
    session.body("explicit-v2:helper-v2:embedded-v2").await?;
    assert!(session.counts().0 >= before.0 + 2);
    assert_eq!(session.counts().1, before.1 + 1);
    assert_eq!(
        session.go_context.module_configuration_invocations(),
        1,
        "source and asset edits must reuse Go's module configuration"
    );
    session
        .write(
            "internal/helper/added.go",
            "package helper\nfunc init() { panic(\"included dependency sibling\") }\n",
        )
        .await?;
    assert!(
        session
            .run(FILES)
            .await
            .unwrap_err()
            .to_string()
            .contains("included dependency sibling")
    );
    std::fs::remove_file(session.project.join("internal/helper/added.go"))?;
    session.invalidate().await?;
    session.body("explicit-v2:helper-v2:embedded-v2").await?;
    session
        .write(
            "cmd/files/helper.go",
            "package main\nfunc value() string { invalid Go }\n",
        )
        .await?;
    assert!(
        session
            .fetch(FILES)
            .await
            .unwrap_err()
            .to_string()
            .contains("syntax error")
    );
    let failed = session.counts();
    assert!(session.fetch(FILES).await.is_err());
    assert_eq!(
        session.counts(),
        failed,
        "unchanged errors must be memoized"
    );
    session
        .write(
            "cmd/files/helper.go",
            "package main\nfunc value() string { return \"repaired\" }\n",
        )
        .await?;
    session.body("repaired:helper-v2:embedded-v2").await?;
    session.stop().await;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn missing_inputs_imports_and_embed_matches() -> Result<()> {
    let session = Session::new().await?;
    let files = [FILES[0], "cmd/files/missing.go"];
    assert!(session.fetch(&files).await.is_err());
    session
        .write(
            "cmd/files/missing.go",
            "package main\nfunc value() string { return \"created\" }\n",
        )
        .await?;
    assert!(
        session
            .run(&files)
            .await?
            .contains("created:helper-v1:embedded-v1")
    );
    session
        .write(
            "internal/helper/helper.go",
            "package helper\nimport \"example.com/native-fixture/internal/missing\"\nfunc \
             Message() string { return missing.Text() }\n",
        )
        .await?;
    assert!(
        session
            .fetch(FILES)
            .await
            .unwrap_err()
            .to_string()
            .contains("missing")
    );
    session
        .write(
            "internal/missing/missing.go",
            "package missing\nfunc Text() string { return \"created-import\" }\n",
        )
        .await?;
    session
        .body("explicit-v1:created-import:embedded-v1")
        .await?;
    session
        .replace(
            "cmd/files/main.go",
            "var assets embed.FS",
            "var assets embed.FS",
        )
        .await?;
    session
        .write(
            "embed.go",
            "package main\nimport (\"embed\"; \"fmt\")\n//go:embed all:cmd/files/assets/*\nvar \
             files embed.FS\nfunc main() { names, _ := files.ReadDir(\"cmd/files/assets\"); \
             fmt.Println(len(names)) }\n",
        )
        .await?;
    assert_eq!(session.run(&["embed.go"]).await?.trim(), "1");
    session
        .write("cmd/files/assets/.hidden", "included")
        .await?;
    assert_eq!(session.run(&["embed.go"]).await?.trim(), "2");
    std::fs::remove_file(session.project.join("cmd/files/assets/.hidden"))?;
    session.invalidate().await?;
    assert_eq!(session.run(&["embed.go"]).await?.trim(), "1");
    session.stop().await;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn module_root_package_creation_and_replacement_invalidate_discovery() -> Result<()> {
    let session = Session::new().await?;
    let files = ["cmd/app/main.go"];
    session
        .write(
            files[0],
            "package main\nimport (\"fmt\"; root \"example.com/native-fixture\")\nfunc main() { \
             fmt.Println(root.Text()) }\n",
        )
        .await?;
    let fs = session.fs;
    session
        .tt
        .run_once(async move {
            fs.await?.start_watching().await?;
            Ok(())
        })
        .await?;

    let result = async {
        let error = session.fetch(&files).await.unwrap_err().to_string();
        assert!(error.contains("example.com/native-fixture"), "{error}");
        let failed = session.counts();
        assert!(session.fetch(&files).await.is_err());
        assert_eq!(session.counts(), failed, "the initial failure is memoized");

        // Do not use Session::write here: only watcher events may invalidate discovery.
        let source = session.project.join("root.go");
        std::fs::write(
            &source,
            "package root\nfunc Text() string { return \"created-root-package\" }\n",
        )?;
        wait_for_output(&session, &files, "created-root-package").await?;

        // Losing the last source file must keep observing the root directory, even though
        // go list stops reporting both the package's Dir and its old source filename.
        std::fs::remove_file(source)?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
        loop {
            if let Err(error) = session.fetch(&files).await
                && error.to_string().contains("example.com/native-fixture")
            {
                break;
            }
            ensure!(
                std::time::Instant::now() < deadline,
                "removing the module-root package did not invalidate discovery"
            );
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        std::fs::write(
            session.project.join("replacement.go"),
            "package root\nfunc Text() string { return \"replaced-root-package\" }\n",
        )?;
        wait_for_output(&session, &files, "replaced-root-package").await
    }
    .await;

    session
        .tt
        .run_once(async move {
            fs.await?.stop_watching().await;
            Ok(())
        })
        .await?;
    session.stop().await;
    result
}

async fn wait_for_output(session: &Session, files: &[&str], expected: &str) -> Result<()> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
    loop {
        let observed = session.run(files).await;
        if observed
            .as_ref()
            .is_ok_and(|output| output.trim() == expected)
        {
            return Ok(());
        }
        ensure!(
            std::time::Instant::now() < deadline,
            "watcher did not rebuild {expected}: {observed:?}"
        );
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn standalone_and_unsupported_configuration() -> Result<()> {
    let mut session = Session::new().await?;
    let original_cache = session.go_context.cache.clone();
    let original_module_cache = session.go_context.module_cache.clone();
    let modules = session.temp.path().join("modules");
    std::fs::create_dir(&modules)?;
    session.go_context.module_cache = std::fs::canonicalize(modules)?
        .to_string_lossy()
        .into_owned()
        .into();
    for cache in [
        session.project.join("cmd/files/assets/cache"),
        session.project.clone(),
        session.temp.path().to_owned(),
        Path::new(session.go_context.module_cache.as_str()).join("build-cache"),
    ] {
        std::fs::create_dir_all(&cache)?;
        session.go_context.cache = std::fs::canonicalize(&cache)?
            .to_string_lossy()
            .into_owned()
            .into();
        let error = tokio::time::timeout(std::time::Duration::from_secs(15), session.fetch(FILES))
            .await?
            .err()
            .ok_or_else(|| anyhow::anyhow!("overlapping build cache unexpectedly succeeded"))?
            .to_string();
        assert!(error.contains("Go build cache must be outside"), "{error}");
        assert_eq!(
            session.counts(),
            (0, 0),
            "reject before invoking discovery or compilation"
        );
    }
    session.go_context.cache = original_cache;
    session.go_context.module_cache = original_module_cache;
    std::fs::remove_file(session.project.join("go.mod"))?;
    session
        .write(
            "main.go",
            "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"standalone\") }\n",
        )
        .await?;
    assert_eq!(session.run(&["main.go"]).await?.trim(), "standalone");
    assert_eq!(session.counts(), (1, 1));
    assert_eq!(session.go_context.module_configuration_invocations(), 0);
    assert_eq!(session.run(&["main.go"]).await?.trim(), "standalone");
    assert_eq!(session.counts(), (1, 1), "unchanged inputs must do no work");
    let before = session.counts();
    session.replace("main.go", "standalone", "edited").await?;
    assert_eq!(session.run(&["main.go"]).await?.trim(), "edited");
    assert_eq!(
        session.counts().1,
        before.1 + 1,
        "Go rediscovers edited source files"
    );
    assert!(session.counts().0 > before.0);
    let before = session.counts();
    session
        .write("go.mod", "module example.com/native-fixture\ngo 1.24\n")
        .await?;
    assert_eq!(session.run(&["main.go"]).await?.trim(), "edited");
    assert_eq!(session.counts().1, before.1 + 1);
    assert!(session.counts().0 > before.0);
    assert_eq!(session.go_context.module_configuration_invocations(), 1);
    let before = session.counts();
    session.replace("main.go", "edited", "module-edit").await?;
    assert_eq!(session.run(&["main.go"]).await?.trim(), "module-edit");
    assert_eq!(session.counts().1, before.1 + 1);
    assert!(session.counts().0 > before.0);
    let unchanged = session.counts();
    assert_eq!(session.run(&["main.go"]).await?.trim(), "module-edit");
    assert_eq!(session.counts(), unchanged);
    assert_eq!(session.go_context.module_configuration_invocations(), 1);
    session
        .write("go.mod", "module example.com/renamed\ngo 1.24\n")
        .await?;
    assert_eq!(session.run(&["main.go"]).await?.trim(), "module-edit");
    assert_eq!(session.go_context.module_configuration_invocations(), 2);
    session
        .write(
            "go.mod",
            "module example.com/native-fixture\ngo 1.24\nreplace example.com/outside => \
             ../outside\n",
        )
        .await?;
    assert!(
        session
            .fetch(&["main.go"])
            .await
            .unwrap_err()
            .to_string()
            .contains("replacements")
    );
    session
        .write("go.mod", "module example.com/native-fixture\ngo 1.24\n")
        .await?;
    session.write("go.work", "go 1.24\nuse .\n").await?;
    assert!(
        session
            .fetch(&["main.go"])
            .await
            .unwrap_err()
            .to_string()
            .contains("workspaces")
    );
    std::fs::remove_file(session.project.join("go.work"))?;
    session.invalidate().await?;
    assert!(
        session
            .fetch(&["main.go", FILES[1]])
            .await
            .unwrap_err()
            .to_string()
            .contains("share one directory")
    );
    session
        .write("cancelled.go", "package main\nfunc main() {}\n")
        .await?;
    session.go_context.cancel();
    assert_eq!(
        session
            .fetch(&["cancelled.go"])
            .await
            .err()
            .unwrap()
            .to_string(),
        "Go build cancelled"
    );
    session.stop().await;
    Ok(())
}

#[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn assembly_dependencies_track_sources_headers_and_recover_from_errors() -> Result<()> {
    let session = Session::new().await?;
    session
        .write(
            "main.go",
            "package main\nimport (\"fmt\"; \
             \"example.com/native-fixture/internal/assembly\")\nfunc main() { \
             fmt.Println(assembly.Value()) }\n",
        )
        .await?;
    assert_eq!(session.run(&["main.go"]).await?.trim(), "42");
    let first = session.counts();
    assert_eq!(session.run(&["main.go"]).await?.trim(), "42");
    assert_eq!(
        session.counts(),
        first,
        "unchanged assembly must be memoized"
    );

    // This nested .inc file is absent from go list's HFiles. Its contents must still
    // participate in the build plan, rather than depending only on directory inventories.
    session
        .replace("internal/assembly/values/constants.inc", "41", "51")
        .await?;
    assert_eq!(session.run(&["main.go"]).await?.trim(), "52");
    assert_eq!(session.counts().1, first.1 + 1);

    let assembly = format!("internal/assembly/value_{}.s", session.go_context.goarch);
    session
        .replace(&assembly, "ASSEMBLY_EXTRA 1", "ASSEMBLY_EXTRA 2")
        .await?;
    assert_eq!(session.run(&["main.go"]).await?.trim(), "53");
    assert_eq!(session.counts().1, first.1 + 2);

    session
        .replace("internal/assembly/values/constants.inc", "51", "invalid")
        .await?;
    let failure = session.fetch(&["main.go"]).await.unwrap_err().to_string();
    assert!(failure.contains("assembly"), "{failure}");
    session
        .replace("internal/assembly/values/constants.inc", "invalid", "61")
        .await?;
    assert_eq!(session.run(&["main.go"]).await?.trim(), "63");

    // A missing nested include must retain dependencies that observe its later creation.
    std::fs::remove_file(
        session
            .project
            .join("internal/assembly/values/constants.inc"),
    )?;
    session.invalidate().await?;
    assert!(session.fetch(&["main.go"]).await.is_err());
    session
        .write(
            "internal/assembly/values/constants.inc",
            "#define ASSEMBLY_VALUE 71\n",
        )
        .await?;
    assert_eq!(session.run(&["main.go"]).await?.trim(), "73");
    session.stop().await;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn imported_build_tags_are_applied_consistently() -> Result<()> {
    let mut session = Session::new().await?;
    session
        .write(
            "internal/message/message.go",
            "//go:build !special\n\npackage message\nfunc Text() string { return \"default\" }\n",
        )
        .await?;
    // Inspect the actual fixture's function name; imported Go package selection includes tags.
    session
        .write(
            "internal/message/special.go",
            "//go:build special\n\npackage message\nfunc Text() string { return \"special\" }\n",
        )
        .await?;
    session
        .write(
            "internal/helper/helper.go",
            "package helper\nimport \"example.com/native-fixture/internal/message\"\nfunc \
             Message() string { return message.Text() }\n",
        )
        .await?;
    session.body("explicit-v1:default:embedded-v1").await?;
    session.go_context.tags = rcstr!("special");
    session.body("explicit-v1:special:embedded-v1").await?;
    session.stop().await;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn versioned_dependencies_use_the_module_cache_without_downloads() -> Result<()> {
    let mut session = Session::new().await?;
    session
        .write(
            "go.mod",
            "module example.com/native-fixture\ngo 1.24\nrequire example.com/library v1.0.0\n",
        )
        .await?;
    session
        .write(
            "main.go",
            "package main\nimport (\"fmt\"; \"example.com/library\")\nfunc main() { \
             fmt.Println(library.Text()) }\n",
        )
        .await?;
    let cache = session.temp.path().join("modules");
    std::fs::create_dir_all(&cache)?;
    session.go_context.module_cache = std::fs::canonicalize(&cache)?
        .to_string_lossy()
        .into_owned()
        .into();
    session
        .write("go.sum", include_str!("dependency-proxy/go.sum"))
        .await?;
    let original_mod = std::fs::read(session.project.join("go.mod"))?;
    let original_sum = std::fs::read(session.project.join("go.sum"))?;
    let sum = std::fs::metadata(session.project.join("go.sum"))?.modified()?;
    // Exercise actual automatic invalidation even where the host does not deliver native events.
    session.go_context.poll_interval_ms = Some(20);
    let cache_path = session.go_context.module_cache.clone();
    let poll_interval_ms = session.go_context.poll_interval_ms;
    let cache_fs = session
        .tt
        .run_once(async move {
            let fs = filesystem_with_poll_interval(cache_path, poll_interval_ms)
                .resolve()
                .strongly_consistent()
                .await?;
            fs.await?.start_watching().await?;
            Ok(fs)
        })
        .await?;
    assert!(
        session.fetch(&["main.go"]).await.is_err(),
        "downloads must be disabled"
    );
    assert_eq!(std::fs::read(session.project.join("go.mod"))?, original_mod);
    assert_eq!(std::fs::read(session.project.join("go.sum"))?, original_sum);
    let proxy = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/dependency-proxy");
    let proxy = proxy.to_string_lossy().replace('\\', "/");
    let proxy = if cfg!(windows) {
        format!("file:///{proxy}")
    } else {
        format!("file://{proxy}")
    };
    let output = tokio::process::Command::new(session.go_context.go.as_str())
        .current_dir(&session.project)
        .env("GOENV", "off")
        .env("GOTOOLCHAIN", "local")
        .env("GOWORK", "off")
        .env("GOPROXY", proxy)
        .env("GOSUMDB", "off")
        .env("GOMODCACHE", &cache)
        .env("GOFLAGS", "-modcacherw")
        .args(["mod", "download", "example.com/library"])
        .output()
        .await?;
    ensure!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        std::fs::metadata(session.project.join("go.sum"))?.modified()?,
        sum,
        "cache repair must not depend on go.sum being rewritten"
    );
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
    loop {
        let error = match session.fetch(&["main.go"]).await {
            Ok(bytes) => {
                assert_eq!(
                    session.run_bytes(bytes).await?.trim(),
                    "versioned-dependency"
                );
                break;
            }
            Err(error) => error,
        };
        ensure!(
            std::time::Instant::now() < deadline,
            "module-cache watcher did not repair discovery (invocations {:?}): {error:#}",
            session.counts(),
        );
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
    {
        // Imported module-cache sources use a different Tasks filesystem from the project.
        // Mutating real assembly and a nested header must rebuild through that watcher too.
        // The module cache is immutable to Go's package index. Establish the added assembly
        // fixture with a fresh build cache before asserting edits to existing assembly files.
        let assembly_cache = session.temp.path().join("assembly-build-cache");
        std::fs::create_dir_all(&assembly_cache)?;
        session.go_context.cache = std::fs::canonicalize(assembly_cache)?
            .to_string_lossy()
            .into_owned()
            .into();
        let library = cache.join("example.com/library@v1.0.0");
        let source = library.join("library.go");
        let original = std::fs::read(&source)?;
        // -modcacherw keeps module directories writable; extracted source files can still be
        // read-only. Make this isolated fixture writable while exercising cache edits.
        let original_permissions = std::fs::metadata(&source)?.permissions();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(
                &source,
                std::fs::Permissions::from_mode(original_permissions.mode() | 0o200),
            )?;
        }
        #[cfg(windows)]
        {
            let mut writable = original_permissions.clone();
            writable.set_readonly(false);
            std::fs::set_permissions(&source, writable)?;
        }
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixture/internal/assembly");
        for name in ["value_amd64.s", "value_arm64.s", "value.h"] {
            let content =
                std::fs::read_to_string(fixture.join(name))?.replace("·Value", "·assemblyValue");
            std::fs::write(library.join(name), content)?;
        }
        copy_tree(&fixture.join("values"), &library.join("values"))?;
        std::fs::write(
            &source,
            "package library\nfunc assemblyValue() uint64\nfunc Text() string { switch \
             assemblyValue() { case 42: return \"external-42\"; case 44: return \"external-44\"; \
             case 54: return \"external-54\"; default: return \"unexpected assembly value\" } }\n",
        )
        .context("editing the isolated module-cache Go source")?;
        session.eventually_run(&["main.go"], "external-42").await?;
        let before = session.counts().1;
        let assembly = library.join(format!("value_{}.s", session.go_context.goarch));
        let content = std::fs::read_to_string(&assembly)?;
        std::fs::write(
            &assembly,
            content.replace("ASSEMBLY_EXTRA 1", "ASSEMBLY_EXTRA 3"),
        )?;
        session.eventually_run(&["main.go"], "external-44").await?;
        assert!(
            session.counts().1 > before,
            "external assembly must rebuild"
        );
        let before = session.counts().1;
        std::fs::write(
            library.join("values/constants.inc"),
            "#define ASSEMBLY_VALUE 51\n",
        )?;
        session.eventually_run(&["main.go"], "external-54").await?;
        assert!(
            session.counts().1 > before,
            "external assembly headers must rebuild"
        );

        std::fs::write(&source, original)?;
        std::fs::set_permissions(source, original_permissions)?;
        // Keep the indexed assembly inventory intact until the temporary cache is removed.
        session
            .eventually_run(&["main.go"], "versioned-dependency")
            .await?;
    }
    session
        .tt
        .run_once(async move {
            cache_fs.await?.stop_watching().await;
            Ok(())
        })
        .await?;
    assert_eq!(
        session.run(&["main.go"]).await?.trim(),
        "versioned-dependency"
    );
    assert_eq!(std::fs::read(session.project.join("go.mod"))?, original_mod);
    assert_eq!(std::fs::read(session.project.join("go.sum"))?, original_sum);
    assert_eq!(
        session.run(&["main.go"]).await?.trim(),
        "versioned-dependency"
    );
    assert_eq!(std::fs::read(session.project.join("go.mod"))?, original_mod);
    assert_eq!(std::fs::read(session.project.join("go.sum"))?, original_sum);
    // A hot cache must not make Go silently populate missing checksums. These cases
    // would succeed and write go.sum if discovery accidentally switched to -mod=mod.
    let partial_sum = include_str!("dependency-proxy/go.sum")
        .lines()
        .filter(|line| line.contains("/go.mod "))
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    for checksums in [None, Some(partial_sum.as_bytes())] {
        if let Some(checksums) = checksums {
            std::fs::write(session.project.join("go.sum"), checksums)?;
        } else {
            std::fs::remove_file(session.project.join("go.sum"))?;
        }
        session.invalidate().await?;
        let error = session
            .fetch(&["main.go"])
            .await
            .err()
            .ok_or_else(|| anyhow::anyhow!("build unexpectedly succeeded with missing checksums"))?
            .to_string();
        ensure!(
            error.contains("missing go.sum entry") && error.contains("example.com/library"),
            "{error}"
        );
        assert_eq!(std::fs::read(session.project.join("go.mod"))?, original_mod);
        if let Some(checksums) = checksums {
            assert_eq!(std::fs::read(session.project.join("go.sum"))?, checksums);
        } else {
            assert!(
                !session.project.join("go.sum").exists(),
                "build must not create go.sum"
            );
        }
        // Repair only checksums; keep the same module, source and populated cache.
        session
            .write("go.sum", include_str!("dependency-proxy/go.sum"))
            .await?;
        let first = session.fetch(&["main.go"]).await?;
        assert_eq!(
            session.run_bytes(first).await?.trim(),
            "versioned-dependency"
        );
        assert_eq!(std::fs::read(session.project.join("go.mod"))?, original_mod);
        assert_eq!(std::fs::read(session.project.join("go.sum"))?, original_sum);
    }
    session.stop().await;
    Ok(())
}

#[derive(Clone, Copy, Debug)]
enum RaceChange {
    Body,
    Graph,
    #[cfg(unix)]
    RestoredMtime,
    #[cfg(unix)]
    EditAndRestore,
    #[cfg(unix)]
    Replacement,
    #[cfg(unix)]
    ModuleRestore,
}

struct CancelOnDrop(GoBuildContext);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        self.0.cancel();
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn edits_during_discovery_and_compilation_retry_before_publication() -> Result<()> {
    use std::time::{Duration, Instant};
    let tool = std::env::var("TURBOPACK_GO").unwrap_or_else(|_| "go".into());
    let host = GoBuildContext::host(Path::new(&tool), None, "").await?;
    let tools = tempfile::tempdir()?;
    let wrapper = tools
        .path()
        .join(format!("controlled-go{}", std::env::consts::EXE_SUFFIX));
    let compiled = tokio::process::Command::new(host.go.as_str())
        .env("GOENV", "off")
        .env("GOTOOLCHAIN", "local")
        .env("GOWORK", "off")
        .env("CGO_ENABLED", "0")
        .env("GOPROXY", "off")
        .env("GOFLAGS", "")
        .env("GOROOT", host.goroot.as_str())
        .env("GOOS", host.goos.as_str())
        .env("GOARCH", host.goarch.as_str())
        .env("GOCACHE", host.cache.as_str())
        .args(["build", "-o"])
        .arg(&wrapper)
        .arg(Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/controlled-go/main.go"))
        .output()
        .await?;
    ensure!(
        compiled.status.success(),
        "{}",
        String::from_utf8_lossy(&compiled.stderr)
    );
    std::fs::write(
        tools.path().join(format!(
            "controlled-go{}.go-path",
            std::env::consts::EXE_SUFFIX
        )),
        host.go.as_str(),
    )?;
    let changes = [
        RaceChange::Body,
        RaceChange::Graph,
        #[cfg(unix)]
        RaceChange::RestoredMtime,
        #[cfg(unix)]
        RaceChange::EditAndRestore,
        #[cfg(unix)]
        RaceChange::Replacement,
        #[cfg(unix)]
        RaceChange::ModuleRestore,
    ];
    for action in ["list", "build"] {
        for change in changes {
            let mut session = Session::new().await?;
            let root = session.temp.path();
            let marker = root.join("ready");
            let resume = root.join("resume");
            std::fs::write(root.join("stall"), "")?;
            std::fs::write(root.join("action"), action)?;
            std::fs::write(
                tools.path().join(format!(
                    "controlled-go{}.control-path",
                    std::env::consts::EXE_SUFFIX
                )),
                root.to_str().unwrap(),
            )?;
            session.go_context.go = wrapper.to_string_lossy().into_owned().into();
            let _cancel_on_drop = CancelOnDrop(session.go_context.clone());
            let session = Arc::new(session);
            let consumer = session.clone();
            let work = tokio::spawn(async move { consumer.fetch(FILES).await });
            let deadline = Instant::now() + Duration::from_secs(60);
            while !marker.exists() {
                if work.is_finished() {
                    let error = work.await?.err().map_or_else(
                        || "command finished without reaching its barrier".to_owned(),
                        |error| error.to_string(),
                    );
                    anyhow::bail!(
                        "controlled Go command ended before its barrier: {action}, {change:?}: \
                         {error}"
                    );
                }
                ensure!(
                    Instant::now() < deadline,
                    "controlled Go command did not run: {action}, {change:?}"
                );
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
            // No explicit invalidation or active watcher: raw consistency guards must
            // detect edits even before watcher delivery and dependency registration.
            let expected = match change {
                RaceChange::Graph => {
                    let created = session.project.join("internal/created");
                    std::fs::create_dir(&created)?;
                    std::fs::write(
                        created.join("created.go"),
                        "package created\nfunc Text() string { return \"during-command\" }\n",
                    )?;
                    std::fs::write(
                        session.project.join("internal/helper/helper.go"),
                        "package helper\nimport \
                         \"example.com/native-fixture/internal/created\"\nfunc Message() string { \
                         return created.Text() }\n",
                    )?;
                    "during-command"
                }
                RaceChange::Body => {
                    let path = session.project.join("internal/message/message.go");
                    let text = std::fs::read_to_string(&path)?;
                    std::fs::write(path, text.replace("helper-v1", "during-command"))?;
                    "during-command"
                }
                #[cfg(unix)]
                RaceChange::RestoredMtime
                | RaceChange::EditAndRestore
                | RaceChange::Replacement
                | RaceChange::ModuleRestore => {
                    use std::os::unix::fs::MetadataExt;
                    let path =
                        session
                            .project
                            .join(if matches!(change, RaceChange::ModuleRestore) {
                                "go.mod"
                            } else {
                                "internal/message/message.go"
                            });
                    let before = std::fs::metadata(&path)?;
                    let text = std::fs::read_to_string(&path)?;
                    let changed = if matches!(change, RaceChange::ModuleRestore) {
                        text.replace("native-fixture", "native-fixturX")
                    } else {
                        text.replace("helper-v1", "helper-v2")
                    };
                    assert_ne!(text, changed);
                    assert_eq!(text.len(), changed.len());
                    let times =
                        || std::fs::FileTimes::new().set_modified(before.modified().unwrap());
                    match change {
                        RaceChange::Replacement => {
                            let mut replacement =
                                tempfile::NamedTempFile::new_in(path.parent().unwrap())?;
                            replacement.write_all(text.as_bytes())?;
                            replacement.as_file().set_times(times())?;
                            replacement.persist(&path).map_err(|error| error.error)?;
                        }
                        RaceChange::EditAndRestore | RaceChange::ModuleRestore => {
                            std::fs::write(&path, &changed)?;
                            std::fs::File::options()
                                .write(true)
                                .open(&path)?
                                .set_times(times())?;
                            std::fs::write(&path, &text)?;
                            std::fs::File::options()
                                .write(true)
                                .open(&path)?
                                .set_times(times())?;
                        }
                        RaceChange::RestoredMtime => {
                            std::fs::write(&path, &changed)?;
                            std::fs::File::options()
                                .write(true)
                                .open(&path)?
                                .set_times(times())?;
                        }
                        _ => unreachable!(),
                    }
                    let after = std::fs::metadata(&path)?;
                    assert_eq!(after.len(), before.len());
                    assert_eq!(
                        after.modified()?,
                        before.modified()?,
                        "mtime must be restored exactly"
                    );
                    if matches!(change, RaceChange::Replacement) {
                        assert_ne!(after.ino(), before.ino());
                    } else {
                        assert_eq!(after.ino(), before.ino());
                        assert_ne!(
                            (after.ctime(), after.ctime_nsec()),
                            (before.ctime(), before.ctime_nsec())
                        );
                    }
                    if matches!(change, RaceChange::RestoredMtime) {
                        "helper-v2"
                    } else {
                        "helper-v1"
                    }
                }
            };
            std::fs::write(&resume, "resume")?;
            let first_bytes = tokio::time::timeout(Duration::from_secs(60), work).await???;
            let first: serde_json::Value =
                serde_json::from_str(&session.run_bytes(first_bytes).await?)?;
            assert_eq!(
                first["body"],
                format!("explicit-v1:{expected}:embedded-v1"),
                "first result must be current: {action}, {change:?}"
            );
            if action == "build" {
                assert!(
                    session.counts().1 >= 2,
                    "stale compiler output must be retried: {change:?}"
                );
            }
            #[cfg(unix)]
            if matches!(change, RaceChange::ModuleRestore) {
                assert!(
                    session.go_context.module_configuration_invocations() >= 2,
                    "restored module metadata must refresh Go's configuration query: {action}"
                );
            }
            let session = Arc::try_unwrap(session).ok().unwrap();
            session.stop().await;
        }
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn generated_entry_reuses_original_inputs_and_compiler_cache() -> Result<()> {
    let session = Session::new().await?;
    session
        .replace("cmd/files/main.go", "func main()", "func handle()")
        .await?;
    let generated = BTreeMap::from([(
        rcstr!("cmd/files/zz_generated.go"),
        rcstr!("package main\nfunc main() { handle() }\n"),
    )]);
    let files = ["cmd/files/main.go", "cmd/files/helper.go"];
    let first = session.fetch_generated(&files, generated.clone()).await?;
    let counts = session.counts();
    assert_eq!(
        first,
        session.fetch_generated(&files, generated.clone()).await?
    );
    assert_eq!(counts, session.counts());
    assert!(!session.project.join("cmd/files/zz_generated.go").exists());
    assert!(session.run_bytes(first).await?.contains("embedded-v1"));
    session
        .write("cmd/files/assets/message.txt", "embedded-overlay-v2")
        .await?;
    let second = session.fetch_generated(&files, generated).await?;
    assert!(
        session
            .run_bytes(second)
            .await?
            .contains("embedded-overlay-v2")
    );
    assert_eq!(session.counts().1, counts.1 + 1);
    Ok(())
}
