#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::{test_helpers::current_task_for_testing, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn test_local_task_id() -> Result<()> {
    run(&REGISTRATION, || async {
        let local_vc = get_local_task_id();
        assert!(local_vc.is_local());
        assert_eq!(*local_vc.await.unwrap(), *current_task_for_testing());

        let non_local_vc = get_non_local_task_id();
        assert!(!non_local_vc.is_local());
        assert_ne!(*non_local_vc.await.unwrap(), *current_task_for_testing());
        Ok(())
    })
    .await
}

#[turbo_tasks::function(local)]
fn get_local_task_id() -> Vc<u32> {
    Vc::cell(*current_task_for_testing())
}

#[turbo_tasks::function]
fn get_non_local_task_id() -> Vc<u32> {
    Vc::cell(*current_task_for_testing())
}
