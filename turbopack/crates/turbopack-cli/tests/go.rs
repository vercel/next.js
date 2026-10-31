#![cfg_attr(windows, feature(junction_point))]

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
fn run_javascript(project: &Path) -> Option<String> {
    let output = Command::new("node")
        .arg(project.join("dist/index.entry.js"))
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
}
fn http_response(port: u16, path: &str) -> Option<(u16, String)> {
    // HTML responses are gzip compressed and may use chunked transfer encoding.
    let output = Command::new("node")
        .args([
            "-e",
            r#"
fetch(`http://127.0.0.1:${process.argv[1]}${process.argv[2]}`, {
    signal: AbortSignal.timeout(5000),
}).then(async response => {
    process.stdout.write(`${response.status}\n${await response.text()}`);
}).catch(() => process.exit(1));
"#,
        ])
        .arg(port.to_string())
        .arg(path)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let response = String::from_utf8(output.stdout).ok()?;
    let (status, body) = response.split_once('\n')?;
    Some((status.parse().ok()?, body.to_owned()))
}
struct Process(Child);
impl Drop for Process {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
const WAIT_TIMEOUT: Duration = Duration::from_secs(60);
fn wait_for_log(description: &str, log: &Path, condition: impl FnMut() -> bool) {
    wait_for_timeout_and_log(description, Duration::from_secs(60), Some(log), condition);
}
fn wait_for_timeout_and_log(
    description: &str,
    timeout: Duration,
    log: Option<&Path>,
    mut condition: impl FnMut() -> bool,
) {
    let deadline = Instant::now() + timeout;
    while !condition() {
        assert!(
            Instant::now() < deadline,
            "timed out waiting for {description}\n{}",
            log.map(|path| std::fs::read_to_string(path).unwrap_or_else(|error| error.to_string()))
                .unwrap_or_default()
        );
        thread::sleep(Duration::from_millis(100));
    }
}
fn wait_until(timeout: Duration, mut condition: impl FnMut() -> bool) -> bool {
    let deadline = Instant::now() + timeout;
    while !condition() {
        if Instant::now() >= deadline {
            return false;
        }
        thread::sleep(Duration::from_millis(100));
    }
    true
}

fn controlled_go(control: &Path) -> PathBuf {
    let wrapper = control.join(format!("go-wrapper{}", std::env::consts::EXE_SUFFIX));
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
    for (suffix, path) in [("go-path", actual_go.as_path()), ("control-path", control)] {
        std::fs::write(
            control.join(format!(
                "go-wrapper{}.{suffix}",
                std::env::consts::EXE_SUFFIX
            )),
            path.to_str().unwrap(),
        )
        .unwrap();
    }
    wrapper
}

#[test]
fn standalone_explicit_files_and_compile_errors() {
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
    let error = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        error.contains("syntax error") && error.contains("main.go:"),
        "{error}"
    );
    assert!(!error.contains("panicked"), "{error}");
    assert_eq!(std::fs::read(&target).unwrap(), bytes);
}

