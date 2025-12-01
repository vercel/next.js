use core::panic;
use std::{
    panic::{set_hook, take_hook},
    sync::{
        Arc, LazyLock,
        atomic::{AtomicBool, Ordering},
    },
};

use anyhow::Result;
use regex::Regex;
use turbo_tasks::{
    Vc,
    backend::TurboTasksExecutionError,
    panic_hooks::{handle_panic, register_panic_hook},
};
use turbo_tasks_testing::{Registration, register, run_once_without_cache_check};

static REGISTRATION: Registration = register!();

static FILE_PATH_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"panics\.rs:\d+:\d+$").unwrap());

// DO NOT ADD MORE TESTS TO THIS FILE!
//
// This test depends on the process-wide global panic handler. This test must be run in its own
// process in isolation of any other tests.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_panic_hook() {
    let prev_hook = take_hook();
    set_hook(Box::new(move |info| {
        handle_panic(info);
        prev_hook(info);
    }));

    let hook_was_called = Arc::new(AtomicBool::new(false));
    let _hook_guard = register_panic_hook({
        let hook_was_called = hook_was_called.clone();
        Box::new(move |_| hook_was_called.store(true, Ordering::SeqCst))
    });

    let result =
        run_once_without_cache_check(&REGISTRATION, async move { anyhow::Ok(*double(3).await?) })
            .await;

    assert!(hook_was_called.load(Ordering::SeqCst));

    let error = result.unwrap_err();
    let root_cause = error.root_cause();

    let Some(panic) = root_cause.downcast_ref::<TurboTasksExecutionError>() else {
        panic!("Expected a TurboTasksExecutionError");
    };

    let TurboTasksExecutionError::Panic(panic) = panic else {
        panic!("Expected a TurboTasksExecutionError::Panic");
    };

    assert!(
        FILE_PATH_REGEX.is_match(panic.location.as_ref().unwrap()),
        "Panic location '{}' should be a line in panics.rs",
        panic.location.as_ref().unwrap()
    );
}

#[turbo_tasks::function]
fn double(_val: u64) -> Result<Vc<u64>> {
    panic!("oh no");
}
