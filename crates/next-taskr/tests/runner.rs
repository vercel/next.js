use std::{
    fs,
    path::Path,
    process::{Command, Output},
};

fn fixture() -> tempfile::TempDir {
    let directory = tempfile::tempdir().unwrap();
    fs::create_dir(directory.path().join("input")).unwrap();
    fs::write(directory.path().join("input/file"), [0, 255, 10]).unwrap();
    fs::write(
        directory.path().join("worker.cjs"),
        include_str!("fixtures/worker.cjs"),
    )
    .unwrap();
    directory
}

fn run(directory: &Path, task: &str) -> Output {
    Command::new(env!("CARGO_BIN_EXE_next-taskr"))
        .arg("--cwd")
        .arg(directory)
        .arg("--worker")
        .arg(directory.join("worker.cjs"))
        .arg(task)
        .output()
        .unwrap()
}

#[test]
fn persists_transforms_and_restores_outputs() {
    let directory = fixture();
    let root = directory.path();
    let result = run(root, "all");
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert_eq!(fs::read(root.join("transforms")).unwrap(), b"x");
    assert_eq!(fs::read(root.join("dist/file")).unwrap(), [0, 255, 10]);
    assert_eq!(fs::read(root.join("dist/second")).unwrap(), [0, 255, 10]);
    assert_eq!(fs::read(root.join(".errors/code")).unwrap(), b"error");

    fs::remove_dir_all(root.join("dist")).unwrap();
    fs::remove_dir_all(root.join(".errors")).unwrap();
    assert!(run(root, "copy").status.success());
    assert_eq!(fs::read(root.join("dist/file")).unwrap(), [0, 255, 10]);
    assert_eq!(fs::read(root.join("transforms")).unwrap(), b"x");
    assert_eq!(fs::read(root.join(".errors/code")).unwrap(), b"error");

    fs::write(root.join("dist/file"), b"corrupt").unwrap();
    assert!(run(root, "copy").status.success());
    assert_eq!(fs::read(root.join("dist/file")).unwrap(), [0, 255, 10]);
    assert_eq!(fs::read(root.join("transforms")).unwrap(), b"x");

    fs::write(root.join("input/file"), b"changed").unwrap();
    assert!(run(root, "copy").status.success());
    assert_eq!(fs::read(root.join("dist/file")).unwrap(), b"changed");
    assert_eq!(fs::read(root.join("transforms")).unwrap(), b"xx");
}

#[test]
fn keeps_large_cached_artifacts_in_rust_and_loads_only_for_byte_consumers() {
    let directory = fixture();
    let root = directory.path();
    let source = vec![42; 1024 * 1024];
    fs::write(root.join("input/file"), &source).unwrap();
    for _ in 0..2 {
        let result = run(root, "copy");
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert_eq!(fs::read(root.join("dist/file")).unwrap(), source);
        assert_eq!(fs::read(root.join("transforms")).unwrap(), b"x");
        fs::remove_dir_all(root.join("dist")).unwrap();
    }
    let result = run(root, "mutate");
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert_eq!(fs::read(root.join("dist/original")).unwrap(), source);
    assert_eq!(
        fs::read(root.join("dist/modified")).unwrap(),
        [source.as_slice(), b" modified"].concat()
    );
}

#[test]
fn preserves_serial_barriers_on_warm_builds() {
    let directory = fixture();
    for count in 1..=2 {
        let result = run(directory.path(), "release");
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert_eq!(
            fs::read_to_string(directory.path().join("actions")).unwrap(),
            "release\nclean\ncopy\nverify\n".repeat(count)
        );
        assert_eq!(fs::read(directory.path().join("transforms")).unwrap(), b"x");
    }
}

#[test]
fn caches_batches_per_file_and_invalidates_changed_contexts() {
    let directory = fixture();
    let root = directory.path();
    fs::write(root.join("input/context"), "first").unwrap();
    for _ in 0..2 {
        let result = run(root, "batch");
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert_eq!(fs::read(root.join("transforms")).unwrap(), b"xx");
        assert_eq!(fs::read(root.join("dist/batch-0")).unwrap(), [0, 255, 10]);
        assert_eq!(fs::read(root.join("dist/batch-1")).unwrap(), b"second");
        assert_eq!(fs::read(root.join("dist/batch-2")).unwrap(), [0, 255, 10]);
        fs::remove_dir_all(root.join("dist")).unwrap();
    }
    fs::write(root.join("input/context"), "changed").unwrap();
    assert!(run(root, "batch").status.success());
    assert_eq!(fs::read(root.join("transforms")).unwrap(), b"xxxx");
}

