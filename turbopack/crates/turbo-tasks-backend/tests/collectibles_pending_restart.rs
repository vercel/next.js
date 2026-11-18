#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Collectible changes that are delayed while a task is dirty (its `pending_collectibles`) must
//! survive a restart: they are persisted with the task and sent to the uppers once the task is
//! clean in a later session, neither lost nor applied twice.
//!
//! The changes are delayed in an aggregating task with a dirty child. The child can't finish in
//! the session that delays the changes, so it is still dirty when that session shuts down and the
//! pending changes are part of the snapshot written on shutdown.

mod util;

use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    CollectiblesSource, ResolvedVc, State, TaskId, ValueToString, Vc, emit, run_once,
};

use crate::util::{create_tt, reopen_tt_with_gc};

/// Children of [`middle`] that don't emit anything. They give [`middle`] enough children to make
/// it an aggregating node, which is where the changes of its children are delayed.
const FILLERS: u32 = 256;

/// While set, the emitter of `b` never finishes.
static BLOCK_B: AtomicBool = AtomicBool::new(false);

#[turbo_tasks::value(transparent)]
struct Input(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_input(name: RcStr) -> Vc<Input> {
    let _ = name;
    Input(State::new(0)).cell()
}

#[turbo_tasks::value]
struct Thing(RcStr);

#[turbo_tasks::value_impl]
impl ValueToString for Thing {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.0.clone())
    }
}

/// A separate task per name and value, so that a changed value is a different collectible rather
/// than a changed cell of the same collectible.
#[turbo_tasks::function]
fn thing(name: RcStr, value: u32) -> Vc<Thing> {
    Thing(format!("{name} {value}").into()).cell()
}

/// Emits `<name> <value of input>`.
#[turbo_tasks::function]
async fn emitter(name: RcStr, input: ResolvedVc<Input>) -> Result<Vc<()>> {
    let value = *input.await?.get();
    if name == "b" && BLOCK_B.load(Ordering::SeqCst) {
        // Keeps the emitter of `b` dirty until the session ends.
        std::future::pending::<()>().await;
    }
    emit(ResolvedVc::upcast::<Box<dyn ValueToString>>(
        thing(name, value).to_resolved().await?,
    ));
    Ok(Vc::cell(()))
}

#[turbo_tasks::function]
fn filler(index: u32) -> Vc<u32> {
    Vc::cell(index)
}

/// Returns the task id of the emitter of `b`.
#[turbo_tasks::function]
async fn middle(a: ResolvedVc<Input>, b: ResolvedVc<Input>) -> Result<Vc<u32>> {
    let a_emitter = emitter(rcstr("a"), *a);
    a_emitter.await?;
    let b_emitter = emitter(rcstr("b"), *b);
    b_emitter.await?;
    for index in 0..FILLERS {
        filler(index).await?;
    }
    Ok(Vc::cell(*task_id_of(b_emitter)))
}

#[turbo_tasks::value(transparent)]
struct TaskIds((u32, u32));

/// Returns the task ids of `middle` and of the emitter of `b`. Getting them from the calls in the
/// graph doesn't add any edges to the graph.
#[turbo_tasks::function(operation, root)]
async fn source(a: ResolvedVc<Input>, b: ResolvedVc<Input>) -> Result<Vc<TaskIds>> {
    let middle = middle(*a, *b);
    let b_emitter_id = *middle.await?;
    Ok(Vc::cell((*task_id_of(middle), b_emitter_id)))
}

#[turbo_tasks::value(transparent)]
struct Names(Vec<RcStr>);

/// The collectibles of [`source`], read after a strongly consistent read of it.
#[turbo_tasks::function(operation, root)]
async fn collect(a: ResolvedVc<Input>, b: ResolvedVc<Input>) -> Result<Vc<Names>> {
    let source = source(a, b);
    source.read_strongly_consistent().await?;
    let mut names = Vec::new();
    for collectible in source.peek_collectibles::<Box<dyn ValueToString>>() {
        names.push((*collectible.to_string().await?).clone());
    }
    names.sort();
    Ok(Vc::cell(names))
}

/// Another root that only reads the emitter of `a`, so `a` can be recomputed without reading the
/// tasks that contain it in [`source`].
#[turbo_tasks::function(operation, root)]
async fn only_a(a: ResolvedVc<Input>) -> Result<Vc<()>> {
    emitter(rcstr("a"), *a).await?;
    Ok(Vc::cell(()))
}

