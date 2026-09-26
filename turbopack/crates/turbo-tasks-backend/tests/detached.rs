#![allow(clippy::needless_return)] // clippy bug causes false positive
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use tokio::{
    sync::{Notify, watch},
    time::{Duration, sleep, timeout},
};
use turbo_tasks::{State, TransientInstance, Vc, prevent_gc, turbo_tasks};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_spawns_detached() -> anyhow::Result<()> {
    run_once(&REGISTRATION, async || {
        println!("test_spawns_detached");
        // The watch channel can hold task values outside the task graph, so keep them alive for
        // the duration of this test.
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

struct NotifyTaskInput(Notify);

struct WatchSenderTaskInput<T>(watch::Sender<T>);

#[turbo_tasks::function(root)]
async fn spawns_detached(
    notify: TransientInstance<NotifyTaskInput>,
    sender: TransientInstance<WatchSenderTaskInput<Option<Vc<u32>>>>,
) -> Vc<()> {
    turbo_tasks().spawn_detached_for_testing(Box::pin(async move {
        println!("spawns_detached: waiting for notify");
        notify.0.notified().await;
        println!("spawns_detached: notified, sending value");
        // creating cells after the normal lifetime of the task should be okay, as the parent task
        // is waiting on us before exiting!
        sender.0.send(Some(Vc::cell(42))).unwrap();
    }));
    Vc::cell(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_spawns_detached_changing() -> anyhow::Result<()> {
    run_once(&REGISTRATION, async || {
        // The watch channel can hold task values outside the task graph, so keep them alive for
        // the duration of this test.
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

#[turbo_tasks::function(root)]
async fn spawns_detached_changing(
    sender: TransientInstance<WatchSenderTaskInput<Option<Vc<u32>>>>,
    changing_input_detached: Vc<ChangingInput>,
    changing_input_outer: Vc<ChangingInput>,
) -> Vc<u32> {
    let tt = turbo_tasks();
    tt.clone().spawn_detached_for_testing(Box::pin(async move {
        sleep(Duration::from_millis(100)).await;
        // nested spawn_detached_for_testing calls should work
        tt.clone().spawn_detached_for_testing(Box::pin(async move {
            sleep(Duration::from_millis(100)).await;
            // creating cells after the normal lifetime of the task should be okay, as the parent
            // task is waiting on us before exiting!
            sender
                .0
                .send(Some(Vc::cell(
                    *read_changing_input(changing_input_detached).await.unwrap(),
                )))
                .unwrap();
        }));
    }));
    Vc::cell(*read_changing_input(changing_input_outer).await.unwrap())
}

// spawns_detached should take a dependency on this function for each input
#[turbo_tasks::function]
async fn read_changing_input(changing_input: Vc<ChangingInput>) -> Vc<u32> {
    // when changing_input.set is called, it will trigger an invalidator for this task
    Vc::cell(*changing_input.await.unwrap().state.get())
}
