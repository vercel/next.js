#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::atomic::{AtomicU64, Ordering};

use anyhow::Result;
use turbo_tasks::{ResolvedVc, State, Vc};
use turbo_tasks_testing::{Registration, register, run, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn recompute() {
    run_once(&REGISTRATION, async || {
        let input = ChangingInput {
            state: State::new(1),
        }
        .resolved_cell();
        let input2 = ChangingInput {
            state: State::new(10),
        }
        .resolved_cell();
        let output = compute(input, input2);
        let read = output.read_strongly_consistent().await?;
        assert_eq!(read.state_value, 1);
        assert_eq!(read.state_value2, 10);
        let random_value = read.random_value;

        println!("changing input");
        input.await?.state.set(2);
        let read = output.read_strongly_consistent().await?;
        assert_eq!(read.state_value, 2);
        assert_ne!(read.random_value, random_value);
        let random_value = read.random_value;

        println!("changing input2");
        input2.await?.state.set(20);
        let read = output.read_strongly_consistent().await?;
        assert_eq!(read.state_value2, 20);
        assert_ne!(read.random_value, random_value);
        let random_value = read.random_value;

        println!("changing input");
        input.await?.state.set(5);
        let read = output.read_strongly_consistent().await?;
        assert_eq!(read.state_value, 5);
        assert_eq!(read.state_value2, 42);
        assert_ne!(read.random_value, random_value);
        let random_value = read.random_value;

        println!("changing input2");
        input2.await?.state.set(30);
        let read = output.read_strongly_consistent().await?;
        assert_eq!(read.random_value, random_value);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn immutable_analysis() {
    run_once(&REGISTRATION, async || {
        let input = ChangingInput {
            state: State::new(1),
        }
        .resolved_cell();

        // Verify

        let vc_holder = VcHolder { vc: input }.resolved_cell();
        let read = vc_holder.compute().strongly_consistent().await?;
        assert_eq!(read.state_value, 1);
        assert_eq!(read.state_value2, 1);
        let random_value = read.random_value;

        println!("changing input1");
        input.await?.state.set(30);
        let read = vc_holder.compute().strongly_consistent().await?;
        assert_eq!(read.state_value, 30);
        assert_eq!(read.state_value2, 42);
        assert_ne!(read.random_value, random_value);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value]
struct ChangingInput {
    state: State<u32>,
}

#[turbo_tasks::value]
struct VcHolder {
    vc: ResolvedVc<ChangingInput>,
}

#[turbo_tasks::value_impl]
impl VcHolder {
    #[turbo_tasks::function(root)]
    fn compute(&self) -> Vc<Output> {
        compute(self.vc, self.vc).connect()
    }
}

#[turbo_tasks::value]
struct Output {
    state_value: u32,
    state_value2: u32,
    random_value: u32,
}

#[turbo_tasks::function(operation, root)]
async fn compute(
    input: ResolvedVc<ChangingInput>,
    input2: ResolvedVc<ChangingInput>,
) -> Result<Vc<Output>> {
    let state_value = *input.await?.state.get();
    let state_value2 = if state_value < 5 {
        *compute2(*input2).await?
    } else {
        42
    };
    let random_value = rand::random();

    Ok(Output {
        state_value,
        state_value2,
        random_value,
    }
    .cell())
}

#[turbo_tasks::function]
async fn compute2(input: Vc<ChangingInput>) -> Result<Vc<u32>> {
    let state_value = *input.await?.state.get();
    Ok(Vc::cell(state_value))
}

// ============================================================================
// recompute_dependency test - verifies dependent tasks re-execute correctly
// ============================================================================

/// Tests that when a task's dependency changes, both the inner and outer
/// tasks re-execute correctly and return updated values.
/// This tests the basic dependency propagation through a simple two-task chain.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn recompute_dependency() {
    run(&REGISTRATION, async || {
        let input = get_dependency_input()
            .resolve()
            .strongly_consistent()
            .await?;
        // Reset state to 1 at the start of each iteration (important for multi-run tests)
        input.await?.state.set(1);

        // Initial execution - establishes dependency chain:
        // outer_compute -> inner_compute -> input.state
        let output = outer_compute(input);
        let read = output.read_strongly_consistent().await?;
        println!(
            "first read: value={}, inner_execution={}, outer_execution={}",
            read.value, read.inner_execution, read.outer_execution
        );
        assert_eq!(read.value, 1);
        let prev_inner_execution = read.inner_execution;
        let prev_outer_execution = read.outer_execution;

        // Change state - should invalidate inner_compute,
        // which should then invalidate outer_compute
        println!("changing input");
        input.await?.state.set(2);

        let read = output.read_strongly_consistent().await?;
        println!(
            "second read: value={}, inner_execution={}, outer_execution={}",
            read.value, read.inner_execution, read.outer_execution
        );

        // Value should be updated
        assert_eq!(read.value, 2);

        // Inner task should have re-executed. Execution ids are strictly increasing within the
        // process, and the persistent cache is cleared at the start of each test, so a value
        // that is not greater than the previous one can only come from a stale execution.
        assert!(
            read.inner_execution > prev_inner_execution,
            "inner_compute should have re-executed (execution id {} -> {})",
            prev_inner_execution,
            read.inner_execution
        );

        // CRITICAL: Outer task should ALSO have re-executed
        // This is what the bug broke - outer_compute wasn't being
        // invalidated because its output_dependent edge was removed
        assert!(
            read.outer_execution > prev_outer_execution,
            "outer_compute should have re-executed due to dependency on inner_compute (execution \
             id {} -> {})",
            prev_outer_execution,
            read.outer_execution
        );

        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[turbo_tasks::function(operation, root)]
fn get_dependency_input() -> Vc<ChangingInput> {
    ChangingInput {
        state: State::new(1),
    }
    .cell()
}

/// Process-wide source of execution ids for `inner_compute` and `outer_compute`.
///
/// Every execution takes a fresh id, so ids are unique and strictly increasing within the test
/// process. Other tests running concurrently in the same process only make the counter advance
/// faster, so the test only relies on ordering, never on exact values. The persistent cache
/// directory is cleared at the start of each test, so every id restored from the cache was
/// handed out earlier in this process.
static EXECUTION_COUNTER: AtomicU64 = AtomicU64::new(0);

fn next_execution_id() -> u64 {
    EXECUTION_COUNTER.fetch_add(1, Ordering::Relaxed) + 1
}

#[turbo_tasks::value]
struct DependencyOutput {
    value: u32,
    inner_execution: u64,
    outer_execution: u64,
}

#[turbo_tasks::value]
struct InnerOutput {
    value: u32,
    execution: u64,
}

/// Inner task - reads state directly, returns value tagged with a unique execution id
#[turbo_tasks::function]
async fn inner_compute(input: Vc<ChangingInput>) -> Result<Vc<InnerOutput>> {
    println!("inner_compute()");
    let value = *input.await?.state.get();
    Ok(InnerOutput {
        value,
        execution: next_execution_id(),
    }
    .cell())
}

/// Outer task - depends on inner_compute
#[turbo_tasks::function(operation, root)]
async fn outer_compute(input: ResolvedVc<ChangingInput>) -> Result<Vc<DependencyOutput>> {
    println!("outer_compute()");
    let inner = inner_compute(*input).await?;
    Ok(DependencyOutput {
        value: inner.value,
        inner_execution: inner.execution,
        outer_execution: next_execution_id(),
    }
    .cell())
}
