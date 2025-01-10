#![allow(clippy::needless_return)] // clippy bug causes false positive
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use tokio::{
    sync::{watch, Notify},
    time::{sleep, timeout, Duration},
};
use turbo_tasks::{turbo_tasks, State, TransientInstance, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn test_spawns_detached() -> anyhow::Result<()> {
    run(&REGISTRATION, || async {
        // timeout: prevent the test from hanging, and fail instead if this is broken
        timeout(Duration::from_secs(5), async {
            let notify = TransientInstance::new(Notify::new());
            let (tx, mut rx) = watch::channel(None);
            let tx = TransientInstance::new(tx);

            // create the task
            let out_vc = spawns_detached(notify.clone(), tx.clone());

            // see that the task does not exit yet
            timeout(Duration::from_millis(100), out_vc.strongly_consistent())
                .await
                .expect_err("should wait on the detached task");

            // let the detached future exit
            notify.notify_waiters();

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

#[turbo_tasks::function]
async fn spawns_detached(
    notify: TransientInstance<Notify>,
    sender: TransientInstance<watch::Sender<Option<Vc<u32>>>>,
) -> Vc<()> {
    tokio::spawn(turbo_tasks().detached_for_testing(Box::pin(async move {
        notify.notified().await;
        // creating cells after the normal lifetime of the task should be okay, as the parent task
        // is waiting on us before exiting!
        sender.send(Some(Vc::cell(42))).unwrap();
        Ok(())
    })));
    Vc::cell(())
}

#[tokio::test]
async fn test_spawns_detached_changing() -> anyhow::Result<()> {
    run(&REGISTRATION, || async {
        // timeout: prevent the test from hanging, and fail instead if this is broken
        timeout(Duration::from_secs(5), async {
            let (tx, mut rx) = watch::channel(None);
            let tx = TransientInstance::new(tx);

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
    sender: TransientInstance<watch::Sender<Option<Vc<u32>>>>,
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
