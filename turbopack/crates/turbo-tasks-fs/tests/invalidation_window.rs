#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Can an older plan overwrite a newer one while an input change is visible to one root but has
//! not reached another yet? Each test pauses one step of the change, publishes a cold root B that
//! writes the new value, then publishes a warm root A that captured the old one. Ignored tests
//! reproduced gaps that are now closed.

use std::{
    fs,
    io::Read,
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use anyhow::{Context, Result};
use tokio::sync::watch;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    Effects, OperationVc, ResolvedVc, State, TurboTasks, Vc, publication_test_hooks,
    read_strongly_consistent_and_apply_effects, take_effects,
};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_fs::{DiskFileSystem, File, FileContent, FileSystem};

/// The sync hook is process-global.
static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Copies `source.txt` to `out.txt`. `tag` only makes distinct roots.
#[turbo_tasks::function(operation, root)]
async fn copy_file(fs: ResolvedVc<DiskFileSystem>, tag: u8) -> Result<Vc<()>> {
    let _ = tag;
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

#[turbo_tasks::value]
struct Input {
    state: State<u32>,
}

#[turbo_tasks::function(operation, root)]
fn input() -> Vc<Input> {
    Input {
        state: State::new(1),
    }
    .cell()
}

/// Writes `edit N` for the state's value to `out.txt`, reading the state directly. `tag` only
/// makes distinct roots, each with its own dependency on the state.
#[turbo_tasks::function(operation, root)]
async fn copy_state(
    fs: ResolvedVc<DiskFileSystem>,
    input: ResolvedVc<Input>,
    tag: u8,
) -> Result<Vc<()>> {
    let _ = tag;
    let value = *input.await?.state.get();
    let root = FileSystem::root(*fs).await?;
    root.join("out.txt")?
        .write(FileContent::Content(File::from(format!("edit {value}"))).cell())
        .await?;
    Ok(Vc::cell(()))
}

#[turbo_tasks::function(operation, root)]
async fn capture(operation: OperationVc<()>) -> Result<Vc<Effects>> {
    operation.connect().await?;
    Ok(take_effects(operation).await?.cell())
}

#[turbo_tasks::function(operation, root)]
fn disk(root: RcStr) -> Vc<DiskFileSystem> {
    DiskFileSystem::new("window".into(), Vc::cell(root))
}

/// Installed pauses; one global hook dispatches to them.
static PAUSES: Mutex<Vec<std::sync::Weak<SyncPause>>> = Mutex::new(Vec::new());

/// Blocks the thread that next reaches `point` until released.
struct SyncPause {
    point: publication_test_hooks::SyncPoint,
    armed: AtomicBool,
    reached: watch::Sender<bool>,
    released: Mutex<bool>,
    wake: Condvar,
}

impl SyncPause {
    fn install(point: publication_test_hooks::SyncPoint) -> Arc<Self> {
        let pause = Arc::new(Self {
            point,
            armed: AtomicBool::new(true),
            reached: watch::channel(false).0,
            released: Mutex::new(false),
            wake: Condvar::new(),
        });
        PAUSES.lock().unwrap().push(Arc::downgrade(&pause));
        publication_test_hooks::set_sync(Some(Arc::new(|reached| {
            let pause = PAUSES.lock().unwrap().iter().find_map(|p| {
                let p = p.upgrade()?;
                (p.point == reached && p.armed.swap(false, Ordering::SeqCst)).then_some(p)
            });
            let Some(pause) = pause else { return };
            pause.reached.send_replace(true);
            let released = pause.released.lock().unwrap();
            let _released = pause
                .wake
                .wait_timeout_while(released, Duration::from_secs(30), |released| !*released)
                .unwrap();
        })));
        pause
    }

    async fn reached(&self) -> Result<()> {
        tokio::time::timeout(
            Duration::from_secs(5),
            self.reached.subscribe().wait_for(|r| *r),
        )
        .await
        .context("the change never reached the pause point")??;
        Ok(())
    }

    fn release(&self) {
        *self.released.lock().unwrap() = true;
        self.wake.notify_all();
    }
}

impl Drop for SyncPause {
    fn drop(&mut self) {
        self.release();
        let mut pauses = PAUSES.lock().unwrap();
        pauses.retain(|p| p.strong_count() > 0);
        if pauses.is_empty() {
            publication_test_hooks::set_sync(None);
        }
    }
}

fn tt() -> Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            num_workers: Some(4),
            small_preallocation: true,
            ..Default::default()
        },
        noop_backing_storage(),
    ))
}

async fn publish(op: OperationVc<Effects>) -> Result<()> {
    tokio::time::timeout(
        Duration::from_secs(5),
        read_strongly_consistent_and_apply_effects(op, |e| e),
    )
    .await
    .context("publication did not finish")??;
    Ok(())
}

