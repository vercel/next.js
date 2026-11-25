#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! The vercel/next.js#101257 scenarios, run against this branch's publication.
//!
//! Writer tasks A and B write `out.txt`. Their content comes from a `State` holding the current
//! edit number; `tag` makes them different producers and so different writer tasks.

use std::{
    fs,
    sync::{
        Arc, LazyLock,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use anyhow::{Context, Result};
use futures::FutureExt;
use tokio::sync::watch;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    Effects, OperationVc, ReadRef, ResolvedVc, State, TurboTasks, Vc, publication_test_hooks,
    read_strongly_consistent_and_apply_effects, take_effects,
};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_fs::{DiskFileSystem, DiskFileSystemMap, File, FileContent, FileSystem};

/// Gates that A's producer waits on, so a test can hold it at a chosen point.
static GATE_OLD: LazyLock<watch::Sender<bool>> = LazyLock::new(|| watch::channel(false).0);
static GATE_NEW: LazyLock<watch::Sender<bool>> = LazyLock::new(|| watch::channel(false).0);
static REACHED_OLD: LazyLock<watch::Sender<bool>> = LazyLock::new(|| watch::channel(false).0);
static REACHED_NEW: LazyLock<watch::Sender<bool>> = LazyLock::new(|| watch::channel(false).0);
static GATED: AtomicBool = AtomicBool::new(false);
static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[turbo_tasks::value]
struct Input {
    edit: State<u32>,
}

#[turbo_tasks::function(operation, root)]
fn input() -> Vc<Input> {
    Input {
        edit: State::new(1),
    }
    .cell()
}

#[turbo_tasks::function(operation, root)]
fn disk(root: RcStr) -> Vc<DiskFileSystem> {
    DiskFileSystem::new_with_options(
        "scenarios".into(),
        Vc::cell(root),
        Vec::new(),
        Default::default(),
        DiskFileSystemMap::empty(),
        Some(".staging".into()),
    )
}

/// The content producer for writer `tag`. When gating is on, A (tag 0) waits after reading edit 1
/// on `GATE_OLD`, and after reading a later edit on `GATE_NEW`.
#[turbo_tasks::function]
async fn content(tag: u8, input: ResolvedVc<Input>) -> Result<Vc<FileContent>> {
    let edit = *input.await?.edit.get();
    if tag == 0 && GATED.load(Ordering::SeqCst) {
        let (reached, gate) = if edit == 1 {
            (&REACHED_OLD, &GATE_OLD)
        } else {
            (&REACHED_NEW, &GATE_NEW)
        };
        reached.send_replace(true);
        gate.subscribe().wait_for(|open| *open).await?;
    }
    Ok(FileContent::Content(File::from(format!("edit {edit}"))).cell())
}

#[turbo_tasks::function(operation, root)]
async fn writer(
    fs: ResolvedVc<DiskFileSystem>,
    input: ResolvedVc<Input>,
    tag: u8,
) -> Result<Vc<()>> {
    FileSystem::root(*fs)
        .await?
        .join("out.txt")?
        .write(content(tag, *input))
        .await?;
    Ok(Vc::cell(()))
}

#[turbo_tasks::function(operation, root)]
async fn capture(op: OperationVc<()>) -> Result<Vc<Effects>> {
    op.read_strongly_consistent().await?;
    Ok(take_effects(op).await?.cell())
}

struct Setup {
    tt: Arc<TurboTasks<TurboTasksBackend>>,
    _dir: tempfile::TempDir,
    out: std::path::PathBuf,
    root: RcStr,
}

fn setup() -> Result<Setup> {
    for gate in [&GATE_OLD, &GATE_NEW, &REACHED_OLD, &REACHED_NEW] {
        gate.send_replace(false);
    }
    GATED.store(false, Ordering::SeqCst);
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
    Ok(Setup {
        tt,
        out: path.join("out.txt"),
        root: path.to_str().context("Non-UTF8 path")?.into(),
        _dir: dir,
    })
}

async fn wait(reached: &watch::Sender<bool>) -> Result<()> {
    tokio::time::timeout(
        Duration::from_secs(10),
        reached.subscribe().wait_for(|r| *r),
    )
    .await
    .context("producer never reached its gate")??;
    Ok(())
}

/// Scenario 1: two producers for one file. A's producer computed edit 1 but is slow to finish;
/// edit 2 lands and B publishes it. When A's producer finishes, A must not overwrite B's newer
/// output.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn outdated_writer_overwrites_newer_published_output() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let Setup {
        tt,
        _dir,
        out,
        root,
    } = setup()?;
    let result = tt
        .run_once({
            let out = out.clone();
            async move {
                let fs = disk(root).resolve().strongly_consistent().await?;
                let input_op = input();
                let input_vc = input_op.resolve().strongly_consistent().await?;
                let input_value = input_op.read_strongly_consistent().await?;
                GATED.store(true, Ordering::SeqCst);
                let a = capture(writer(fs, input_vc, 0));
                let b = capture(writer(fs, input_vc, 1));
                let a_publication = read_strongly_consistent_and_apply_effects(a, |e| e);
                let driver = async {
                    // Whatever happens, never leave A's producer blocked.
                    struct Open;
                    impl Drop for Open {
                        fn drop(&mut self) {
                            GATE_OLD.send_replace(true);
                            GATE_NEW.send_replace(true);
                        }
                    }
                    let _open = Open;
                    wait(&REACHED_OLD).await?;
                    input_value.edit.set(2);
                    read_strongly_consistent_and_apply_effects(b, |e| e).await?;
                    let after_b = fs::read_to_string(&out)?;
                    // A's producer finishes with the edit it read, then recomputes.
                    GATE_OLD.send_replace(true);
                    wait(&REACHED_NEW).await?;
                    let after_a_wrote = fs::read_to_string(&out)?;
                    GATE_NEW.send_replace(true);
                    anyhow::Ok((after_b, after_a_wrote))
                };
                let (a_result, observed) = futures::future::join(a_publication, driver).await;
                let observed = observed?;
                a_result?;
                anyhow::Ok((observed, fs::read_to_string(&out)?))
            }
        })
        .await;
    tt.stop_and_wait().await;
    let ((after_b, after_a_wrote), final_bytes) = result?;
    println!(
        "scenario 1: after B published = {after_b:?}, while A's producer recomputes = \
         {after_a_wrote:?}, final = {final_bytes:?}"
    );
    assert_eq!(after_b, "edit 2");
    assert_eq!(
        after_a_wrote, "edit 2",
        "an outdated write replaced B's published output"
    );
    Ok(())
}

