use core::panic;
use std::{
    panic::{set_hook, take_hook},
    sync::{Arc, LazyLock},
};

use anyhow::Result;
use regex::Regex;
use turbo_tasks::{Vc, backend::TurboTasksExecutionError, handle_panic};
use turbo_tasks_testing::{Registration, register, run_without_cache_check};

static REGISTRATION: Registration = register!();

static FILE_PATH_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"panics\.rs:\d+:\d+$").unwrap());

#[tokio::test]
async fn test_panics_include_location() {
    let prev_hook = take_hook();
    set_hook(Box::new(move |info| {
        handle_panic(info);
        prev_hook(info);
    }));

    let result =
        run_without_cache_check(&REGISTRATION, async move { anyhow::Ok(*double(3).await?) }).await;

    let error = result.unwrap_err();
    let root_cause = error.root_cause();

    let Some(panic) = root_cause.downcast_ref::<Arc<TurboTasksExecutionError>>() else {
        panic!("Expected a TurboTasksExecutionError");
    };

    let TurboTasksExecutionError::Panic(panic) = &**panic else {
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
