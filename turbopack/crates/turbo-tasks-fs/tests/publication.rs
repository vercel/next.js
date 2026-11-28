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
use turbo_tasks_fs::{DiskFileSystem, DiskFileSystemMap, File, FileContent, FileSystem};

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
    DiskFileSystem::new_with_options(
        "overlap".into(),
        Vc::cell(root),
        Vec::new(),
        Default::default(),
        DiskFileSystemMap::empty(),
        Some(STAGING.into()),
    )
}

/// Where [`disk`] stages writes, relative to its root.
const STAGING: &str = ".staging";

/// The files staged below `root`.
fn staged_files(root: &std::path::Path) -> Vec<std::path::PathBuf> {
    let Ok(dirs) = fs::read_dir(root.join(STAGING)) else {
        return Vec::new();
    };
    dirs.flatten()
        .filter(|dir| dir.file_name().to_string_lossy().starts_with("p-"))
        .flat_map(|dir| fs::read_dir(dir.path()).into_iter().flatten().flatten())
        .map(|file| file.path())
        .filter(|path| path.file_name().is_some_and(|name| name != "lease"))
        .collect()
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

/// Writes `text` to `path`. Each distinct `text` is a distinct writer task.
#[turbo_tasks::function(operation, root)]
async fn write_text(fs: ResolvedVc<DiskFileSystem>, path: RcStr, text: RcStr) -> Result<Vc<()>> {
    let root = FileSystem::root(*fs).await?;
    root.join(&path)?
        .write(FileContent::Content(File::from(text)).cell())
        .await?;
    Ok(Vc::cell(()))
}

/// A write task stages its file while it executes. Only publication moves it into place, and
/// publishing again doesn't rewrite it.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn writes_are_staged_until_published() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let Run {
        tt,
        _dir,
        out,
        root,
        ..
    } = run()?;
    let dir = std::path::PathBuf::from(root.as_str());
    let result = tt
        .run_once({
            let out = out.clone();
            let dir = dir.clone();
            async move {
                let fs_vc = disk(root).resolve().strongly_consistent().await?;
                let initial = fs::read_to_string(&out).ok();
                let op = capture(write_text(fs_vc, "out.txt".into(), "staged".into()));
                op.read_strongly_consistent().await?;
                let before_publication = (
                    fs::read_to_string(&out).ok() == initial,
                    staged_files(&dir).len(),
                );
                read_strongly_consistent_and_apply_effects(op, |e| e).await?;
                let modified = fs::metadata(&out)?.modified()?;
                let after_publication = (fs::read_to_string(&out)?, staged_files(&dir).len());
                read_strongly_consistent_and_apply_effects(op, |e| e).await?;
                anyhow::Ok((
                    before_publication,
                    after_publication,
                    modified == fs::metadata(&out)?.modified()?,
                ))
            }
        })
        .await;
    tt.stop_and_wait().await;
    let (before_publication, after_publication, unchanged) = result?;
    assert_eq!(
        before_publication,
        (true, 1),
        "only staged before publication"
    );
    assert_eq!(after_publication, ("staged".to_string(), 0));
    assert!(unchanged, "publishing again rewrote the file");
    Ok(())
}

/// A write task that executes but whose effects aren't published (e.g. a task that is no longer
/// part of the graph) never changes its output.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn unpublished_writes_never_reach_the_output() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let Run {
        tt,
        _dir,
        out,
        root,
        ..
    } = run()?;
    let result = tt
        .run_once({
            let out = out.clone();
            async move {
                let fs_vc = disk(root).resolve().strongly_consistent().await?;
                let read = || fs::read_to_string(&out).unwrap_or_else(|_| "(none)".into());
                let initial = read();
                let a = capture(write_text(fs_vc, "out.txt".into(), "a".into()));
                a.read_strongly_consistent().await?;
                let after_a_executed = read();
                let b = capture(write_text(fs_vc, "out.txt".into(), "b".into()));
                b.read_strongly_consistent().await?;
                let after_b_executed = read();
                read_strongly_consistent_and_apply_effects(b, |e| e).await?;
                let after_b_published = read();
                let c = capture(write_text(fs_vc, "out.txt".into(), "c".into()));
                c.read_strongly_consistent().await?;
                let after_c_executed = read();
                anyhow::Ok([
                    initial,
                    after_a_executed,
                    after_b_executed,
                    after_b_published,
                    after_c_executed,
                ])
            }
        })
        .await;
    tt.stop_and_wait().await;
    let [initial, rest @ ..] = result?;
    assert_eq!(
        rest,
        [initial.clone(), initial, "b".to_string(), "b".to_string()]
    );
    Ok(())
}

