use std::{
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

fn tool() -> String {
    std::env::var("TURBOPACK_GO").unwrap_or_else(|_| "go".into())
}
fn cli(project: &Path) -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_turbopack-cli"));
    command.current_dir(project);
    command
}
fn source(project: &Path, text: &str) {
    std::fs::write(project.join("main.go"), text).unwrap();
}
const MAIN: &str = "package main\nimport \"fmt\"\nfunc main() { fmt.Println(value()) }\n";
fn executable(project: &Path) -> PathBuf {
    project.join(format!("dist/main{}", std::env::consts::EXE_SUFFIX))
}
fn run(path: &Path) -> Option<String> {
    let output = Command::new(path).output().ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
}
struct Process(Child);
impl Drop for Process {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn wait(condition: impl FnMut() -> bool) {
    wait_for("native build", condition);
}
fn wait_for(description: &str, mut condition: impl FnMut() -> bool) {
    wait_for_timeout(description, Duration::from_secs(60), &mut condition);
}
fn wait_for_timeout(description: &str, timeout: Duration, mut condition: impl FnMut() -> bool) {
    let deadline = Instant::now() + timeout;
    while !condition() {
        assert!(
            Instant::now() < deadline,
            "timed out waiting for {description}"
        );
        thread::sleep(Duration::from_millis(100));
    }
}

#[test]
fn standalone_defaults_errors_and_output_ownership() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path();
    source(project, MAIN);
    std::fs::write(
        project.join("helper.go"),
        "package main\nfunc value() string { return \"standalone\" }\n",
    )
    .unwrap();
    std::fs::write(
        project.join("unused.go"),
        "package main\nfunc init() { panic(\"unlisted\") }\n",
    )
    .unwrap();
    let output = cli(project)
        .args(["build", "main.go", "helper.go", "--go", &tool()])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let target = executable(project);
    assert_eq!(run(&target).as_deref(), Some("standalone"));
    let bytes = std::fs::read(&target).unwrap();
    source(project, "package main\nfunc main() { invalid Go }\n");
    let output = cli(project)
        .args(["build", "main.go", "--go", &tool()])
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    let error = String::from_utf8_lossy(&output.stderr);
    assert!(
        error.contains("syntax error") && error.contains("main.go:"),
        "{error}"
    );
    assert!(!error.contains("panicked"), "{error}");
    assert_eq!(std::fs::read(&target).unwrap(), bytes);
    let custom = project.join("owned-by-user");
    std::fs::write(&custom, b"keep me").unwrap();
    let output = cli(project)
        .args(["build", "main.go", "--go", &tool(), "--output"])
        .arg(&custom)
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(std::fs::read(&custom).unwrap(), b"keep me");
    std::fs::create_dir(project.join("assets")).unwrap();
    std::fs::write(project.join("assets/message.txt"), "embedded").unwrap();
    source(
        project,
        "package main\nimport _ \"embed\"\n//go:embed assets/*\nvar data string\nfunc main() {}\n",
    );
    let embedded_output = project.join("assets/output");
    let output = cli(project)
        .args(["build", "main.go", "--go", &tool(), "--output"])
        .arg(&embedded_output)
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&output.stderr).contains("embed patterns"));
    assert!(!embedded_output.exists());
    for cache in ["assets/cache", ".", "ASSETS/cache"] {
        rejection(
            project,
            &["build", "main.go", "--go-cache", cache],
            "Go build cache must be outside the source project and module cache",
        );
        assert_eq!(std::fs::read(&target).unwrap(), bytes);
        assert_eq!(
            std::fs::read(project.join("assets/message.txt")).unwrap(),
            b"embedded"
        );
    }
    assert!(!project.join("assets/cache").exists());
    assert!(!project.join("ASSETS/cache").exists());
    std::fs::write(
        project.join("go.mod"),
        "module example.com/ownership\ngo 1.24\n",
    )
    .unwrap();
    std::fs::write(
        project.join("go.sum"),
        include_bytes!("../../turbopack-go/tests/dependency-proxy/go.sum"),
    )
    .unwrap();
    for (path, diagnostic) in [
        (
            "main.go",
            "output must not overwrite Go source or module configuration",
        ),
        (
            "go.mod",
            "output must not overwrite Go source or module configuration",
        ),
        (
            "go.sum",
            "output must not overwrite Go source or module configuration",
        ),
        (
            "assets/message.txt",
            "output must be outside tracked Go inputs and embed patterns",
        ),
    ] {
        let original = std::fs::read(project.join(path)).unwrap();
        rejection(project, &["build", "main.go", "--output", path], diagnostic);
        assert_eq!(
            std::fs::read(project.join(path)).unwrap(),
            original,
            "overwrote {path}"
        );
    }
}