/// Runs `publications` one after another, in order, while pauses hold a change in progress, and
/// `release`s them after a while. Records, in order, when each publication returned and what
/// `out` held then.
async fn race(
    out: &std::path::Path,
    publications: Vec<(&'static str, OperationVc<Effects>)>,
    release: impl FnOnce(),
) -> Result<Vec<String>> {
    let events = Mutex::new(Vec::new());
    let read = || fs::read_to_string(out).unwrap_or_default();
    let publish_all = async {
        for (name, op) in publications {
            let result = publish(op).await;
            events.lock().unwrap().push(format!(
                "{name} returned {} with {}",
                if result.is_ok() { "ok" } else { "err" },
                read()
            ));
            result.context(name)?;
        }
        anyhow::Ok(())
    };
    let releaser = async {
        // Give the publications every chance to finish while the change is held.
        tokio::time::sleep(Duration::from_millis(300)).await;
        events
            .lock()
            .unwrap()
            .push(format!("released with {}", read()));
        release();
    };
    let (result, ()) = futures::future::join(publish_all, releaser).await;
    result?;
    Ok(events.into_inner().unwrap())
}

/// Fails if `out` went back to edit 1 after a publication had returned with edit 2, or doesn't
/// end with edit 2.
fn assert_newest_wins(events: &[String], final_bytes: &str) {
    let newer = events
        .iter()
        .position(|e| e.contains(" returned ok with edit 2"));
    if let Some(newer) = newer {
        assert!(
            !events[newer..].iter().any(|e| e.ends_with("with edit 1")),
            "an older plan overwrote a newer one: {events:#?}"
        );
    }
    assert_eq!(final_bytes, "edit 2", "{events:#?}");
}

/// A and B read `source.txt` through the same cached read task. The edit's invalidation has marked
/// that task dirty but has not propagated to the roots yet.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn shared_read_while_invalidation_propagates() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let tt = tt();
    let dir = tempfile::tempdir()?;
    let path = fs::canonicalize(dir.path())?;
    let source = path.join("source.txt");
    let out = path.join("out.txt");
    fs::write(&source, "edit 1")?;
    let root: RcStr = path.to_str().context("Non-UTF8 path")?.into();
    let result = tt
        .run_once({
            let out = out.clone();
            async move {
                let fs_op = disk(root);
                let fs_vc = fs_op.resolve().strongly_consistent().await?;
                let owned = fs_op.read_strongly_consistent().await?;
                let a = capture(copy_file(fs_vc, 0));
                // Warm A without publishing it, so its plan writes edit 1 with content.
                a.read_strongly_consistent().await?;

                fs::write(&source, "edit 2")?;
                let pause =
                    SyncPause::install(publication_test_hooks::SyncPoint::InvalidationDirtied);
                let invalidation = turbo_tasks::spawn_blocking(move || owned.invalidate());
                pause.reached().await?;
                let events = race(
                    &out,
                    vec![("B", capture(copy_file(fs_vc, 1))), ("A", a)],
                    || pause.release(),
                )
                .await;
                invalidation.await;
                anyhow::Ok((events?, fs::read_to_string(&out)?))
            }
        })
        .await;
    tt.stop_and_wait().await;
    let (events, final_bytes) = result?;
    println!("shared read: {events:#?}");
    assert_newest_wins(&events, &final_bytes);
    assert!(
        events[0].starts_with("released"),
        "a publication didn't wait for the invalidation to propagate: {events:#?}"
    );
    Ok(())
}

/// A and B each read a `State` directly. While the mutation is still notifying its readers, B
/// must not publish the new value as current, and A must not overwrite it afterwards.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn direct_state_reads_before_notification() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let tt = tt();
    let dir = tempfile::tempdir()?;
    let path = fs::canonicalize(dir.path())?;
    let out = path.join("out.txt");
    let root: RcStr = path.to_str().context("Non-UTF8 path")?.into();
    let result = tt
        .run_once({
            let out = out.clone();
            async move {
                let fs_vc = disk(root).resolve().strongly_consistent().await?;
                let input_op = input();
                let input_vc = input_op.resolve().strongly_consistent().await?;
                let input_value = input_op.read_strongly_consistent().await?;
                let a = capture(copy_state(fs_vc, input_vc, 0));
                a.read_strongly_consistent().await?;

                let pause =
                    SyncPause::install(publication_test_hooks::SyncPoint::StateMutationVisible);
                let set = turbo_tasks::spawn_blocking(move || input_value.state.set(2));
                pause.reached().await?;
                let events = race(
                    &out,
                    vec![("B", capture(copy_state(fs_vc, input_vc, 1))), ("A", a)],
                    || pause.release(),
                )
                .await;
                set.await;
                anyhow::Ok((events?, fs::read_to_string(&out)?))
            }
        })
        .await;
    tt.stop_and_wait().await;
    let (events, final_bytes) = result?;
    println!("direct state: {events:#?}");
    assert_newest_wins(&events, &final_bytes);
    assert!(
        events[0].starts_with("released"),
        "a publication didn't wait for the mutation to notify its readers: {events:#?}"
    );
    Ok(())
}

