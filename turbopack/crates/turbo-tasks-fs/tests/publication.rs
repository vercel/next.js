#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Overlapping publications of one output path from one source file, like two endpoints sharing a
//! chunk. Request A starts first, but its graph reaches the source file only after a later edit;
//! request B starts second and observes an earlier edit. Publication validates that a plan is still
//! current under its write claims, so the newest edit must win regardless of request order.

use std::{
    fs,
    io::Read,
    sync::{
        Arc, LazyLock, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::Duration,
};

use anyhow::{Context, Result};
use futures::FutureExt;
use tokio::sync::watch;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    Effects, OperationVc, ResolvedVc, TurboTasks, Vc, publication_test_hooks,
    read_strongly_consistent_and_apply_effects, take_effects,
};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_fs::{DiskFileSystem, File, FileContent, FileSystem};

static GATES: LazyLock<[watch::Sender<bool>; 3]> = LazyLock::new(|| {
    [
        watch::channel(false).0,
        watch::channel(false).0,
        watch::channel(false).0,
    ]
});

/// Serializes the tests in this module: the publication hook and gates are process-global.
static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

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

/// Pauses the next publication that reaches `point` after `arm` until `release`.
struct Pause {
    point: publication_test_hooks::Point,
    armed: AtomicBool,
    reached: watch::Sender<bool>,
    released: watch::Sender<bool>,
}

impl Pause {
    fn install(point: publication_test_hooks::Point) -> Arc<Self> {
        let pause = Arc::new(Self {
            point,
            armed: AtomicBool::new(true),
            reached: watch::channel(false).0,
            released: watch::channel(false).0,
        });
        // Weak, so dropping the pause at the end of a test uninstalls its hook.
        let hook = Arc::downgrade(&pause);
        publication_test_hooks::set(Some(Arc::new(move |point| {
            let hook = hook.upgrade();
            async move {
                let Some(hook) = hook else { return };
                if point != hook.point || !hook.armed.swap(false, Ordering::SeqCst) {
                    return;
                }
                hook.reached.send_replace(true);
                let _ = hook
                    .released
                    .subscribe()
                    .wait_for(|released| *released)
                    .await;
            }
            .boxed()
        })));
        pause
    }

    async fn reached(&self) -> Result<()> {
        tokio::time::timeout(
            Duration::from_secs(5),
            self.reached.subscribe().wait_for(|reached| *reached),
        )
        .await
        .context("publication never reached the pause point")??;
        Ok(())
    }

    fn release(&self) {
        self.released.send_replace(true);
    }

    /// Releases the pause when dropped, so a failing schedule cannot leave a publication paused.
    fn release_on_drop(&self) -> impl Drop + '_ {
        struct Release<'a>(&'a Pause);
        impl Drop for Release<'_> {
            fn drop(&mut self) {
                self.0.release();
            }
        }
        Release(self)
    }
}

impl Drop for Pause {
    fn drop(&mut self) {
        self.release();
        publication_test_hooks::set(None);
    }
}

/// Opens every gate when dropped, so that a failing schedule cannot leave a publication paused.
struct OpenOnDrop(Vec<Arc<watch::Sender<bool>>>);

impl Drop for OpenOnDrop {
    fn drop(&mut self) {
        for gate in &self.0 {
            gate.send_replace(true);
        }
    }
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
    let _serial = SERIAL.lock().await;
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

/// B captures edit 2, then pauses holding its claim before validation. Edit 3 lands. B must not
/// write its obsolete plan, not even transiently; it recaptures and publishes edit 3.
///
/// A, which also publishes edit 3, is held before claiming until B's next write has landed, so
/// that the bytes recorded after that write are B's.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn obsolete_capture_does_not_overwrite_newer_publication() -> Result<()> {
    use publication_test_hooks::Point;