fn rejection(project: &Path, arguments: &[&str], diagnostic: &str) {
    let mut command = cli(project);
    command.args(arguments);
    if arguments[0] == "build" {
        command.args(["--go", &tool()]);
    }
    // File-backed diagnostics avoid pipe backpressure, and the independent wait bounds
    // regressions that retry forever instead of reporting a rejected configuration.
    let stderr = tempfile::NamedTempFile::new().unwrap();
    let mut process = Process(
        command
            .stdout(Stdio::null())
            .stderr(stderr.reopen().unwrap())
            .spawn()
            .unwrap(),
    );
    wait_for("rejected CLI invocation", || {
        process.0.try_wait().unwrap().is_some()
    });
    assert_eq!(process.0.wait().unwrap().code(), Some(1), "{arguments:?}");
    let error = std::fs::read_to_string(stderr.path()).unwrap();
    assert!(error.contains(diagnostic), "{arguments:?}: {error}");
    assert!(!error.contains("panicked"), "{error}");
}

#[test]
fn output_aliases_preserve_sources_metadata_and_embedded_assets() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path();
    source(
        project,
        "package main\nimport \"embed\"\n//go:embed assets/*\nvar data embed.FS\nfunc main() {}\n",
    );
    std::fs::create_dir(project.join("assets")).unwrap();
    std::fs::write(project.join("assets/message.txt"), "embedded").unwrap();
    std::fs::create_dir(project.join("assets/nested")).unwrap();
    std::fs::write(project.join("assets/nested/sentinel.txt"), "nested").unwrap();
    std::fs::write(
        project.join("go.mod"),
        "module example.com/aliases\ngo 1.24\n",
    )
    .unwrap();
    std::fs::write(
        project.join("go.sum"),
        include_bytes!("../../turbopack-go/tests/dependency-proxy/go.sum"),
    )
    .unwrap();
    let protected = ["main.go", "go.mod", "go.sum", "assets/message.txt"];
    let originals: Vec<_> = protected
        .iter()
        .map(|path| std::fs::read(project.join(path)).unwrap())
        .collect();
    let check_inputs = || {
        for (path, bytes) in protected.iter().zip(&originals) {
            assert_eq!(
                std::fs::read(project.join(path)).unwrap(),
                *bytes,
                "changed {path}"
            );
        }
    };
    let insensitive = project.join("MAIN.GO").exists();
    rejection(
        project,
        &["build", "main.go", "--output", "MAIN.GO"],
        if insensitive {
            "output must not overwrite Go source or module configuration"
        } else {
            "Go output cannot have a .go extension"
        },
    );
    check_inputs();
    for path in ["GO.MOD", "GO.SUM"] {
        if project.join(path).exists() {
            rejection(
                project,
                &["build", "main.go", "--output", path],
                "output must not overwrite Go source or module configuration",
            );
        } else {
            // Distinct names on a case-sensitive filesystem are valid output destinations.
            let output = cli(project)
                .args(["build", "main.go", "--go", &tool(), "--output", path])
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            assert_eq!(run(&project.join(path)).as_deref(), Some(""));
        }
        check_inputs();
    }
    rejection(
        project,
        &["build", "main.go", "--output", "assets/MESSAGE.TXT"],
        "output must be outside tracked Go inputs and embed patterns",
    );
    check_inputs();
    let assets_alias = project.join("ASSETS").exists();
    std::fs::create_dir_all(project.join("ASSETS/nested")).unwrap();
    if assets_alias {
        rejection(
            project,
            &["build", "main.go", "--output", "ASSETS/nested/output"],
            "output must be outside tracked Go inputs and embed patterns",
        );
        assert!(!project.join("assets/nested/output").exists());
    } else {
        let output = cli(project)
            .args([
                "build",
                "main.go",
                "--go",
                &tool(),
                "--output",
                "ASSETS/nested/output",
            ])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(
            run(&project.join("ASSETS/nested/output")).as_deref(),
            Some("")
        );
    }
    check_inputs();
    // Aliases outside an embed directory must still be protected by file identity.
    std::fs::create_dir(project.join("aliases")).unwrap();
    for (path, alias, diagnostic) in [
        (
            "main.go",
            "aliases/source",
            "output must not overwrite Go source or module configuration",
        ),
        (
            "go.mod",
            "aliases/module",
            "output must not overwrite Go source or module configuration",
        ),
        (
            "assets/message.txt",
            "aliases/asset",
            "output must be outside tracked Go inputs and embed patterns",
        ),
    ] {
        std::fs::hard_link(project.join(path), project.join(alias)).unwrap();
        let original = std::fs::read(project.join(alias)).unwrap();
        rejection(
            project,
            &["build", "main.go", "--output", alias],
            diagnostic,
        );
        assert_eq!(std::fs::read(project.join(alias)).unwrap(), original);
        check_inputs();
    }
}

