#![feature(arbitrary_self_types)]

use tokio::{
    sync::{watch, Notify},
    time::{timeout, Duration},
};
use turbo_tasks::{turbo_tasks, Completion, TransientInstance, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn test_spawns_detached() -> anyhow::Result<()> {
    run(&REGISTRATION, || async {
        let notify = TransientInstance::new(Notify::new());
        let (tx, mut rx) = watch::channel(None);

        // create the task
        let out_vc = spawns_detached(notify.clone(), TransientInstance::new(tx));

        // see that the task does not exit yet
        timeout(Duration::from_millis(100), out_vc.strongly_consistent())
            .await
            .expect_err("should wait on the detached task");

        // let the detached future exit
        notify.notify_waiters();

        // it should send us back a cell
        let detached_vc: Vc<u32> = rx.wait_for(|opt| opt.is_some()).await.unwrap().unwrap();
        assert_eq!(*detached_vc.await.unwrap(), 42);

        // the parent task should now be able to exit
        out_vc.strongly_consistent().await.unwrap();

        Ok(())
    })
    .await
}

#[turbo_tasks::function]
fn spawns_detached(
    notify: TransientInstance<Notify>,
    sender: TransientInstance<watch::Sender<Option<Vc<u32>>>>,
) -> Vc<Completion> {
    tokio::spawn(turbo_tasks().detached_for_testing(Box::pin(async move {
        notify.notified().await;
        // creating cells after the normal lifetime of the task should be okay, as the parent task
        // is waiting on us before exiting!
        sender.send(Some(Vc::cell(42))).unwrap();
        Ok(())
    })));
    Completion::new()
}