/// A and B read `source.txt` through the same cached read task. The edit's invalidation is held
/// after marking the read task dirty, and the read task's own cell change is held once its new
/// content is readable.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn shared_read_after_cell_change_is_exposed() -> Result<()> {
    use publication_test_hooks::SyncPoint;

    let _serial = SERIAL.lock().await;
    let tt = tt();
    let dir = tempfile::tempdir()?;
    let path = fs::canonicalize(dir.path())?;
    let source = path.join("source.txt");
    let out = path.join("out.txt");
    fs::write(&source, "edit 1")?;
    let root: RcStr = path.to_str().context("Non-UTF8 path")?.into();
    let result = tt
        .run_once({
            let out = out.clone();
            async move {
                let fs_op = disk(root);
                let fs_vc = fs_op.resolve().strongly_consistent().await?;
                let owned = fs_op.read_strongly_consistent().await?;
                let a = capture(copy_file(fs_vc, 0));
                a.read_strongly_consistent().await?;

                fs::write(&source, "edit 2")?;
                let invalidated = SyncPause::install(SyncPoint::InvalidationDirtied);
                let invalidation = turbo_tasks::spawn_blocking(move || owned.invalidate());
                invalidated.reached().await?;
                let exposed = SyncPause::install(SyncPoint::CellChangeExposed);
                let events = race(
                    &out,
                    vec![("B", capture(copy_file(fs_vc, 1))), ("A", a)],
                    || {
                        exposed.release();
                        invalidated.release();
                    },
                )
                .await;
                invalidation.await;
                anyhow::Ok((events?, fs::read_to_string(&out)?))
            }
        })
        .await;
    tt.stop_and_wait().await;
    let (events, final_bytes) = result?;
    println!("shared read, cell change held: {events:#?}");
    assert_newest_wins(&events, &final_bytes);
    Ok(())
}

#[turbo_tasks::value]
struct Handle {
    content: ResolvedVc<FileContent>,
}

/// A handle to the read task's content cell, taken ahead of time.
#[turbo_tasks::function(operation, root)]
async fn source_handle(fs: ResolvedVc<DiskFileSystem>) -> Result<Vc<Handle>> {
    let root = FileSystem::root(*fs).await?;
    let content = root.join("source.txt")?.read().to_resolved().await?;
    Ok(Handle { content }.cell())
}

/// Reads the source through the read task, which makes it recompute after an invalidation.
#[turbo_tasks::function(operation, root)]
async fn read_source(fs: ResolvedVc<DiskFileSystem>) -> Result<Vc<RcStr>> {
    let root = FileSystem::root(*fs).await?;
    let content = root.join("source.txt")?.read().await?;
    let mut text = String::new();
    content
        .as_content()
        .context("Missing source file")?
        .read()
        .read_to_string(&mut text)?;
    Ok(Vc::cell(text.into()))
}

/// Copies the content behind a handle to `out.txt`, reading the cell without calling the read
/// task.
#[turbo_tasks::function(operation, root)]
async fn copy_handle(fs: ResolvedVc<DiskFileSystem>, handle: ResolvedVc<Handle>) -> Result<Vc<()>> {
    let content = handle.await?.content.await?;
    let mut text = String::new();
    content
        .as_content()
        .context("Missing source file")?
        .read()
        .read_to_string(&mut text)?;
    let root = FileSystem::root(*fs).await?;
    root.join("out.txt")?
        .write(FileContent::Content(File::from(text)).cell())
        .await?;
    Ok(Vc::cell(()))
}

