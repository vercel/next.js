//! Tests for the `#[derive(TaskInput)]` macro are in `turbo_tasks` itself.
//! However, we keep one test here as an integration test between the derive
//! macro and the `#[turbo_tasks::function]` macro.
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use serde::{Deserialize, Serialize};
use turbo_tasks::{Completion, ReadRef, TaskInput, Vc, trace::TraceRawVcs};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[derive(Clone, TaskInput, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TraceRawVcs)]
struct OneUnnamedField(u32);

#[turbo_tasks::function]
fn one_unnamed_field(input: OneUnnamedField) -> Vc<Completion> {
    assert_eq!(input.0, 42);
    Completion::immutable()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn tests() {
    run_once(&REGISTRATION, || async {
        assert!(ReadRef::ptr_eq(
            &one_unnamed_field(OneUnnamedField(42)).await?,
            &Completion::immutable().await?,
        ));
        anyhow::Ok(())
    })
    .await
    .unwrap()
}