#[test]
fn builds_go_and_typescript_entries_together() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path();
    source(project, MAIN);
    std::fs::write(
        project.join("helper.go"),
        "package main\nfunc value() string { return \"native\" }\n",
    )
    .unwrap();
    std::fs::write(
        project.join("index.ts"),
        "const message: string = 'typescript'; console.log(message);\n",
    )
    .unwrap();
    let output = cli(project)
        .args([
            "build",
            "index.ts",
            "main.go",
            "helper.go",
            "--go",
            &tool(),
            "--target",
            "node",
            "--no-minify",
            "--no-sourcemap",
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(run(&executable(project)).as_deref(), Some("native"));
    assert_eq!(run_javascript(project).as_deref(), Some("typescript"));
}

#[test]
fn javascript_default_entry_does_not_require_go() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path();
    std::fs::create_dir(project.join("src")).unwrap();
    std::fs::write(
        project.join("src/entry.ts"),
        "const message: string = 'javascript-default'; console.log(message);\n",
    )
    .unwrap();
    let output = cli(project)
        .args(["build", "--go", "missing-go-toolchain"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let output = Command::new("node")
        .arg(project.join("dist/entry.entry.js"))
        .output()
        .unwrap();
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        "javascript-default"
    );
}

#[test]
fn watch_and_dev_rebuild_go_and_typescript_entries() {
    for command in ["build", "dev"] {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path();
        source(
            project,
            "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"go-first\") }\n",
        );
        std::fs::write(
            project.join("index.ts"),
            "const message: string = 'ts-first'; console.log(message);\n",
        )
        .unwrap();
        let log = tempfile::NamedTempFile::new().unwrap();
        let mut invocation = cli(project);
        invocation.args([
            command,
            "index.ts",
            "main.go",
            "--go",
            &tool(),
            "--target",
            "node",
        ]);
        if command == "build" {
            invocation.arg("--watch");
        } else {
            invocation.args(["--no-open", "--port", "0"]);
        }
        let mut process = Process(
            invocation
                .stdout(log.as_file().try_clone().unwrap())
                .stderr(log.as_file().try_clone().unwrap())
                .spawn()
                .unwrap(),
        );
        let target = executable(project);
        let mut expect_outputs = |go: &str, javascript: &str| {
            wait_for_log(
                &format!("{command}: {go}, {javascript}"),
                log.path(),
                || {
                    assert!(
                        process.0.try_wait().unwrap().is_none(),
                        "{command} exited:\n{}",
                        std::fs::read_to_string(log.path()).unwrap()
                    );
                    run(&target).as_deref() == Some(go)
                        && run_javascript(project).as_deref() == Some(javascript)
                },
            );
        };
        expect_outputs("go-first", "ts-first");
        if command == "dev" {
            wait_for_log("mixed dev HTTP response", log.path(), || {
                let log = std::fs::read_to_string(log.path()).unwrap();
                let port = log.lines().find_map(|line| {
                    line.split("url: http://localhost:")
                        .nth(1)?
                        .trim()
                        .parse::<u16>()
                        .ok()
                });
                let Some((status, body)) = port.and_then(|port| http_response(port, "/index.html"))
                else {
                    return false;
                };
                status == 200 && body.contains("<script")
            });
        }
        std::fs::write(
            project.join("index.ts"),
            "const message: string = 'ts-edited'; console.log(message);\n",
        )
        .unwrap();
        expect_outputs("go-first", "ts-edited");
        source(
            project,
            "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"go-edited\") }\n",
        );
        expect_outputs("go-edited", "ts-edited");
        #[cfg(unix)]
        {
            assert!(
                Command::new("/bin/kill")
                    .args(["-INT", &process.0.id().to_string()])
                    .status()
                    .unwrap()
                    .success()
            );
            wait_for_log(&format!("mixed {command} shutdown"), log.path(), || {
                process.0.try_wait().unwrap().is_some()
            });
            assert_eq!(process.0.wait().unwrap().code(), Some(0));
        }
    }
}

#[test]
fn go_only_dev_rebuilds_without_an_http_server() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path();
    source(
        project,
        "package main\nimport (\"fmt\"; \"os\"; \"time\")\nfunc main() { \
         fmt.Println(\"go-first\"); if len(os.Args) > 1 { time.Sleep(time.Hour) } }\n",
    );
    let log = tempfile::NamedTempFile::new().unwrap();
    let mut process = Process(
        cli(project)
            .args([
                "dev",
                "main.go",
                "--go",
                &tool(),
                "--no-open",
                "--port",
                "0",
            ])
            .stdout(log.as_file().try_clone().unwrap())
            .stderr(log.as_file().try_clone().unwrap())
            .spawn()
            .unwrap(),
    );
    let target = executable(project);
    wait_for_log("initial Go-only dev compilation", log.path(), || {
        assert!(process.0.try_wait().unwrap().is_none());
        run(&target).as_deref() == Some("go-first")
    });
    #[cfg(unix)]
    let mut application = Process(
        Command::new(&target)
            .arg("hold")
            .stdout(Stdio::null())
            .spawn()
            .unwrap(),
    );
    source(
        project,
        "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"go-edited\") }\n",
    );
    wait_for_log("Go-only dev source rebuild", log.path(), || {
        assert!(process.0.try_wait().unwrap().is_none());
        run(&target).as_deref() == Some("go-edited")
    });
    // Rebuilding through the shared writer must work while the previous Unix executable runs.
    #[cfg(unix)]
    assert!(application.0.try_wait().unwrap().is_none());
    assert!(
        !std::fs::read_to_string(log.path())
            .unwrap()
            .contains("started server on")
    );
    #[cfg(unix)]
    {
        assert!(
            Command::new("/bin/kill")
                .args(["-INT", &process.0.id().to_string()])
                .status()
                .unwrap()
                .success()
        );
        wait_for_log("Go-only dev shutdown", log.path(), || {
            process.0.try_wait().unwrap().is_some()
        });
        assert_eq!(process.0.wait().unwrap().code(), Some(0));
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
    let log = tempfile::NamedTempFile::new().unwrap();
    let mut process = Process(
        command
            .stdout(log.as_file().try_clone().unwrap())
            .stderr(log.as_file().try_clone().unwrap())
            .spawn()
            .unwrap(),
    );
    assert!(
        wait_until(WAIT_TIMEOUT, || process.0.try_wait().unwrap().is_some()),
        "timed out waiting for rejected CLI invocation {arguments:?}; output:\n{}",
        std::fs::read_to_string(log.path()).unwrap()
    );
    assert_eq!(process.0.wait().unwrap().code(), Some(1), "{arguments:?}");
    let error = std::fs::read_to_string(log.path()).unwrap();
    assert!(error.contains(diagnostic), "{arguments:?}: {error}");
    assert!(!error.contains("panicked"), "{error}");
}

#[test]
fn rejects_persistent_go_task_caching() {
    let temp = tempfile::tempdir().unwrap();
    source(temp.path(), "package main\nfunc main() {}\n");
    rejection(
        temp.path(),
        &["build", "main.go", "--persistent-caching"],
        "Go build sessions do not support persistent task caching",
    );
    assert!(!executable(temp.path()).exists());
}

#[test]
fn rejects_outputs_matching_embed_patterns() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path();
    let input =
        "package main\nimport \"embed\"\n//go:embed dist/*\nvar files embed.FS\nfunc main() {}\n";
    source(project, input);
    std::fs::create_dir(project.join("dist")).unwrap();
    std::fs::write(project.join("dist/message.txt"), "original").unwrap();
    rejection(
        project,
        &["build", "main.go"],
        "output must be outside tracked Go inputs and embed patterns",
    );
    assert!(!executable(project).exists());
    assert_eq!(
        std::fs::read_to_string(project.join("main.go")).unwrap(),
        input
    );
    assert_eq!(
        std::fs::read_to_string(project.join("dist/message.txt")).unwrap(),
        "original"
    );
}