#[test]
fn rejects_removed_command_log_without_mutating_inputs() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path().join("project");
    std::fs::create_dir_all(project.join("assets")).unwrap();
    source(
        &project,
        "package main\nimport _ \"embed\"\n//go:embed assets/*\nvar data string\nfunc main() {}\n",
    );
    let asset = project.join("assets/message.txt");
    std::fs::write(&asset, "original").unwrap();
    let baseline = cli(&project)
        .args(["build", "main.go", "--go", &tool()])
        .output()
        .unwrap();
    assert!(
        baseline.status.success(),
        "{}",
        String::from_utf8_lossy(&baseline.stderr)
    );
    let source_bytes = std::fs::read(project.join("main.go")).unwrap();
    let executable_bytes = std::fs::read(executable(&project)).unwrap();
    for path in ["assets/message.txt", "assets/new.log", "main.go"] {
        let log = std::fs::File::create(temp.path().join("rejection.log")).unwrap();
        let mut process = Process(
            cli(&project)
                .args([
                    "build",
                    "main.go",
                    "--watch",
                    "--go",
                    &tool(),
                    "--command-log",
                    path,
                ])
                .stdout(Stdio::from(log.try_clone().unwrap()))
                .stderr(Stdio::from(log))
                .spawn()
                .unwrap(),
        );
        let deadline = Instant::now() + Duration::from_secs(15);
        while process.0.try_wait().unwrap().is_none() {
            assert!(
                Instant::now() < deadline,
                "removed --command-log option did not terminate promptly"
            );
            thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(process.0.wait().unwrap().code(), Some(2));
        let error = std::fs::read_to_string(temp.path().join("rejection.log")).unwrap();
        assert!(
            error.contains("unexpected argument '--command-log'"),
            "{error}"
        );
        assert_eq!(std::fs::read(&asset).unwrap(), b"original");
        assert_eq!(
            std::fs::read(project.join("main.go")).unwrap(),
            source_bytes
        );
        assert_eq!(
            std::fs::read(executable(&project)).unwrap(),
            executable_bytes
        );
        assert!(!project.join("assets/new.log").exists());
    }
}

