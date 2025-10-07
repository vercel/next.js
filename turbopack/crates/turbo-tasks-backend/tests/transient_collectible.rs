#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use serde::{Deserialize, Serialize};
use turbo_tasks::{NonLocalValue, ResolvedVc, TaskInput, trace::TraceRawVcs};
use turbo_tasks_testing::{Registration, register, run_once_without_cache_check};

static REGISTRATION: Registration = register!();

const EXPECTED_MSG: &str =
    "Collectible is transient, transient collectibles cannot be emitted from persistent tasks";

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_transient_emit_from_persistent() {
    let result = run_once_without_cache_check(&REGISTRATION, async {
        emit_incorrect_task_input_operation(IncorrectTaskInput(U32Wrapper(123).resolved_cell()))
            .read_strongly_consistent()
            .await?;
        anyhow::Ok(())
    })
    .await;

    let message = format!("{:#}", result.unwrap_err());
    assert!(message.contains(&EXPECTED_MSG.to_string()));
}

#[turbo_tasks::function(operation)]
fn emit_incorrect_task_input_operation(value: IncorrectTaskInput) {
    turbo_tasks::emit(ResolvedVc::upcast::<Box<dyn Number>>(value.0));
}

/// Has an intentionally incorrect `TaskInput` implementation
#[derive(
    Copy, Clone, Debug, PartialEq, Eq, Hash, TraceRawVcs, Serialize, Deserialize, NonLocalValue,
)]
struct IncorrectTaskInput(ResolvedVc<U32Wrapper>);

impl TaskInput for IncorrectTaskInput {
    fn is_transient(&self) -> bool {
        false
    }
}

#[turbo_tasks::value_trait]
trait Number {}

#[turbo_tasks::value]
struct U32Wrapper(u32);

#[turbo_tasks::value_impl]
impl Number for U32Wrapper {}
