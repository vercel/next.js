#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{NonLocalValue, ResolvedVc, TaskInput, Vc, trace::TraceRawVcs};
use turbo_tasks_testing::{Registration, register, run_once_without_cache_check};

static REGISTRATION: Registration = register!();

const EXPECTED_TRACE: &str = "\
Adder::add_method (read cell of type turbo-tasks@turbo_tasks::primitives::u64)
  self:
    Adder::new (read cell of type turbo-tasks-backend@trace_transient::Adder)
      args:
        unknown transient task (read cell of type turbo-tasks@turbo_tasks::primitives::())
  args:
    unknown transient task (read cell of type turbo-tasks@turbo_tasks::primitives::u16)
    unknown transient task (read cell of type turbo-tasks@turbo_tasks::primitives::u32)";

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_trace_transient() {
    let result = run_once_without_cache_check(&REGISTRATION, async {
        read_incorrect_task_input_operation(IncorrectTaskInput(
            Adder::new(Vc::cell(()))
                .add_method(Vc::cell(2), Vc::cell(3))
                .to_resolved()
                .await?,
        ))
        .read_strongly_consistent()
        .await?;
        anyhow::Ok(())
    })
    .await;

    let message = format!("{:#}", result.unwrap_err());
    assert!(message.contains(&EXPECTED_TRACE.to_string()));
}

#[turbo_tasks::value]
struct Adder;

#[turbo_tasks::value_impl]
impl Adder {
    #[turbo_tasks::function]
    fn new(arg: ResolvedVc<()>) -> Vc<Adder> {
        let _ = arg; // Make sure unused argument filtering doesn't remove the arg
        Adder.cell()
    }

    #[turbo_tasks::function]
    async fn add_method(&self, arg1: ResolvedVc<u16>, arg2: ResolvedVc<u32>) -> Result<Vc<u64>> {
        Ok(Vc::cell(u64::from(*arg1.await?) + u64::from(*arg2.await?)))
    }
}

#[turbo_tasks::function(operation)]
async fn read_incorrect_task_input_operation(value: IncorrectTaskInput) -> Result<Vc<u64>> {
    Ok(Vc::cell(*value.0.await?))
}

/// Has an intentionally incorrect `TaskInput` implementation, representing some code that the debug
/// tracing might be particularly useful with.
#[derive(
    Copy, Clone, Debug, PartialEq, Eq, Hash, TraceRawVcs, Serialize, Deserialize, NonLocalValue,
)]
struct IncorrectTaskInput(ResolvedVc<u64>);

impl TaskInput for IncorrectTaskInput {
    fn is_transient(&self) -> bool {
        false
    }
}