#[test]
fn rejects_incompatible_commands_and_flags() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path();
    source(project, "package main\nfunc main() {}\n");
    std::fs::write(project.join("index.ts"), "console.log('valid');\n").unwrap();
    let baseline = cli(project)
        .args(["build", "main.go", "--go", &tool()])
        .output()
        .unwrap();
    assert!(
        baseline.status.success(),
        "{}",
        String::from_utf8_lossy(&baseline.stderr)
    );
    for (arguments, diagnostic) in [
        (
            vec!["dev", "main.go"],
            "Go inputs support build and build --watch",
        ),
        (
            vec!["build", "main.go", "index.ts"],
            "Go and JavaScript inputs cannot be mixed",
        ),
        (
            vec!["build", "main.go", "--target", "browser"],
            "native Go builds do not accept --target",
        ),
        (
            vec!["build", "main.go", "--no-minify"],
            "JavaScript optimization flags do not apply",
        ),
        (
            vec!["build", "main.go", "--no-sourcemap"],
            "JavaScript optimization flags do not apply",
        ),
        (
            vec!["build", "main.go", "--no-scope-hoist"],
            "JavaScript optimization flags do not apply",
        ),
        (
            vec!["build", "main.go", "--persistent-caching"],
            "native Go builds do not support persistent task caching",
        ),
        (
            vec!["build", "main.go", "--cache-dir", "cache"],
            "native Go builds do not support persistent task caching",
        ),
        (
            vec!["build", "main.go", "--show-all"],
            "Go diagnostics do not support JavaScript issue filtering",
        ),
        (
            vec!["build", "main.go", "--full-stats"],
            "Go builds do not currently expose --full-stats",
        ),
    ] {
        rejection(project, &arguments, diagnostic);
    }
}

#[test]
fn rejects_native_application_dependencies() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path();
    std::fs::write(
        project.join("go.mod"),
        "module example.com/native\ngo 1.24\n",
    )
    .unwrap();
    let native = project.join("internal/native");
    std::fs::create_dir_all(&native).unwrap();
    source(
        project,
        "package main\nimport \"example.com/native/internal/native\"\nfunc main() { native.Run() \
         }\n",
    );
    std::fs::write(native.join("native.go"), "package native\nfunc Run() {}\n").unwrap();
    // Even unused assembly makes an application dependency unsupported.
    std::fs::write(native.join("native.s"), "").unwrap();
    rejection(
        project,
        &["build", "main.go"],
        "only pure-Go dependencies are supported: example.com/native/internal/native",
    );
    assert!(!executable(project).exists());
    std::fs::remove_file(native.join("native.s")).unwrap();
    std::fs::write(
        native.join("native.go"),
        "package native\nimport \"C\"\nfunc Run() {}\n",
    )
    .unwrap();
    rejection(
        project,
        &["build", "main.go"],
        "build constraints exclude all Go files",
    );
    assert!(!executable(project).exists());
}

#[cfg(unix)]
#[test]
fn rejects_source_symlinks() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path();
    std::fs::write(project.join("real.go"), "package main\nfunc main() {}\n").unwrap();
    std::os::unix::fs::symlink(project.join("real.go"), project.join("main.go")).unwrap();
    rejection(
        project,
        &["build", "main.go"],
        "Go source symlinks are unsupported",
    );
    assert!(!executable(project).exists());
    std::fs::remove_file(project.join("main.go")).unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(
        outside.path().join("main.go"),
        "package main\nfunc main() {}\n",
    )
    .unwrap();
    std::fs::create_dir(project.join("real")).unwrap();
    std::fs::write(
        project.join("real/main.go"),
        "package main\nfunc main() {}\n",
    )
    .unwrap();
    // Standalone entry directories must be checked before module-root canonicalization.
    for (alias, target) in [
        ("inside", project.join("real")),
        ("outside", outside.path().to_owned()),
    ] {
        std::os::unix::fs::symlink(target, project.join(alias)).unwrap();
        rejection(
            project,
            &["build", &format!("{alias}/main.go")],
            "Go source symlinks are unsupported",
        );
    }
    std::fs::write(
        project.join("go.mod"),
        "module example.com/symlinks\ngo 1.24\n",
    )
    .unwrap();
    std::fs::write(
        outside.path().join("helper.go"),
        "package helper\nfunc Value() {}\n",
    )
    .unwrap();
    std::os::unix::fs::symlink(outside.path(), project.join("helper")).unwrap();
    source(
        project,
        "package main\nimport \"example.com/symlinks/helper\"\nfunc main() { helper.Value() }\n",
    );
    rejection(
        project,
        &["build", "main.go"],
        "Go source symlinks are unsupported",
    );
    assert!(!executable(project).exists());
}