/// Scenarios 2 and 3: a publication reads A's plan for edit 1 and pauses at `point`. A rewrites
/// the file with edit 2 (and, with `other_writer`, B publishes the same newer bytes). When the
/// publication resumes it must not report success for the edit 1 plan.
async fn stale_plan_is_rejected(
    other_writer: bool,
    point: publication_test_hooks::Point,
) -> Result<(String, bool)> {
    let Setup {
        tt,
        _dir,
        out,
        root,
    } = setup()?;
    let armed = Arc::new(AtomicBool::new(true));
    let (reached, mut reached_rx) = watch::channel(false);
    let (release, released) = watch::channel(false);
    let release = Arc::new(release);
    publication_test_hooks::set(Some(Arc::new({
        let armed = armed.clone();
        move |at| {
            let pause = at == point && armed.swap(false, Ordering::SeqCst);
            let reached = reached.clone();
            let mut released = released.clone();
            async move {
                if pause {
                    reached.send_replace(true);
                    let _ = released.wait_for(|r| *r).await;
                }
            }
            .boxed()
        }
    })));
    let result = tt
        .run_once({
            let out = out.clone();
            let release = release.clone();
            async move {
                let fs = disk(root).resolve().strongly_consistent().await?;
                let input_op = input();
                let input_vc = input_op.resolve().strongly_consistent().await?;
                let input_value = input_op.read_strongly_consistent().await?;
                let a = capture(writer(fs, input_vc, 0));
                let old_plan: ReadRef<Effects> = a.read_strongly_consistent().await?;
                let publication = read_strongly_consistent_and_apply_effects(a, |e| e);
                let driver = async {
                    struct Release(Arc<watch::Sender<bool>>);
                    impl Drop for Release {
                        fn drop(&mut self) {
                            self.0.send_replace(true);
                        }
                    }
                    let _release = Release(release.clone());
                    tokio::time::timeout(Duration::from_secs(10), reached_rx.wait_for(|r| *r))
                        .await??;
                    input_value.edit.set(2);
                    a.read_strongly_consistent().await?;
                    if other_writer {
                        let b = capture(writer(fs, input_vc, 1));
                        read_strongly_consistent_and_apply_effects(b, |e| e).await?;
                    }
                    anyhow::Ok(())
                };
                let (published, driver) = futures::future::join(publication, driver).await;
                driver?;
                let published = published?;
                anyhow::Ok((
                    fs::read_to_string(&out)?,
                    ReadRef::ptr_eq(&published, &old_plan),
                ))
            }
        })
        .await;
    publication_test_hooks::set(None);
    tt.stop_and_wait().await;
    result
}

async fn check(other_writer: bool, point: publication_test_hooks::Point, name: &str) -> Result<()> {
    let (on_disk, returned_old_plan) = stale_plan_is_rejected(other_writer, point).await?;
    println!(
        "{name} (paused at {point:?}): disk = {on_disk:?}, publication returned the edit 1 plan = \
         {returned_old_plan}"
    );
    assert_eq!(on_disk, "edit 2");
    assert!(
        !returned_old_plan,
        "a plan for edit 1 reported success while disk holds {on_disk:?}"
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn stale_plan_rejected_when_same_writer_wrote_newer() -> Result<()> {
    let _serial = SERIAL.lock().await;
    check(
        false,
        publication_test_hooks::Point::Captured,
        "scenario 2 (same writer)",
    )
    .await?;
    check(
        false,
        publication_test_hooks::Point::Applied,
        "scenario 2 (same writer)",
    )
    .await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn stale_plan_rejected_when_other_writer_has_equal_content() -> Result<()> {
    let _serial = SERIAL.lock().await;
    check(
        true,
        publication_test_hooks::Point::Captured,
        "scenario 3 (equal content)",
    )
    .await?;
    check(
        true,
        publication_test_hooks::Point::Applied,
        "scenario 3 (equal content)",
    )
    .await
}
