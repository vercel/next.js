#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Overlapping publications of one output path from one source file, like two endpoints sharing a
//! chunk. Request A starts first, but its graph reaches the source file only after a later edit;
//! request B starts second and observes an earlier edit. Publication validates that a plan is still
//! current under its write claims, so the newest edit must win regardless of request order.

use std::{
    fs,
    io::Read,
    sync::{Arc, LazyLock, Mutex},
    time::Duration,
};

use anyhow::{Context, Result};
use tokio::sync::watch;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    Effects, OperationVc, ResolvedVc, TurboTasks, Vc, read_strongly_consistent_and_apply_effects,
    take_effects,
};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_fs::{DiskFileSystem, File, FileContent, FileSystem};

static GATES: LazyLock<[watch::Sender<bool>; 1]> = LazyLock::new(|| [watch::channel(false).0]);

/// Copies `source.txt` to `out.txt`. When `gate` is set, waits for that gate before reading the
/// source, modeling a request whose graph is slow to reach the changed file.
#[turbo_tasks::function(operation, root)]
async fn publish(fs: ResolvedVc<DiskFileSystem>, gate: Option<u8>) -> Result<Vc<()>> {
    if let Some(gate) = gate {
        GATES[gate as usize]
            .subscribe()
            .wait_for(|open| *open)
            .await?;
    }
    let root = FileSystem::root(*fs).await?;
    let content = root.join("source.txt")?.read().await?;
    let mut text = String::new();
    content
        .as_content()
        .context("Missing source file")?
        .read()
        .read_to_string(&mut text)?;
    root.join("out.txt")?
        .write(FileContent::Content(File::from(text)).cell())
        .await?;
    Ok(Vc::cell(()))
}

#[turbo_tasks::function(operation, root)]
async fn capture(operation: OperationVc<()>) -> Result<Vc<Effects>> {
    operation.read_strongly_consistent().await?;
    Ok(take_effects(operation).await?.cell())
}

#[turbo_tasks::function(operation, root)]
fn disk(root: RcStr) -> Vc<DiskFileSystem> {
    DiskFileSystem::new("overlap".into(), Vc::cell(root))
}

struct Run {
    tt: Arc<TurboTasks<TurboTasksBackend>>,
    _dir: tempfile::TempDir,
    source: std::path::PathBuf,
    out: std::path::PathBuf,
    root: RcStr,
}

fn run() -> Result<Run> {
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            num_workers: Some(4),
            small_preallocation: true,
            ..Default::default()
        },
        noop_backing_storage(),
    ));
    let dir = tempfile::tempdir()?;
    let path = fs::canonicalize(dir.path())?;
    let source = path.join("source.txt");
    let out = path.join("out.txt");
    fs::write(&source, "edit 1")?;
    fs::write(&out, "edit 1")?;
    let root = path.to_str().context("Non-UTF8 path")?.into();
    for gate in GATES.iter() {
        gate.send_replace(false);
    }
    Ok(Run {
        tt,
        _dir: dir,
        source,
        out,
        root,
    })
}

/// A is blocked before reading the source; B publishes edit 2; edit 3 lands; A publishes edit 3.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn earlier_request_publishing_newest_edit_is_not_rejected() -> Result<()> {
    let Run {
        tt,
        _dir,
        source,
        out,
        root,
    } = run()?;
    let after_b = Arc::new(Mutex::new(String::new()));
    let result = tt
        .run_once({
            let source = source.clone();
            let out = out.clone();
            let after_b = after_b.clone();
            async move {
                let fs_op = disk(root);
                let fs_vc = fs_op.resolve().strongly_consistent().await?;
                let owned = fs_op.read_strongly_consistent().await?;
                let a = read_strongly_consistent_and_apply_effects(
                    capture(publish(fs_vc, Some(0))),
                    |e| e,
                );
                let driver = async {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                    fs::write(&source, "edit 2")?;
                    owned.invalidate();
                    read_strongly_consistent_and_apply_effects(
                        capture(publish(fs_vc, None)),
                        |e| e,
                    )
                    .await?;
                    *after_b.lock().unwrap() = fs::read_to_string(&out)?;
                    fs::write(&source, "edit 3")?;
                    owned.invalidate();
                    GATES[0].send_replace(true);
                    anyhow::Ok(())
                };
                let (a, driver) = futures::future::join(a, driver).await;
                driver?;
                a?;
                anyhow::Ok(())
            }
        })
        .await;
    tt.stop_and_wait().await;
    result?;
    assert_eq!(*after_b.lock().unwrap(), "edit 2");
    assert_eq!(fs::read_to_string(&out)?, "edit 3");
    Ok(())
}
