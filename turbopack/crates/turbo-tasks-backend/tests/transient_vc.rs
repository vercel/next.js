#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use anyhow::Result;
use turbo_tasks::{TaskInput, TransientValue, Vc};
use turbo_tasks_testing::{Registration, register, run_without_cache_check};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_transient_vc() -> Result<()> {
    run_without_cache_check(&REGISTRATION, async {
        test_transient_operation(TransientValue::new(123))
            .read_strongly_consistent()
            .await?;
        Ok(())
    })
    .await
}

#[turbo_tasks::function(operation)]
async fn test_transient_operation(transient_arg: TransientValue<i32>) -> Result<()> {
    let called_with_transient = has_transient_arg(transient_arg);
    let called_with_persistent = has_persistent_arg(123);

    assert!(called_with_transient.is_transient());
    assert!(!called_with_persistent.is_transient());
    assert!(has_vc_arg(called_with_transient).is_transient());
    assert!(!has_vc_arg(called_with_persistent).is_transient());

    let called_with_transient_resolved = called_with_transient.to_resolved().await?;
    let called_with_persistent_resolved = called_with_persistent.to_resolved().await?;

    assert!(called_with_transient_resolved.is_transient());
    assert!(!called_with_persistent_resolved.is_transient());
    assert!(has_vc_arg(*called_with_transient_resolved).is_transient());
    assert!(!has_vc_arg(*called_with_persistent_resolved).is_transient());

    Ok(())
}

#[turbo_tasks::function]
fn has_transient_arg(arg: TransientValue<i32>) -> Vc<i32> {
    Vc::cell(*arg)
}

#[turbo_tasks::function]
fn has_persistent_arg(arg: i32) -> Vc<i32> {
    Vc::cell(arg)
}

#[turbo_tasks::function]
async fn has_vc_arg(arg: Vc<i32>) -> Result<Vc<i32>> {
    Ok(Vc::cell(*arg.await?))
}