#[test]
fn watch_rebuilds_recovers_and_recreates_output() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path();
    source(
        project,
        "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"first\") }\n",
    );
    let control = tempfile::tempdir().unwrap();
    let wrapper = control
        .path()
        .join(format!("go-wrapper{}", std::env::consts::EXE_SUFFIX));
    let actual_go = Command::new(tool())
        .args(["env", "GOROOT"])
        .output()
        .unwrap();
    assert!(actual_go.status.success());
    let actual_go = Path::new(String::from_utf8_lossy(&actual_go.stdout).trim())
        .join(format!("bin/go{}", std::env::consts::EXE_SUFFIX));
    let compiled = Command::new(&actual_go)
        .env("GOENV", "off")
        .env("GOTOOLCHAIN", "local")
        .env("CGO_ENABLED", "0")
        .env("GOPROXY", "off")
        .env_remove("GOFLAGS")
        .env_remove("GOOS")
        .env_remove("GOARCH")
        .args(["build", "-o"])
        .arg(&wrapper)
        .arg(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../turbopack-go/tests/controlled-go/main.go"),
        )
        .output()
        .unwrap();
    assert!(
        compiled.status.success(),
        "{}",
        String::from_utf8_lossy(&compiled.stderr)
    );
    for (suffix, path) in [
        ("go-path", actual_go.as_path()),
        ("control-path", control.path()),
    ] {
        std::fs::write(
            control.path().join(format!(
                "go-wrapper{}.{suffix}",
                std::env::consts::EXE_SUFFIX
            )),
            path.to_str().unwrap(),
        )
        .unwrap();
    }
    let log = std::fs::File::create(project.join("watch.log")).unwrap();
    let mut process = Process(
        cli(project)
            .args(["build", "main.go", "--watch", "--go"])
            .arg(&wrapper)
            .stdout(Stdio::from(log.try_clone().unwrap()))
            .stderr(Stdio::from(log))
            .spawn()
            .unwrap(),
    );
    let target = executable(project);
    wait(|| run(&target).as_deref() == Some("first"));
    std::fs::remove_file(&target).unwrap();
    wait(|| run(&target).as_deref() == Some("first"));
    source(project, "package main\nfunc main() { invalid Go }\n");
    wait(|| {
        std::fs::read_to_string(project.join("watch.log"))
            .unwrap()
            .contains("syntax error")
    });
    assert_eq!(run(&target).as_deref(), Some("first"));
    std::fs::write(control.path().join("stall"), "").unwrap();
    source(
        project,
        "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"repaired\") }\n",
    );
    // Hold a completed replacement, and require every observation to see a valid output.
    wait(|| control.path().join("ready").exists());
    let previous = std::fs::read(&target).unwrap();
    for _ in 0..10 {
        assert_eq!(std::fs::read(&target).unwrap(), previous);
        assert_eq!(run(&target).as_deref(), Some("first"));
        thread::sleep(Duration::from_millis(50));
    }
    std::fs::write(control.path().join("resume"), "").unwrap();
    wait(|| {
        let value = run(&target).expect("executable must stay runnable during publication");
        assert!(value == "first" || value == "repaired", "{value}");
        value == "repaired"
    });
    assert!(process.0.try_wait().unwrap().is_none());
    // Exercise the production deadline end to end: the failed compile must remain a
    // recoverable graph result, preserving publication and the same active watcher.
    for name in ["ready", "resume"] {
        std::fs::remove_file(control.path().join(name)).unwrap();
    }
    std::fs::write(control.path().join("timeout"), "").unwrap();
    source(
        project,
        "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"timed-out\") }\n",
    );
    wait(|| control.path().join("ready").exists());
    let previous = std::fs::read(&target).unwrap();
    wait_for_timeout(
        "recoverable compiler timeout",
        Duration::from_secs(195),
        || {
            assert!(
                process.0.try_wait().unwrap().is_none(),
                "timeout terminated watch mode"
            );
            std::fs::read_to_string(project.join("watch.log"))
                .unwrap()
                .contains("Go command timed out after 180 seconds")
        },
    );
    assert_eq!(std::fs::read(&target).unwrap(), previous);
    assert_eq!(run(&target).as_deref(), Some("repaired"));
    for name in ["timeout", "stall", "ready"] {
        std::fs::remove_file(control.path().join(name)).unwrap();
    }
    source(
        project,
        "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"after-timeout\") }\n",
    );
    wait(|| run(&target).as_deref() == Some("after-timeout"));
    assert!(process.0.try_wait().unwrap().is_none());
    #[cfg(unix)]
    {
        assert!(
            Command::new("/bin/kill")
                .args(["-INT", &process.0.id().to_string()])
                .status()
                .unwrap()
                .success()
        );
        wait(|| process.0.try_wait().unwrap().is_some());
        assert_eq!(process.0.wait().unwrap().code(), Some(0));
    }
}