/// A write that can't be installed doesn't fail the writer task: the error is reported when its
/// effects are published.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn write_error_is_reported_by_publication() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let Run {
        tt,
        _dir,
        root,
        source,
        ..
    } = run()?;
    let blocker = source.with_file_name("blocker");
    fs::write(&blocker, "a file, not a directory")?;
    let result = tt
        .run_once(async move {
            let fs_vc = disk(root).resolve().strongly_consistent().await?;
            let op = capture(write_text(fs_vc, "blocker/out.txt".into(), "x".into()));
            op.read_strongly_consistent().await?;
            let published = read_strongly_consistent_and_apply_effects(op, |e| e).await;
            anyhow::Ok(published.map(|_| ()))
        })
        .await;
    tt.stop_and_wait().await;
    let error = result?.expect_err("the failed write must be reported");
    assert!(
        format!("{error:#}").contains("failed to write to"),
        "{error:#}"
    );
    Ok(())
}

#[turbo_tasks::function(operation, root)]
async fn write_content_at(
    fs: ResolvedVc<DiskFileSystem>,
    path: RcStr,
    text: Option<RcStr>,
    permissions: u8,
) -> Result<Vc<()>> {
    let root = FileSystem::root(*fs).await?;
    let content = match text {
        Some(text) => FileContent::Content(File::from(text).with_permissions(match permissions {
            0 => turbo_tasks_fs::Permissions::Readable,
            1 => turbo_tasks_fs::Permissions::Writable,
            _ => turbo_tasks_fs::Permissions::Executable,
        })),
        None => FileContent::NotFound,
    };
    root.join(&path)?.write(content.cell()).await?;
    Ok(Vc::cell(()))
}

/// A delete only happens on publication, and an executable keeps its permissions.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn writes_delete_and_keep_permissions() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let Run { tt, _dir, root, .. } = run()?;
    let dir = std::path::PathBuf::from(root.as_str());
    let result = tt
        .run_once({
            let dir = dir.clone();
            async move {
                let fs_vc = disk(root).resolve().strongly_consistent().await?;
                fs::write(dir.join("gone.txt"), "old")?;
                let delete = capture(write_content_at(fs_vc, "gone.txt".into(), None, 1));
                delete.read_strongly_consistent().await?;
                let kept_until_published = dir.join("gone.txt").exists();
                read_strongly_consistent_and_apply_effects(delete, |e| e).await?;

                read_strongly_consistent_and_apply_effects(
                    capture(write_content_at(
                        fs_vc,
                        "nested/run.sh".into(),
                        Some("#!/bin/sh".into()),
                        2,
                    )),
                    |e| e,
                )
                .await?;
                anyhow::Ok(kept_until_published)
            }
        })
        .await;
    tt.stop_and_wait().await;
    assert!(result?, "the delete happened before publication");
    assert!(!dir.join("gone.txt").exists());
    assert_eq!(fs::read_to_string(dir.join("nested/run.sh"))?, "#!/bin/sh");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = fs::metadata(dir.join("nested/run.sh"))?
            .permissions()
            .mode();
        assert_ne!(mode & 0o111, 0, "not executable: {mode:o}");
    }
    Ok(())
}