    let _serial = SERIAL.lock().await;
    let Run {
        tt,
        _dir,
        source,
        out,
        root,
    } = run()?;
    let applied = Arc::new(Mutex::new(Vec::new()));
    let captured = Arc::new(AtomicUsize::new(0));
    let claimed = Arc::new(AtomicUsize::new(0));
    let (b_reached, mut b_reached_rx) = watch::channel(false);
    let (b_release, b_released) = watch::channel(false);
    let b_release = Arc::new(b_release);
    let (a_reached, mut a_reached_rx) = watch::channel(false);
    let (a_release, a_released) = watch::channel(false);
    let a_release = Arc::new(a_release);
    let armed = Arc::new(AtomicBool::new(false));
    publication_test_hooks::set(Some(Arc::new({
        let applied = applied.clone();
        let out = out.clone();
        let armed = armed.clone();
        let a_release = a_release.clone();
        move |point| {
            let applied = applied.clone();
            let out = out.clone();
            let armed = armed.load(Ordering::SeqCst);
            let captured = (armed && point == Point::Captured)
                .then(|| captured.fetch_add(1, Ordering::SeqCst) + 1);
            let claimed = (armed && point == Point::Claimed)
                .then(|| claimed.fetch_add(1, Ordering::SeqCst) + 1);
            let (b_reached, mut b_released) = (b_reached.clone(), b_released.clone());
            let (a_reached, mut a_released) = (a_reached.clone(), a_released.clone());
            let a_release = a_release.clone();
            async move {
                if claimed == Some(1) {
                    b_reached.send_replace(true);
                    let _ = b_released.wait_for(|r| *r).await;
                }
                // The first capture is B's; the second is A's.
                if captured == Some(2) {
                    a_reached.send_replace(true);
                    let _ = a_released.wait_for(|r| *r).await;
                }
                if armed && point == Point::Applied {
                    applied
                        .lock()
                        .unwrap()
                        .push(fs::read_to_string(&out).unwrap_or_default());
                    a_release.send_replace(true);
                }
            }
            .boxed()
        }
    })));
    let result = tt
        .run_once({
            let source = source.clone();
            let out = out.clone();
            async move {
                let fs_op = disk(root);
                let fs_vc = fs_op.resolve().strongly_consistent().await?;
                let owned = fs_op.read_strongly_consistent().await?;
                let a_op = capture(publish(fs_vc, Some(1)));
                GATES[1].send_replace(true);
                read_strongly_consistent_and_apply_effects(a_op, |e| e).await?;

                fs::write(&source, "edit 2")?;
                owned.invalidate();
                armed.store(true, Ordering::SeqCst);
                let b = read_strongly_consistent_and_apply_effects(
                    capture(publish(fs_vc, None)),
                    |e| e,
                );
                let driver = async {
                    // Never leave a paused publication behind if the schedule fails.
                    let _open = OpenOnDrop(vec![b_release.clone(), a_release.clone()]);
                    tokio::time::timeout(Duration::from_secs(5), b_reached_rx.wait_for(|r| *r))
                        .await??;
                    fs::write(&source, "edit 3")?;
                    owned.invalidate();
                    let a = read_strongly_consistent_and_apply_effects(a_op, |e| e);
                    let release = async {
                        let reached = tokio::time::timeout(
                            Duration::from_secs(5),
                            a_reached_rx.wait_for(|r| *r),
                        )
                        .await;
                        b_release.send_replace(true);
                        if !matches!(reached, Ok(Ok(_))) {
                            a_release.send_replace(true);
                        }
                        reached??;
                        anyhow::Ok(())
                    };
                    futures::future::try_join(a, release).await?;
                    anyhow::Ok(())
                };
                // `try_join` drops the driver, opening every gate, as soon as either side fails.
                tokio::time::timeout(
                    Duration::from_secs(10),
                    futures::future::try_join(b, driver),
                )
                .await
                .context("the schedule did not finish")??;
                anyhow::Ok(fs::read_to_string(&out)?)
            }
        })
        .await;
    publication_test_hooks::set(None);
    tt.stop_and_wait().await;
    let final_bytes = result?;
    let applied = applied.lock().unwrap().clone();
    assert!(
        !applied.iter().any(|bytes| bytes == "edit 2"),
        "the obsolete plan was written: {applied:?}"
    );
    assert_eq!(applied.first().map(String::as_str), Some("edit 3"));
    assert_eq!(final_bytes, "edit 3");
    Ok(())
}

