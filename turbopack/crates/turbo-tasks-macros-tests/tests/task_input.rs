//! Tests for the `#[derive(TaskInput)]` macro are in `turbo_tasks` itself.
//! However, we keep one test here as an integration test between the derive
//! macro and the `#[turbo_tasks::function]` macro.
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use serde::{Deserialize, Serialize};
use turbo_tasks::{Completion, ReadRef, TaskInput, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[derive(Clone, TaskInput, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
struct OneUnnamedField(u32);

#[turbo_tasks::function]
async fn one_unnamed_field(input: OneUnnamedField) -> Vc<Completion> {
    assert_eq!(input.0, 42);
    Completion::immutable()
}

#[tokio::test]
async fn tests() {
    run(&REGISTRATION, || async {
        assert!(ReadRef::ptr_eq(
            &one_unnamed_field(OneUnnamedField(42)).await?,
            &Completion::immutable().await?,
        ));
        anyhow::Ok(())
    })
    .await
    .unwrap()
}