/// How often [`write_failing`] executed.
static FAILING_EXECUTIONS: AtomicUsize = AtomicUsize::new(0);

/// Writes below a regular file, which fails.
#[turbo_tasks::function(operation, root)]
async fn write_failing(fs: ResolvedVc<DiskFileSystem>) -> Result<Vc<()>> {
    FAILING_EXECUTIONS.fetch_add(1, Ordering::SeqCst);
    FileSystem::root(*fs)
        .await?
        .join("blocker/out.txt")?
        .write(FileContent::Content(File::from("unreachable")).cell())
        .await?;
    Ok(Vc::cell(()))
}

/// A failed write is reported by publication as the write's error, without re-executing the write
/// task.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn failed_write_is_reported_once() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let Run { tt, _dir, root, .. } = run()?;
    fs::write(
        std::path::Path::new(root.as_str()).join("blocker"),
        "a file",
    )?;
    let result = tt
        .run_once(async move {
            let fs_vc = disk(root).resolve().strongly_consistent().await?;
            let published = tokio::time::timeout(
                Duration::from_secs(5),
                read_strongly_consistent_and_apply_effects(capture(write_failing(fs_vc)), |e| e),
            )
            .await?;
            anyhow::Ok(published.map(|_| ()).map_err(|err| format!("{err:#}")))
        })
        .await;
    tt.stop_and_wait().await;
    let err = result?.expect_err("the write can't succeed");
    assert!(err.contains("failed to write"), "{err}");
    assert_eq!(FAILING_EXECUTIONS.load(Ordering::SeqCst), 1);
    Ok(())
}

/// Equal bytes with different permissions are different content.
#[cfg(unix)]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn permissions_are_part_of_the_content() -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let _serial = SERIAL.lock().await;
    let Run { tt, _dir, root, .. } = run()?;
    let file = std::path::PathBuf::from(root.as_str()).join("mode.txt");
    let result = tt
        .run_once({
            let file = file.clone();
            async move {
                let fs_vc = disk(root).resolve().strongly_consistent().await?;
                let mut modes = Vec::new();
                for permissions in [0, 1, 0] {
                    read_strongly_consistent_and_apply_effects(
                        capture(write_content_at(
                            fs_vc,
                            "mode.txt".into(),
                            Some("same".into()),
                            permissions,
                        )),
                        |e| e,
                    )
                    .await?;
                    modes.push(fs::metadata(&file)?.permissions().mode() & 0o777);
                }
                anyhow::Ok(modes)
            }
        })
        .await;
    tt.stop_and_wait().await;
    assert_eq!(result?, [0o444, 0o664, 0o444]);
    Ok(())
}

/// An output changed outside of turbo-tasks after it was written is written again by the next
/// publication, whether one task or several write it.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn outputs_changed_outside_are_rewritten() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let Run { tt, _dir, root, .. } = run()?;
    let dir = std::path::PathBuf::from(root.as_str());
    let result = tt
        .run_once({
            let dir = dir.clone();
            async move {
                let fs_vc = disk(root).resolve().strongly_consistent().await?;
                let publish = |op: OperationVc<Effects>| async move {
                    read_strongly_consistent_and_apply_effects(op, |e| e).await?;
                    anyhow::Ok(())
                };

                // One writer.
                let single = capture(write_text(fs_vc, "single.txt".into(), "single".into()));
                publish(single).await?;
                fs::write(dir.join("single.txt"), "SINGLE")?;
                publish(single).await?;
                let single_edited = fs::read_to_string(dir.join("single.txt"))?;
                fs::remove_file(dir.join("single.txt"))?;
                publish(single).await?;
                let single_removed = fs::read_to_string(dir.join("single.txt"))?;

                // Two writers of equal content.
                let first = capture(write_text(fs_vc, "shared.txt".into(), "shared".into()));
                publish(first).await?;
                let second = capture(write_content_at(
                    fs_vc,
                    "shared.txt".into(),
                    Some("shared".into()),
                    1,
                ));
                publish(second).await?;
                fs::write(dir.join("shared.txt"), "SHARED")?;
                publish(second).await?;
                let shared_edited = fs::read_to_string(dir.join("shared.txt"))?;
                fs::remove_file(dir.join("shared.txt"))?;
                publish(second).await?;
                let shared_removed = fs::read_to_string(dir.join("shared.txt"))?;
                anyhow::Ok([single_edited, single_removed, shared_edited, shared_removed])
            }
        })
        .await;
    tt.stop_and_wait().await;
    assert_eq!(result?, ["single", "single", "shared", "shared"]);
    Ok(())
}

