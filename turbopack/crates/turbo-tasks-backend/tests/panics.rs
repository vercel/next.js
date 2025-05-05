use core::panic;
use std::{
    panic::{set_hook, take_hook},
    sync::LazyLock,
};

use anyhow::Result;
use regex::Regex;
use turbo_tasks::{TurboTasksPanic, Vc, LAST_ERROR_LOCATION};
use turbo_tasks_testing::{register, run_without_cache_check, Registration};

static REGISTRATION: Registration = register!();

static FILE_PATH_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"panics\.rs:\d+:\d+$").unwrap());

#[tokio::test]
async fn test_panics_include_location() {
    let prev_hook = take_hook();

    set_hook(Box::new(|info| {
        LAST_ERROR_LOCATION.with_borrow_mut(|loc| {
            *loc = info.location().map(|l| l.to_string());
        });
    }));

    let result =
        run_without_cache_check(&REGISTRATION, async move { anyhow::Ok(*double(3).await?) }).await;

    // Remove the panic hook and restore the previous one
    let _ = take_hook();
    set_hook(prev_hook);

    let error = result.unwrap_err();
    let root_cause = error.root_cause();

    if let Some(panic) = root_cause.downcast_ref::<TurboTasksPanic>() {
        assert!(
            FILE_PATH_REGEX.is_match(panic.location.as_ref().unwrap()),
            "Panic location '{}' should be a line in panics.rs",
            panic.location.as_ref().unwrap()
        );
    } else {
        panic!("Expected a TurboTasksExecutionError");
    }
}

#[turbo_tasks::function]
fn double(_val: u64) -> Result<Vc<u64>> {
    panic!("oh no");
}