#[cfg(unix)]
#[test]
fn rejects_symlinked_output_paths_without_changing_destinations() {
    use std::os::unix::fs::symlink;

    let temp = tempfile::tempdir().unwrap();
    let project = temp.path().join("project");
    std::fs::create_dir(&project).unwrap();
    source(&project, "package main\nfunc main() {}\n");
    let output_name = format!("main{}", std::env::consts::EXE_SUFFIX);
    let inside = project.join("redirected");
    let outside = temp.path().join("outside");
    let missing = temp.path().join("missing/nested");
    let with_trailing_slash = |path: &Path| {
        let mut raw = path.as_os_str().to_os_string();
        raw.push("/");
        PathBuf::from(raw)
    };
    let inside_with_slash = with_trailing_slash(&inside);
    let outside_with_slash = with_trailing_slash(&outside);
    for destination in [&inside, &outside] {
        std::fs::create_dir(destination).unwrap();
        std::fs::write(destination.join(&output_name), "builder-owned command").unwrap();
    }
    for destination in [
        &inside,
        &outside,
        &inside_with_slash,
        &outside_with_slash,
        &missing,
    ] {
        symlink(destination, project.join("dist")).unwrap();
        rejection(&project, &["build", "main.go"], "symlink");
        assert_eq!(
            std::fs::read_link(project.join("dist"))
                .unwrap()
                .as_os_str(),
            destination.as_os_str()
        );
        for protected in [&inside, &outside] {
            assert_eq!(
                std::fs::read(protected.join(&output_name)).unwrap(),
                b"builder-owned command"
            );
            assert_eq!(std::fs::read_dir(protected).unwrap().count(), 1);
        }
        assert!(
            !temp.path().join("missing").exists(),
            "publication created directories through a dangling output symlink"
        );
        std::fs::remove_file(project.join("dist")).unwrap();
    }

    std::fs::create_dir(project.join("dist")).unwrap();
    let victim = outside.join(&output_name);
    let missing_victim = outside.join("missing-command");
    for destination in [&victim, &missing_victim] {
        symlink(destination, executable(&project)).unwrap();
        rejection(&project, &["build", "main.go"], "symlink");
        assert_eq!(
            std::fs::read_link(executable(&project)).unwrap(),
            *destination
        );
        assert_eq!(std::fs::read(&victim).unwrap(), b"builder-owned command");
        assert!(!missing_victim.exists());
        std::fs::remove_file(executable(&project)).unwrap();
    }
}