/// B applies edit 2 and pauses before revalidation. Its written claim is already released, so A
/// publishes edit 3 without waiting for B. B then notices its plan became obsolete and repairs,
/// and the newest edit wins.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn plan_obsoleted_during_apply_is_repaired() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let Run {
        tt,
        _dir,
        source,
        out,
        root,
    } = run()?;
    let observed = Arc::new(Mutex::new(Vec::new()));
    let result = tt
        .run_once({
            let source = source.clone();
            let out = out.clone();
            let observed = observed.clone();
            async move {
                let fs_op = disk(root);
                let fs_vc = fs_op.resolve().strongly_consistent().await?;
                let owned = fs_op.read_strongly_consistent().await?;
                let a_op = capture(publish(fs_vc, Some(2)));
                GATES[2].send_replace(true);
                read_strongly_consistent_and_apply_effects(a_op, |e| e).await?;

                fs::write(&source, "edit 2")?;
                owned.invalidate();
                let pause = Pause::install(publication_test_hooks::Point::Applied);
                let b = read_strongly_consistent_and_apply_effects(
                    capture(publish(fs_vc, None)),
                    |e| e,
                );
                let driver = async {
                    let _release = pause.release_on_drop();
                    pause.reached().await?;
                    observed.lock().unwrap().push(fs::read_to_string(&out)?);
                    fs::write(&source, "edit 3")?;
                    owned.invalidate();
                    let a = tokio::time::timeout(
                        Duration::from_secs(5),
                        read_strongly_consistent_and_apply_effects(a_op, |e| e),
                    )
                    .await;
                    let observed_after_a = fs::read_to_string(&out);
                    pause.release();
                    a.context("A waited for B, which no longer writes")??;
                    observed.lock().unwrap().push(observed_after_a?);
                    anyhow::Ok(())
                };
                let (b, driver) = futures::future::join(b, driver).await;
                driver?;
                b?;
                observed.lock().unwrap().push(fs::read_to_string(&out)?);
                anyhow::Ok(())
            }
        })
        .await;
    tt.stop_and_wait().await;
    result?;
    assert_eq!(*observed.lock().unwrap(), ["edit 2", "edit 3", "edit 3"]);
    Ok(())
}

/// B applies edit 2 and pauses before revalidation. Edit 3 lands, but nothing else publishes, so
/// storage still holds B's plan. B's own revalidation must notice the root changed and publish
/// edit 3.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn plan_obsoleted_during_apply_is_republished_without_a_competing_writer() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let Run {
        tt,
        _dir,
        source,
        out,
        root,
    } = run()?;
    let result = tt
        .run_once({
            let source = source.clone();
            let out = out.clone();
            async move {
                let fs_op = disk(root);
                let fs_vc = fs_op.resolve().strongly_consistent().await?;
                let owned = fs_op.read_strongly_consistent().await?;
                fs::write(&source, "edit 2")?;
                owned.invalidate();
                let pause = Pause::install(publication_test_hooks::Point::Applied);
                let b = read_strongly_consistent_and_apply_effects(
                    capture(publish(fs_vc, None)),
                    |e| e,
                );
                let driver = async {
                    let _release = pause.release_on_drop();
                    pause.reached().await?;
                    let after_apply = fs::read_to_string(&out)?;
                    fs::write(&source, "edit 3")?;
                    owned.invalidate();
                    anyhow::Ok(after_apply)
                };
                let (_, after_apply) = tokio::time::timeout(
                    Duration::from_secs(10),
                    futures::future::try_join(b, driver),
                )
                .await
                .context("the schedule did not finish")??;
                anyhow::Ok((after_apply, fs::read_to_string(&out)?))
            }
        })
        .await;
    tt.stop_and_wait().await;
    let (after_apply, after_b) = result?;
    assert_eq!(after_apply, "edit 2");
    assert_eq!(after_b, "edit 3");
    Ok(())
}

