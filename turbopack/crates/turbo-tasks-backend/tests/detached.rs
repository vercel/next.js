#![allow(clippy::needless_return)] // clippy bug causes false positive
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use tokio::{
    sync::{Notify, watch},
    time::{Duration, sleep, timeout},
};
use turbo_tasks::{
    State, TransientInstance, Vc, prevent_gc,
    trace::{TraceRawVcs, TraceRawVcsContext},
    turbo_tasks,
};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_spawns_detached() -> anyhow::Result<()> {
    run_once(&REGISTRATION, || async {
        // HACK: The watch channel we use has an incorrect implementation of `TraceRawVcs`, just
        // disable GC for the test so this can't cause any problems.
        prevent_gc();
        // timeout: prevent the test from hanging, and fail instead if this is broken
        timeout(Duration::from_secs(5), async {
            let notify = TransientInstance::new(NotifyTaskInput(Notify::new()));
            let (tx, mut rx) = watch::channel(None);
            let tx = TransientInstance::new(WatchSenderTaskInput(tx));

            // create the task
            let out_vc = spawns_detached(notify.clone(), tx.clone());

            // see that the task does not exit yet
            timeout(Duration::from_millis(100), out_vc.strongly_consistent())
                .await
                .expect_err("should wait on the detached task");

            // let the detached future exit
            notify.0.notify_waiters();

            // it should send us back a cell
            let detached_vc: Vc<u32> = rx.wait_for(|opt| opt.is_some()).await?.unwrap();
            assert_eq!(*detached_vc.strongly_consistent().await?, 42);

            // the parent task should now be able to exit
            out_vc.strongly_consistent().await?;

            Ok(())
        })
        .await?
    })
    .await
}

#[derive(TraceRawVcs)]
struct NotifyTaskInput(
    // trace_ignore: `notify` doesn't store any data
    #[turbo_tasks(trace_ignore)] Notify,
);

struct WatchSenderTaskInput<T>(watch::Sender<T>);

impl<T: TraceRawVcs> TraceRawVcs for WatchSenderTaskInput<T> {
    fn trace_raw_vcs(&self, _trace_context: &mut TraceRawVcsContext) {
        // HACK: This implementation is wrong (the channel contains a `Vc`), but we can't access it.
        // Instead we just `prevent_gc` in the tests.
    }
}

#[turbo_tasks::function]
async fn spawns_detached(
    notify: TransientInstance<NotifyTaskInput>,
    sender: TransientInstance<WatchSenderTaskInput<Option<Vc<u32>>>>,
) -> Vc<()> {
    tokio::spawn(turbo_tasks().detached_for_testing(Box::pin(async move {
        notify.0.notified().await;
        // creating cells after the normal lifetime of the task should be okay, as the parent task
        // is waiting on us before exiting!
        sender.0.send(Some(Vc::cell(42))).unwrap();
        Ok(())
    })));
    Vc::cell(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_spawns_detached_changing() -> anyhow::Result<()> {
    run_once(&REGISTRATION, || async {
        // HACK: The watch channel we use has an incorrect implementation of `TraceRawVcs`
        prevent_gc();
        // timeout: prevent the test from hanging, and fail instead if this is broken
        timeout(Duration::from_secs(5), async {
            let (tx, mut rx) = watch::channel(None);
            let tx = TransientInstance::new(WatchSenderTaskInput(tx));

            // state that's read by the detached future
            let changing_input_detached = ChangingInput {
                state: State::new(42),
            }
            .cell();

            // state that's read by the outer task
            let changing_input_outer = ChangingInput {
                state: State::new(0),
            }
            .cell();

            // create the task
            let out_vc =
                spawns_detached_changing(tx.clone(), changing_input_detached, changing_input_outer);

            // it should send us back a cell
            let detached_vc: Vc<u32> = rx.wait_for(|opt| opt.is_some()).await.unwrap().unwrap();
            assert_eq!(*detached_vc.strongly_consistent().await.unwrap(), 42);

            // the parent task should now be able to exit
            out_vc.strongly_consistent().await.unwrap();

            // changing either input should invalidate the vc and cause it to run again
            changing_input_detached.await.unwrap().state.set(43);
            out_vc.strongly_consistent().await.unwrap();
            assert_eq!(*detached_vc.strongly_consistent().await.unwrap(), 43);

            changing_input_outer.await.unwrap().state.set(44);
            assert_eq!(*out_vc.strongly_consistent().await.unwrap(), 44);

            Ok(())
        })
        .await?
    })
    .await
}

#[turbo_tasks::value]
struct ChangingInput {
    state: State<u32>,
}

#[turbo_tasks::function]
async fn spawns_detached_changing(
    sender: TransientInstance<WatchSenderTaskInput<Option<Vc<u32>>>>,
    changing_input_detached: Vc<ChangingInput>,
    changing_input_outer: Vc<ChangingInput>,
) -> Vc<u32> {
    let tt = turbo_tasks();
    tokio::spawn(tt.clone().detached_for_testing(Box::pin(async move {
        sleep(Duration::from_millis(100)).await;
        // nested detached_for_testing calls should work
        tokio::spawn(tt.clone().detached_for_testing(Box::pin(async move {
            sleep(Duration::from_millis(100)).await;
            // creating cells after the normal lifetime of the task should be okay, as the parent
            // task is waiting on us before exiting!
            sender
                .0
                .send(Some(Vc::cell(
                    *read_changing_input(changing_input_detached).await.unwrap(),
                )))
                .unwrap();
            Ok(())
        })));
        Ok(())
    })));
    Vc::cell(*read_changing_input(changing_input_outer).await.unwrap())
}

// spawns_detached should take a dependency on this function for each input
#[turbo_tasks::function]
async fn read_changing_input(changing_input: Vc<ChangingInput>) -> Vc<u32> {
    // when changing_input.set is called, it will trigger an invalidator for this task
    Vc::cell(*changing_input.await.unwrap().state.get())
}