#[cfg(windows)]
#[test]
fn rejects_junction_output_directories_without_changing_destinations() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path().join("project");
    std::fs::create_dir(&project).unwrap();
    source(&project, "package main\nfunc main() {}\n");
    let inside = project.join("redirected");
    let outside = temp.path().join("outside");
    let output_name = format!("main{}", std::env::consts::EXE_SUFFIX);
    for destination in [&inside, &outside] {
        std::fs::create_dir(destination).unwrap();
        std::fs::write(destination.join(&output_name), "builder-owned command").unwrap();
        std::os::windows::fs::junction_point(destination, project.join("dist")).unwrap();
        rejection(&project, &["build", "main.go"], "symlink");
        assert_eq!(
            std::fs::canonicalize(project.join("dist")).unwrap(),
            std::fs::canonicalize(destination).unwrap()
        );
        assert_eq!(
            std::fs::read(destination.join(&output_name)).unwrap(),
            b"builder-owned command"
        );
        assert_eq!(std::fs::read_dir(destination).unwrap().count(), 1);
        std::fs::remove_dir(project.join("dist")).unwrap();
        assert!(destination.is_dir());
    }
}

#[cfg(unix)]
#[test]
fn watch_rejects_output_directory_redirection_and_recovers() {
    use std::os::unix::fs::symlink;

    let temp = tempfile::tempdir().unwrap();
    let project = temp.path().join("project");
    std::fs::create_dir(&project).unwrap();
    source(
        &project,
        "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"first\") }\n",
    );
    let outside = temp.path().join("outside");
    std::fs::create_dir(&outside).unwrap();
    let external_command = outside.join(format!("main{}", std::env::consts::EXE_SUFFIX));
    std::fs::write(&external_command, "builder-owned command").unwrap();
    let log = tempfile::NamedTempFile::new().unwrap();
    let mut process = Process(
        cli(&project)
            .args(["build", "main.go", "--watch", "--go", &tool()])
            .stdout(log.as_file().try_clone().unwrap())
            .stderr(log.as_file().try_clone().unwrap())
            .spawn()
            .unwrap(),
    );
    let target = executable(&project);
    wait_for_log(
        "initial build before output redirection",
        log.path(),
        || {
            assert!(process.0.try_wait().unwrap().is_none());
            run(&target).as_deref() == Some("first")
        },
    );
    let original = std::fs::read(&target).unwrap();
    let retained_directory = project.join("dist-original");
    std::fs::rename(project.join("dist"), &retained_directory).unwrap();
    symlink(&outside, project.join("dist")).unwrap();
    source(
        &project,
        "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"redirected\") }\n",
    );
    wait_for_log("rejected output redirection", log.path(), || {
        assert!(process.0.try_wait().unwrap().is_none());
        std::fs::read_to_string(log.path())
            .unwrap()
            .contains("symlink")
    });
    assert_eq!(
        std::fs::read(&external_command).unwrap(),
        b"builder-owned command"
    );
    assert_eq!(std::fs::read_dir(&outside).unwrap().count(), 1);
    let retained_output = retained_directory.join(target.file_name().unwrap());
    assert_eq!(std::fs::read(&retained_output).unwrap(), original);
    assert_eq!(run(&retained_output).as_deref(), Some("first"));

    std::fs::remove_file(project.join("dist")).unwrap();
    std::fs::rename(&retained_directory, project.join("dist")).unwrap();
    source(
        &project,
        "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"repaired\") }\n",
    );
    wait_for_log("watch recovery after output repair", log.path(), || {
        assert!(process.0.try_wait().unwrap().is_none());
        run(&target).as_deref() == Some("repaired")
    });
    assert_eq!(
        std::fs::read(&external_command).unwrap(),
        b"builder-owned command"
    );
    assert_eq!(std::fs::read_dir(&outside).unwrap().count(), 1);
}