/// Like `shared_read_after_cell_change_is_exposed`, but B reads the read task's content cell
/// through a handle taken earlier instead of calling the read task, so B's root does not include
/// the read task. A separate read makes the read task recompute.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn handle_read_after_cell_change_is_exposed() -> Result<()> {
    use publication_test_hooks::SyncPoint;

    let _serial = SERIAL.lock().await;
    let tt = tt();
    let dir = tempfile::tempdir()?;
    let path = fs::canonicalize(dir.path())?;
    let source = path.join("source.txt");
    let out = path.join("out.txt");
    fs::write(&source, "edit 1")?;
    let root: RcStr = path.to_str().context("Non-UTF8 path")?.into();
    let result = tt
        .run_once({
            let out = out.clone();
            async move {
                let fs_op = disk(root);
                let fs_vc = fs_op.resolve().strongly_consistent().await?;
                let owned = fs_op.read_strongly_consistent().await?;
                let handle = source_handle(fs_vc).resolve().strongly_consistent().await?;
                let a = capture(copy_file(fs_vc, 0));
                a.read_strongly_consistent().await?;

                fs::write(&source, "edit 2")?;
                let invalidated = SyncPause::install(SyncPoint::InvalidationDirtied);
                let invalidation = turbo_tasks::spawn_blocking(move || owned.invalidate());
                invalidated.reached().await?;

                // Recompute the read task alongside, pausing once its new content is readable.
                let exposed = SyncPause::install(SyncPoint::CellChangeExposed);
                let trigger = read_source(fs_vc).read_strongly_consistent();
                let racing = async {
                    exposed.reached().await?;
                    race(
                        &out,
                        vec![("B", capture(copy_handle(fs_vc, handle))), ("A", a)],
                        || {
                            exposed.release();
                            invalidated.release();
                        },
                    )
                    .await
                };
                let (triggered, events) = futures::future::join(trigger, racing).await;
                invalidation.await;
                triggered?;
                anyhow::Ok((events?, fs::read_to_string(&out)?))
            }
        })
        .await;
    tt.stop_and_wait().await;
    let (events, final_bytes) = result?;
    println!("handle read: {events:#?}");
    assert_newest_wins(&events, &final_bytes);
    Ok(())
}

/// The invalidator of [`intermediate`], so a test can invalidate it explicitly.
static INTERMEDIATE: Mutex<Option<turbo_tasks::Invalidator>> = Mutex::new(None);

/// Reads the state, standing between A and the state.
#[turbo_tasks::function]
async fn intermediate(input: ResolvedVc<Input>) -> Result<Vc<u32>> {
    *INTERMEDIATE.lock().unwrap() = turbo_tasks::get_invalidator();
    Ok(Vc::cell(*input.await?.state.get()))
}

/// Writes `edit N` for the state's value, read through [`intermediate`].
#[turbo_tasks::function(operation, root)]
async fn copy_intermediate(
    fs: ResolvedVc<DiskFileSystem>,
    input: ResolvedVc<Input>,
) -> Result<Vc<()>> {
    let value = *intermediate(*input).await?;
    FileSystem::root(*fs)
        .await?
        .join("out.txt")?
        .write(FileContent::Content(File::from(format!("edit {value}"))).cell())
        .await?;
    Ok(Vc::cell(()))
}

/// A depends on the state through an intermediate task D. An unrelated invalidation of D is held
/// after marking D dirty, before that propagates to A's root. The state then changes: D is
/// already dirty, so the mutation has nothing left to propagate, and B, which reads the state
/// directly, can read the new value. A must not overwrite B's output while D's dirtiness is
/// still on its way to A's root.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn inherited_dirtiness_still_propagating() -> Result<()> {
    let _serial = SERIAL.lock().await;
    let tt = tt();
    let dir = tempfile::tempdir()?;
    let path = fs::canonicalize(dir.path())?;
    let out = path.join("out.txt");
    let root: RcStr = path.to_str().context("Non-UTF8 path")?.into();
    let result = tt
        .run_once({
            let out = out.clone();
            async move {
                let fs_vc = disk(root).resolve().strongly_consistent().await?;
                let input_op = input();
                let input_vc = input_op.resolve().strongly_consistent().await?;
                let input_value = input_op.read_strongly_consistent().await?;
                let a = capture(copy_intermediate(fs_vc, input_vc));
                a.read_strongly_consistent().await?;
                let d = INTERMEDIATE
                    .lock()
                    .unwrap()
                    .context("intermediate never executed")?;

                let pause =
                    SyncPause::install(publication_test_hooks::SyncPoint::InvalidationDirtied);
                let invalidation = turbo_tasks::spawn_blocking(move || {
                    d.invalidate(&*turbo_tasks::turbo_tasks());
                });
                pause.reached().await?;
                input_value.state.set(2);
                let events = race(
                    &out,
                    vec![("B", capture(copy_state(fs_vc, input_vc, 1))), ("A", a)],
                    || pause.release(),
                )
                .await;
                invalidation.await;
                anyhow::Ok((events?, fs::read_to_string(&out)?))
            }
        })
        .await;
    tt.stop_and_wait().await;
    let (events, final_bytes) = result?;
    println!("inherited dirtiness: {events:#?}");
    assert_newest_wins(&events, &final_bytes);
    Ok(())
}