/// Publishing unchanged outputs again doesn't rewrite them, whether one task or several write
/// them.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn unchanged_outputs_are_not_rewritten() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let Run { tt, _dir, root, .. } = run()?;
    let dir = std::path::PathBuf::from(root.as_str());
    let identity = move |name: &str| -> Result<(std::time::SystemTime, u64)> {
        let metadata = fs::metadata(dir.join(name))?;
        #[cfg(unix)]
        let id = std::os::unix::fs::MetadataExt::ino(&metadata);
        #[cfg(not(unix))]
        let id = metadata.len();
        Ok((metadata.modified()?, id))
    };
    let result = tt
        .run_once({
            let identity = identity.clone();
            async move {
                let fs_vc = disk(root).resolve().strongly_consistent().await?;
                let publish = |op: OperationVc<Effects>| async move {
                    read_strongly_consistent_and_apply_effects(op, |e| e).await?;
                    anyhow::Ok(())
                };
                let single = capture(write_text(fs_vc, "single.txt".into(), "single".into()));
                publish(single).await?;
                let shared = capture(write_text(fs_vc, "shared.txt".into(), "shared".into()));
                publish(shared).await?;
                let other = capture(write_content_at(
                    fs_vc,
                    "shared.txt".into(),
                    Some("shared".into()),
                    1,
                ));
                publish(other).await?;
                let before = (identity("single.txt")?, identity("shared.txt")?);
                for _ in 0..3 {
                    publish(single).await?;
                    publish(other).await?;
                }
                anyhow::Ok((before, (identity("single.txt")?, identity("shared.txt")?)))
            }
        })
        .await;
    tt.stop_and_wait().await;
    let (before, after) = result?;
    assert_eq!(before, after, "an unchanged output was rewritten");
    Ok(())
}

/// Another writer restages the path after a publication captured its staged file and before it
/// installs it. Publication doesn't install the other content: it publishes from the persisted
/// content instead.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn restaged_file_is_published_from_persisted_content() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let Run {
        tt,
        _dir,
        out,
        root,
        ..
    } = run()?;
    let armed = Arc::new(AtomicBool::new(false));
    let result = tt
        .run_once({
            let out = out.clone();
            let armed = armed.clone();
            async move {
                let fs_vc = disk(root).resolve().strongly_consistent().await?;
                let a = capture(write_text(fs_vc, "out.txt".into(), "a".into()));
                a.read_strongly_consistent().await?;
                let b = capture(write_text(fs_vc, "out.txt".into(), "b".into()));
                armed.store(true, Ordering::SeqCst);
                publication_test_hooks::set(Some(Arc::new(move |point| {
                    let restage = point == publication_test_hooks::Point::Claimed
                        && armed.swap(false, Ordering::SeqCst);
                    async move {
                        if restage {
                            // B's write task stages its file in the slot A captured.
                            b.read_strongly_consistent().await.unwrap();
                        }
                    }
                    .boxed()
                })));
                let published = read_strongly_consistent_and_apply_effects(a, |e| e).await;
                publication_test_hooks::set(None);
                published?;
                anyhow::Ok(fs::read_to_string(&out)?)
            }
        })
        .await;
    publication_test_hooks::set(None);
    tt.stop_and_wait().await;
    assert_eq!(result?, "a");
    Ok(())
}