fn rcstr(s: &str) -> RcStr {
    s.into()
}

fn task_id_of<T>(vc: Vc<T>) -> TaskId {
    Vc::into_raw(vc)
        .try_get_task_id()
        .expect("a function call should be backed by a task")
}

async fn inputs() -> Result<(ResolvedVc<Input>, ResolvedVc<Input>)> {
    let a = create_input(rcstr("a"))
        .resolve()
        .strongly_consistent()
        .await?;
    let b = create_input(rcstr("b"))
        .resolve()
        .strongly_consistent()
        .await?;
    Ok((a, b))
}

async fn read_collected(a: ResolvedVc<Input>, b: ResolvedVc<Input>) -> Result<Vec<RcStr>> {
    Ok(collect(a, b).read_strongly_consistent().await?.to_vec())
}

fn names(names: &[&str]) -> Vec<RcStr> {
    names.iter().map(|&name| name.into()).collect()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn pending_collectibles_survive_a_restart() {
    let (tt, dir) = create_tt("pending_collectibles_survive_a_restart");

    // Session 1: build the graph.
    let (middle_id, b_emitter_id) = run_once(tt.clone(), async move {
        let (a, b) = inputs().await?;
        assert_eq!(read_collected(a, b).await?, names(&["a 0", "b 0"]));
        let (middle_id, b_emitter_id) = *source(a, b).read_strongly_consistent().await?;
        anyhow::Ok((
            TaskId::try_from(middle_id)?,
            TaskId::try_from(b_emitter_id)?,
        ))
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
    drop(tt);

    // Session 2: invalidate the emitter of `b`, which can't finish in this session, so it stays
    // dirty and `middle` has a dirty child. Then recompute the emitter of `a` through another root.
    // Its changes reach `middle` while `middle` has the dirty child, so `middle` delays them.
    BLOCK_B.store(true, Ordering::SeqCst);
    let tt = reopen_tt_with_gc(&dir);
    let tt2 = tt.clone();
    run_once(tt.clone(), async move {
        let (a, b) = inputs().await?;
        b.await?.set(1);
        a.await?.set(1);
        only_a(a).read_strongly_consistent().await?;
        assert_eq!(
            tt2.backend().is_dirty_for_testing(b_emitter_id, &tt2),
            Some(true),
            "the emitter of b must still be dirty"
        );
        // The read of `only_a` can finish before the changes have been applied to `middle`, its
        // other upper.
        let mut attempts = 0;
        while tt2
            .backend()
            .pending_collectibles_count_for_testing(middle_id, &tt2)
            .is_none_or(|pending| pending == 0)
        {
            attempts += 1;
            assert!(
                attempts < 500,
                "middle must have pending collectible changes before the restart"
            );
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        anyhow::Ok(())
    })
    .await
    .unwrap();
    // The shutdown snapshot persists the pending changes of `middle`.
    tokio::time::timeout(Duration::from_secs(30), tt.stop_and_wait())
        .await
        .expect("stop_and_wait hung on the blocked emitter of b");
    drop(tt);
    BLOCK_B.store(false, Ordering::SeqCst);

    // Session 3: the pending changes are restored from the snapshot.
    let tt = reopen_tt_with_gc(&dir);
    let tt2 = tt.clone();
    run_once(tt.clone(), async move {
        assert_eq!(
            tt2.backend().is_dirty_for_testing(b_emitter_id, &tt2),
            Some(true),
            "the emitter of b must be restored as dirty"
        );
        assert!(
            tt2.backend()
                .pending_collectibles_count_for_testing(middle_id, &tt2)
                .is_some_and(|pending| pending > 0),
            "the pending collectible changes of middle must be restored"
        );

        let (a, b) = inputs().await?;
        // Reading the source strongly consistently recomputes the emitter of `b`, which makes
        // `middle` clean and sends its pending changes. Losing them would keep `a 0`.
        assert_eq!(read_collected(a, b).await?, names(&["a 1", "b 1"]));
        assert_eq!(
            tt2.backend()
                .pending_collectibles_count_for_testing(middle_id, &tt2),
            Some(0),
            "middle must have sent its pending changes"
        );

        // Changing `a` again removes `a 1`. If the pending changes were applied twice, `a 1` would
        // still be counted once and stay visible.
        a.await?.set(2);
        assert_eq!(read_collected(a, b).await?, names(&["a 2", "b 1"]));
        anyhow::Ok(())
    })
    .await
    .unwrap();

    tt.stop_and_wait().await;
}