/// W captures edit 2, is validated, and pauses before writing. The input returns to edit 1, which
/// is already on disk, and N publishes it. Once N reports success, edit 2 must never be written.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn matching_output_does_not_bypass_an_admitted_writer() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let Run {
        tt,
        _dir,
        source,
        out,
        root,
    } = run()?;
    let events = Arc::new(Mutex::new(Vec::<String>::new()));
    let (release, released) = watch::channel(false);
    let release = Arc::new(release);
    let (reached, mut reached_rx) = watch::channel(false);
    let (applied, mut applied_rx) = watch::channel(0usize);
    let armed = Arc::new(AtomicBool::new(false));
    publication_test_hooks::set(Some(Arc::new({
        let events = events.clone();
        let out = out.clone();
        let armed = armed.clone();
        move |point| {
            let events = events.clone();
            let out = out.clone();
            let mut released = released.clone();
            let pause = point == publication_test_hooks::Point::Validated
                && armed.swap(false, Ordering::SeqCst);
            let reached = reached.clone();
            if point == publication_test_hooks::Point::Applied {
                events
                    .lock()
                    .unwrap()
                    .push(fs::read_to_string(&out).unwrap_or_default());
                applied.send_modify(|count| *count += 1);
            }
            async move {
                if pause {
                    reached.send_replace(true);
                    let _ = released.wait_for(|released| *released).await;
                }
            }
            .boxed()
        }
    })));
    let result = tt
        .run_once({
            let source = source.clone();
            let events = events.clone();
            async move {
                let fs_op = disk(root);
                let fs_vc = fs_op.resolve().strongly_consistent().await?;
                let owned = fs_op.read_strongly_consistent().await?;
                let op = capture(publish(fs_vc, None));
                read_strongly_consistent_and_apply_effects(op, |e| e).await?;

                fs::write(&source, "edit 2")?;
                owned.invalidate();
                armed.store(true, Ordering::SeqCst);
                let w = read_strongly_consistent_and_apply_effects(op, |e| e);
                let driver = async {
                    let _open = OpenOnDrop(vec![release.clone()]);
                    tokio::time::timeout(Duration::from_secs(5), reached_rx.wait_for(|r| *r))
                        .await??;
                    fs::write(&source, "edit 1")?;
                    owned.invalidate();
                    let n = read_strongly_consistent_and_apply_effects(op, |e| e);
                    // N writes nothing (edit 1 is on disk), so its first `Applied` is the start of
                    // its commit, which must wait for W's admitted write.
                    let release = async {
                        let reached = tokio::time::timeout(
                            Duration::from_secs(5),
                            applied_rx.wait_for(|count| *count >= 2),
                        )
                        .await;
                        release.send_replace(true);
                        reached??;
                        anyhow::Ok(())
                    };
                    let (n, release) = futures::future::join(n, release).await;
                    release?;
                    n?;
                    events.lock().unwrap().push("N returned".into());
                    anyhow::Ok(())
                };
                let (w, driver) = futures::future::join(w, driver).await;
                driver?;
                w?;
                anyhow::Ok(())
            }
        })
        .await;
    publication_test_hooks::set(None);
    tt.stop_and_wait().await;
    result?;
    let events = events.lock().unwrap().clone();
    let returned = events
        .iter()
        .position(|e| e == "N returned")
        .context("N did not return")?;
    assert!(
        !events[returned..].iter().any(|e| e == "edit 2"),
        "edit 2 was written after N published edit 1: {events:?}"
    );
    assert_eq!(fs::read_to_string(&out)?, "edit 1");
    Ok(())
}

/// The source changes every time a publication has claimed its output, so every plan is obsolete by
/// the time it is validated. After the bounded number of obsolete plans, publication stops
/// checking currentness and writes the latest plan instead of failing.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn constantly_changing_inputs_publish_the_latest_plan() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let Run {
        tt,
        _dir,
        source,
        out,
        root,
    } = run()?;
    let claimed = Arc::new(AtomicUsize::new(0));
    let result = tt
        .run_once({
            let source = source.clone();
            let claimed = claimed.clone();
            async move {
                let fs_op = disk(root);
                let fs_vc = fs_op.resolve().strongly_consistent().await?;
                let owned = fs_op.read_strongly_consistent().await?;
                publication_test_hooks::set(Some(Arc::new(move |point| {
                    if point == publication_test_hooks::Point::Claimed {
                        let n = claimed.fetch_add(1, Ordering::SeqCst) + 1;
                        fs::write(&source, format!("change {n}")).unwrap();
                        owned.invalidate();
                    }
                    async {}.boxed()
                })));
                let published = tokio::time::timeout(
                    Duration::from_secs(10),
                    read_strongly_consistent_and_apply_effects(
                        capture(publish(fs_vc, None)),
                        |e| e,
                    ),
                )
                .await;
                publication_test_hooks::set(None);
                published.context("publication did not finish")??;
                anyhow::Ok(())
            }
        })
        .await;
    publication_test_hooks::set(None);
    tt.stop_and_wait().await;
    result?;
    // 16 obsolete plans, then one written without checking.
    assert_eq!(claimed.load(Ordering::SeqCst), 17);
    assert_eq!(fs::read_to_string(&out)?, "change 16");
    assert_eq!(fs::read_to_string(&source)?, "change 17");
    Ok(())
}