#[cfg(unix)]
#[test]
fn cancellation_during_compilation_kills_child_processes() {
    use std::os::unix::fs::PermissionsExt;
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path();
    source(project, "package main\nfunc main() {}\n");
    let go = Command::new(tool())
        .args(["env", "GOROOT"])
        .output()
        .unwrap();
    assert!(go.status.success());
    let go = Path::new(String::from_utf8_lossy(&go.stdout).trim()).join("bin/go");
    let wrapper = project.join("go-wrapper");
    let quote = |path: &Path| format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"));
    std::fs::write(
        &wrapper,
        format!(
            "#!/bin/sh\nif [ \"$1\" = build ]; then\n sleep 120 &\n echo $! > {}\n touch {}\n \
             wait\nfi\nexec {} \"$@\"\n",
            quote(&project.join("child.pid")),
            quote(&project.join("child.ready")),
            quote(&go)
        ),
    )
    .unwrap();
    std::fs::set_permissions(&wrapper, std::fs::Permissions::from_mode(0o755)).unwrap();
    let mut process = Process(
        cli(project)
            .args(["build", "main.go", "--go"])
            .arg(&wrapper)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap(),
    );
    wait_for("compiler descendant readiness", || {
        project.join("child.ready").exists()
    });
    let pid = std::fs::read_to_string(project.join("child.pid")).unwrap();
    assert!(
        Command::new("/bin/kill")
            .args(["-INT", &process.0.id().to_string()])
            .status()
            .unwrap()
            .success()
    );
    wait_for("CLI shutdown after Ctrl-C", || {
        process.0.try_wait().unwrap().is_some()
    });
    assert_eq!(process.0.wait().unwrap().code(), Some(0));
    wait_for("compiler descendant termination", || {
        !Command::new("/bin/kill")
            .args(["-0", pid.trim()])
            .stderr(Stdio::null())
            .status()
            .unwrap()
            .success()
    });
    assert!(!executable(project).exists());
}