#[test]
fn reads_inputs_created_between_recipe_actions() {
    let directory = fixture();
    let root = directory.path();
    let result = run(root, "generated_inputs");
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert_eq!(fs::read(root.join("dist/first")).unwrap(), b"first");
    assert_eq!(fs::read(root.join("dist/second")).unwrap(), b"second");
}

#[test]
fn reads_current_contents_after_recipe_writes_and_deletions() {
    let directory = fixture();
    let root = directory.path();
    let result = run(root, "rewritten_inputs");
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert_eq!(fs::read(root.join("dist/before")).unwrap(), [0, 255, 10]);
    assert_eq!(fs::read(root.join("dist/after")).unwrap(), b"rewritten");
}

#[test]
fn propagates_errors_and_detects_cycles() {
    let directory = fixture();
    for (task, message) in [
        ("missing", "Unknown task"),
        ("cycle", "dependency cycle"),
        ("crash", "worker exited"),
        ("malformed", "Invalid worker response"),
        ("expired", "Unknown artifact in this recipe"),
    ] {
        let result = run(directory.path(), task);
        assert!(!result.status.success());
        assert!(
            String::from_utf8_lossy(&result.stderr).contains(message),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
    }
    fs::remove_file(directory.path().join("input/file")).unwrap();
    let result = run(directory.path(), "copy");
    assert!(!result.status.success());
    assert!(!directory.path().join("dist/file").exists());
}

#[test]
fn rebuilds_changed_inputs_while_watching() {
    assert_watch_rebuilds(false);
}

#[cfg(unix)]
#[test]
fn follows_symlinks_while_watching() {
    assert_watch_rebuilds(true);
}

fn assert_watch_rebuilds(linked: bool) {
    let directory = fixture();
    let root = directory.path();
    let input = if linked {
        root.join("outside/file")
    } else {
        root.join("input/file")
    };
    #[cfg(unix)]
    if linked {
        fs::rename(root.join("input"), root.join("outside")).unwrap();
        fs::create_dir(root.join("input")).unwrap();
        std::os::unix::fs::symlink("../outside/file", root.join("input/file")).unwrap();
        std::os::unix::fs::symlink("../outside", root.join("input/directory")).unwrap();
        std::os::unix::fs::symlink("../input", root.join("outside/cycle")).unwrap();
    }
    let log = root.join("watch.log");
    let mut child = Command::new(env!("CARGO_BIN_EXE_next-taskr"))
        .arg("--cwd")
        .arg(root)
        .arg("--worker")
        .arg(root.join("worker.cjs"))
        .arg("watch")
        .stderr(fs::File::create(&log).unwrap())
        .spawn()
        .unwrap();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let wait_for = |predicate: &dyn Fn() -> bool| {
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
            while !predicate() {
                assert!(
                    std::time::Instant::now() < deadline,
                    "{}",
                    fs::read_to_string(&log).unwrap()
                );
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
        };
        wait_for(&|| {
            fs::read_to_string(&log)
                .unwrap()
                .contains("Watching 1 source groups")
        });
        fs::write(&input, b"after edit").unwrap();
        wait_for(&|| fs::read(root.join("dist/file")).is_ok_and(|bytes| bytes == b"after edit"));
        fs::remove_file(&input).unwrap();
        wait_for(&|| {
            fs::read_to_string(&log)
                .unwrap()
                .contains("Input does not exist")
        });
        fs::write(&input, b"after fix").unwrap();
        wait_for(&|| fs::read(root.join("dist/file")).is_ok_and(|bytes| bytes == b"after fix"));
        assert_eq!(
            fs::read_to_string(root.join("actions"))
                .unwrap()
                .lines()
                .filter(|name| *name == "watch")
                .count(),
            1,
            "Source invalidation must not replay the initial build recipe",
        );
    }));
    let _ = child.kill();
    let _ = child.wait();
    if let Err(error) = result {
        std::panic::resume_unwind(error);
    }
}