#[test]
fn accepts_assembly_dependencies_and_rejects_cgo() {
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
    std::fs::write(native.join("native.s"), "").unwrap();
    let output = cli(project)
        .args(["build", "main.go", "--go", &tool()])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(run(&executable(project)).as_deref(), Some(""));
    std::fs::remove_file(executable(project)).unwrap();
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
fn one_shot_build_retries_when_source_changes_after_compilation() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path();
    source(
        project,
        "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"one-shot-before\") }\n",
    );
    let control = tempfile::tempdir().unwrap();
    let wrapper = controlled_go(control.path());
    std::fs::write(control.path().join("stall"), "").unwrap();
    let log = tempfile::NamedTempFile::new().unwrap();
    let mut process = Process(
        cli(project)
            .args(["build", "main.go", "--go"])
            .arg(wrapper)
            .stdout(log.as_file().try_clone().unwrap())
            .stderr(log.as_file().try_clone().unwrap())
            .spawn()
            .unwrap(),
    );
    // The wrapper has already compiled the original bytes, but has not returned them to
    // Turbopack. Changing a tracked input must discard that result even without watch mode.
    wait_for_log("held one-shot compilation", log.path(), || {
        assert!(process.0.try_wait().unwrap().is_none());
        control.path().join("ready").exists()
    });
    assert!(!executable(project).exists());
    source(
        project,
        "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"one-shot-after\") }\n",
    );
    std::fs::write(control.path().join("resume"), "").unwrap();
    wait_for_log("one-shot recompilation and exit", log.path(), || {
        process.0.try_wait().unwrap().is_some()
    });
    assert_eq!(
        process.0.wait().unwrap().code(),
        Some(0),
        "{}",
        std::fs::read_to_string(log.path()).unwrap()
    );
    assert_eq!(run(&executable(project)).as_deref(), Some("one-shot-after"));
}