#[test]
fn watch_observes_imported_packages_and_embedded_assets() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path();
    std::fs::create_dir_all(project.join("internal/helper")).unwrap();
    std::fs::create_dir(project.join("assets")).unwrap();
    std::fs::write(
        project.join("go.mod"),
        "module example.com/watch\ngo 1.24\n",
    )
    .unwrap();
    let helper = project.join("internal/helper/helper.go");
    std::fs::write(
        &helper,
        "package helper\nvar value = \"dependency-v1\"\nfunc Text() string { return value }\n",
    )
    .unwrap();
    let ignored = project.join("internal/helper/ignored.go");
    std::fs::write(
        &ignored,
        "//go:build coverage_disabled\n\npackage helper\nfunc init() { value = \"tagged\" }\n",
    )
    .unwrap();
    let asset = project.join("assets/message.txt");
    std::fs::write(&asset, "asset-v1").unwrap();
    source(
        project,
        "package main\nimport (\"embed\"; \"fmt\"; \
         \"example.com/watch/internal/helper\")\n//go:embed assets/*\nvar assets embed.FS\nfunc \
         main() { data, _ := assets.ReadFile(\"assets/message.txt\"); nested, _ := \
         assets.ReadFile(\"assets/new/deep/message.txt\"); \
         fmt.Println(helper.Text()+\":\"+string(data)+\":\"+string(nested)) }\n",
    );
    let log = std::fs::File::create(project.join("watch.log")).unwrap();
    let _process = Process(
        cli(project)
            .args(["build", "main.go", "--watch", "--go", &tool()])
            .stdout(Stdio::from(log.try_clone().unwrap()))
            .stderr(Stdio::from(log))
            .spawn()
            .unwrap(),
    );
    let target = executable(project);
    wait(|| run(&target).as_deref() == Some("dependency-v1:asset-v1:"));
    std::fs::write(
        &helper,
        "package helper\nvar value = \"dependency-v2\"\nfunc Text() string { return value }\n",
    )
    .unwrap();
    wait(|| run(&target).as_deref() == Some("dependency-v2:asset-v1:"));
    std::fs::write(&asset, "asset-v2").unwrap();
    wait(|| run(&target).as_deref() == Some("dependency-v2:asset-v2:"));
    let sibling = project.join("internal/helper/added.go");
    std::fs::write(
        &sibling,
        "package helper\nfunc init() { value = \"sibling\" }\n",
    )
    .unwrap();
    wait(|| run(&target).as_deref() == Some("sibling:asset-v2:"));
    std::fs::remove_file(sibling).unwrap();
    wait(|| run(&target).as_deref() == Some("dependency-v2:asset-v2:"));
    std::fs::write(
        &ignored,
        "//go:build !coverage_disabled\n\npackage helper\nfunc init() { value = \"tagged\" }\n",
    )
    .unwrap();
    wait(|| run(&target).as_deref() == Some("tagged:asset-v2:"));
    std::fs::write(
        &ignored,
        "//go:build coverage_disabled\n\npackage helper\nfunc init() { value = \"tagged\" }\n",
    )
    .unwrap();
    wait(|| run(&target).as_deref() == Some("dependency-v2:asset-v2:"));
    std::fs::create_dir_all(project.join("assets/new/deep")).unwrap();
    std::fs::write(project.join("assets/new/deep/message.txt"), "nested").unwrap();
    wait(|| run(&target).as_deref() == Some("dependency-v2:asset-v2:nested"));

    let previous = std::fs::read(&target).unwrap();
    std::fs::write(
        &helper,
        "package helper\nimport \"example.com/watch/internal/missing\"\nfunc Text() string { \
         return missing.Text() }\n",
    )
    .unwrap();
    wait(|| {
        let log = std::fs::read_to_string(project.join("watch.log")).unwrap();
        log.contains("example.com/watch/internal/missing")
            && (log.contains("no required module provides package")
                || log.contains("cannot find module providing package"))
    });
    assert_eq!(std::fs::read(&target).unwrap(), previous);
    std::fs::create_dir_all(project.join("internal/missing")).unwrap();
    let missing = project.join("internal/missing/missing.go");
    std::fs::write(
        &missing,
        "package missing\nfunc Text() string { return \"created\" }\n",
    )
    .unwrap();
    wait(|| run(&target).as_deref() == Some("created:asset-v2:nested"));

    let previous = std::fs::read(&target).unwrap();
    std::fs::write(
        project.join("go.mod"),
        "module example.com/watch\ngo 1.24\nreplace example.com/unsupported => ../outside\n",
    )
    .unwrap();
    wait(|| {
        std::fs::read_to_string(project.join("watch.log"))
            .unwrap()
            .contains("Go module replacements are not supported")
    });
    assert_eq!(std::fs::read(&target).unwrap(), previous);
    std::fs::write(
        &missing,
        "package missing\nfunc Text() string { return \"metadata-repaired\" }\n",
    )
    .unwrap();
    std::fs::write(
        project.join("go.mod"),
        "module example.com/watch\ngo 1.24\n",
    )
    .unwrap();
    wait(|| run(&target).as_deref() == Some("metadata-repaired:asset-v2:nested"));
}
