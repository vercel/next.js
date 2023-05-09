//! Tests for the `#[derive(TaskInput)]` macro are in `turbo_tasks` itself.
//! However, we keep one test here as an integration test between the derive
//! macro and the `#[turbo_tasks::function]` macro.

use anyhow::Result;
use turbo_tasks::{CompletionVc, TaskInput};
use turbo_tasks_testing::{register, run};

register!();

#[derive(Clone, TaskInput)]
struct OneUnnamedField(u32);

#[turbo_tasks::function]
async fn one_unnamed_field(input: OneUnnamedField) -> CompletionVc {
    assert_eq!(input.0, 42);
    CompletionVc::immutable()
}

#[tokio::test]
async fn tests() {
    run! {
        one_unnamed_field(OneUnnamedField(42)).await?;
    }
}