#[test]
fn watch_recovers_after_compile_errors_and_timeouts() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path();
    source(
        project,
        "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"first\") }\n",
    );
    let control = tempfile::tempdir().unwrap();
    let wrapper = controlled_go(control.path());
    let log_path = project.join("watch.log");
    let log = std::fs::File::create(&log_path).unwrap();
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
    wait_for_log("initial Go watch compilation", &log_path, || {
        run(&target).as_deref() == Some("first")
    });
    source(project, "package main\nfunc main() { invalid Go }\n");
    wait_for_log("Go syntax error diagnostic", &log_path, || {
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
    // A compile in progress must preserve the last successful output.
    wait_for_log("held Go repair compilation", &log_path, || {
        control.path().join("ready").exists()
    });
    let previous = std::fs::read(&target).unwrap();
    for _ in 0..10 {
        assert_eq!(std::fs::read(&target).unwrap(), previous);
        assert_eq!(run(&target).as_deref(), Some("first"));
        thread::sleep(Duration::from_millis(50));
    }
    std::fs::write(control.path().join("resume"), "").unwrap();
    wait_for_log("Go repair publication", &log_path, || {
        run(&target).as_deref() == Some("repaired")
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
    wait_for_log("Go compiler timeout readiness", &log_path, || {
        control.path().join("ready").exists()
    });
    let previous = std::fs::read(&target).unwrap();
    wait_for_timeout_and_log(
        "recoverable compiler timeout",
        Duration::from_secs(195),
        Some(&log_path),
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
    wait_for_log("Go watch recovery after timeout", &log_path, || {
        run(&target).as_deref() == Some("after-timeout")
    });
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
        wait_for_log("Go build watcher shutdown", &log_path, || {
            process.0.try_wait().unwrap().is_some()
        });
        assert_eq!(process.0.wait().unwrap().code(), Some(0));
    }
}

#[cfg(unix)]
#[test]
fn cancellation_during_preparation_and_compilation_kills_child_processes() {
    use std::os::unix::fs::PermissionsExt;
    let go = Command::new(tool())
        .args(["env", "GOROOT"])
        .output()
        .unwrap();
    assert!(go.status.success());
    let go = Path::new(String::from_utf8_lossy(&go.stdout).trim()).join("bin/go");
    let quote = |path: &Path| format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"));
    for action in ["env", "build"] {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path();
        source(project, "package main\nfunc main() {}\n");
        let wrapper = project.join("go-wrapper");
        std::fs::write(
            &wrapper,
            format!(
                "#!/bin/sh\nif [ \"$1\" = {action} ]; then\n sleep 120 &\n echo $! > {}\n touch \
                 {}\n wait\nfi\nexec {} \"$@\"\n",
                quote(&project.join("child.pid")),
                quote(&project.join("child.ready")),
                quote(&go)
            ),
        )
        .unwrap();
        std::fs::set_permissions(&wrapper, std::fs::Permissions::from_mode(0o755)).unwrap();
        let log = tempfile::NamedTempFile::new().unwrap();
        let mut process = Process(
            cli(project)
                .args(["build", "main.go", "--go"])
                .arg(&wrapper)
                .stdout(log.as_file().try_clone().unwrap())
                .stderr(log.as_file().try_clone().unwrap())
                .spawn()
                .unwrap(),
        );
        wait_for_log(
            &format!("{action} descendant readiness"),
            log.path(),
            || project.join("child.ready").exists(),
        );
        let pid = std::fs::read_to_string(project.join("child.pid")).unwrap();
        assert!(
            Command::new("/bin/kill")
                .args(["-INT", &process.0.id().to_string()])
                .status()
                .unwrap()
                .success()
        );
        wait_for_log(
            &format!("{action} shutdown after Ctrl-C"),
            log.path(),
            || process.0.try_wait().unwrap().is_some(),
        );
        assert_eq!(process.0.wait().unwrap().code(), Some(0), "{action}");
        wait_for_log(
            &format!("{action} descendant termination"),
            log.path(),
            || {
                !Command::new("/bin/kill")
                    .args(["-0", pid.trim()])
                    .stderr(Stdio::null())
                    .status()
                    .unwrap()
                    .success()
            },
        );
        assert!(!executable(project).exists());
    }
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
    let log_path = project.join("watch.log");
    let log = std::fs::File::create(&log_path).unwrap();
    let _process = Process(
        cli(project)
            .args(["build", "main.go", "--watch", "--go", &tool()])
            .stdout(Stdio::from(log.try_clone().unwrap()))
            .stderr(Stdio::from(log))
            .spawn()
            .unwrap(),
    );
    let target = executable(project);
    let wait_for_output = |expected: &str| {
        wait_for_log(expected, &log_path, || {
            run(&target).as_deref() == Some(expected)
        });
    };
    wait_for_output("dependency-v1:asset-v1:");
    std::fs::write(
        &helper,
        "package helper\nvar value = \"dependency-v2\"\nfunc Text() string { return value }\n",
    )
    .unwrap();
    wait_for_output("dependency-v2:asset-v1:");
    std::fs::write(&asset, "asset-v2").unwrap();
    wait_for_output("dependency-v2:asset-v2:");
    let sibling = project.join("internal/helper/added.go");
    std::fs::write(
        &sibling,
        "package helper\nfunc init() { value = \"sibling\" }\n",
    )
    .unwrap();
    wait_for_output("sibling:asset-v2:");
    std::fs::remove_file(sibling).unwrap();
    wait_for_output("dependency-v2:asset-v2:");
    std::fs::write(
        &ignored,
        "//go:build !coverage_disabled\n\npackage helper\nfunc init() { value = \"tagged\" }\n",
    )
    .unwrap();
    wait_for_output("tagged:asset-v2:");
    std::fs::write(
        &ignored,
        "//go:build coverage_disabled\n\npackage helper\nfunc init() { value = \"tagged\" }\n",
    )
    .unwrap();
    wait_for_output("dependency-v2:asset-v2:");
    std::fs::create_dir_all(project.join("assets/new/deep")).unwrap();
    std::fs::write(project.join("assets/new/deep/message.txt"), "nested").unwrap();
    wait_for_output("dependency-v2:asset-v2:nested");

    let previous = std::fs::read(&target).unwrap();
    std::fs::write(
        &helper,
        "package helper\nimport \"example.com/watch/internal/missing\"\nfunc Text() string { \
         return missing.Text() }\n",
    )
    .unwrap();
    wait_for_log("missing imported package diagnostic", &log_path, || {
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
    wait_for_output("created:asset-v2:nested");

    let previous = std::fs::read(&target).unwrap();
    std::fs::write(
        project.join("go.mod"),
        "module example.com/watch\ngo 1.24\nreplace example.com/unsupported => ../outside\n",
    )
    .unwrap();
    wait_for_log(
        "unsupported module replacement diagnostic",
        &log_path,
        || {
            std::fs::read_to_string(project.join("watch.log"))
                .unwrap()
                .contains("Go module replacements are not supported")
        },
    );
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
    wait_for_output("metadata-repaired:asset-v2:nested");
}
