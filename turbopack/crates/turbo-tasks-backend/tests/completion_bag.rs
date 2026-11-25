#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::atomic::{AtomicU32, Ordering};

use anyhow::Result;
use turbo_tasks::{Completion, CompletionBag, ResolvedVc, State, Vc};
use turbo_tasks_testing::{Registration, register, run_once_without_cache_check};

static REGISTRATION: Registration = register!();

static DEPENDENT_EXECUTIONS: AtomicU32 = AtomicU32::new(0);

#[turbo_tasks::value(transparent)]
struct Step(State<u32>);

/// `key` only distinguishes the states.
#[turbo_tasks::function(operation, root)]
fn create_step_operation(key: u32) -> Vc<Step> {
    let _ = key;
    Step(State::new(0)).cell()
}

#[turbo_tasks::function(operation, root)]
fn create_bag_operation() -> Vc<CompletionBag> {
    CompletionBag::new().cell()
}

/// A completion that changes whenever `step` changes.
#[turbo_tasks::function(operation)]
async fn step_completion(step: ResolvedVc<Step>) -> Result<Vc<Completion>> {
    let _ = *step.await?.get();
    Ok(Completion::new())
}

/// Pushes the completion of `step` into `bag`, like an evaluation pushing its additional
/// invalidation into the pool.
#[turbo_tasks::function(operation, root)]
async fn push_operation(bag: ResolvedVc<CompletionBag>, step: ResolvedVc<Step>) -> Result<Vc<()>> {
    bag.await?.push(step_completion(step)).await?;
    Ok(Vc::cell(()))
}

#[turbo_tasks::function(operation, root)]
async fn dependent_operation(bag: ResolvedVc<CompletionBag>) -> Result<Vc<u32>> {
    DEPENDENT_EXECUTIONS.fetch_add(1, Ordering::SeqCst);
    let count = *bag.invalidation_count().await?;
    Ok(Vc::cell(count))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn completion_bag_invalidation() {
    run_once_without_cache_check(&REGISTRATION, async {
        let step_a_op = create_step_operation(1);
        let step_a = step_a_op.resolve().strongly_consistent().await?;
        let step_b_op = create_step_operation(2);
        let step_b = step_b_op.resolve().strongly_consistent().await?;

        let bag = create_bag_operation()
            .resolve()
            .strongly_consistent()
            .await?;
        let dependent = dependent_operation(bag);

        assert_eq!(*dependent.read_strongly_consistent().await?, 0);
        assert_eq!(DEPENDENT_EXECUTIONS.load(Ordering::SeqCst), 1);

        // Adding a completion doesn't invalidate the dependent.
        push_operation(bag, step_a)
            .read_strongly_consistent()
            .await?;
        assert_eq!(*dependent.read_strongly_consistent().await?, 0);
        assert_eq!(DEPENDENT_EXECUTIONS.load(Ordering::SeqCst), 1);

        // Neither does adding another one.
        push_operation(bag, step_b)
            .read_strongly_consistent()
            .await?;
        assert_eq!(*dependent.read_strongly_consistent().await?, 0);
        assert_eq!(DEPENDENT_EXECUTIONS.load(Ordering::SeqCst), 1);

        // Changing a contained completion invalidates the dependent once the completion has been
        // recomputed. The pusher re-executes since it depends on the completion, but pushing an
        // already contained completion doesn't count as an invalidation.
        let step_a_state = step_a_op.read_strongly_consistent().await?;
        step_a_state.set(1);
        push_operation(bag, step_a)
            .read_strongly_consistent()
            .await?;
        assert_eq!(*dependent.read_strongly_consistent().await?, 1);
        assert_eq!(DEPENDENT_EXECUTIONS.load(Ordering::SeqCst), 2);

        // Reading the pusher again doesn't invalidate the dependent.
        push_operation(bag, step_a)
            .read_strongly_consistent()
            .await?;
        assert_eq!(*dependent.read_strongly_consistent().await?, 1);
        assert_eq!(DEPENDENT_EXECUTIONS.load(Ordering::SeqCst), 2);

        // Changing another contained completion invalidates the dependent again.
        let step_b_state = step_b_op.read_strongly_consistent().await?;
        step_b_state.set(1);
        push_operation(bag, step_b)
            .read_strongly_consistent()
            .await?;
        assert_eq!(*dependent.read_strongly_consistent().await?, 2);
        assert_eq!(DEPENDENT_EXECUTIONS.load(Ordering::SeqCst), 3);

        // A strongly consistent read of the dependent waits for a changed contained completion,
        // even when its pusher doesn't read it again.
        let step_c_op = create_step_operation(3);
        let step_c = step_c_op.resolve().strongly_consistent().await?;
        push_operation(bag, step_c)
            .read_strongly_consistent()
            .await?;
        assert_eq!(*dependent.read_strongly_consistent().await?, 2);
        let step_c_state = step_c_op.read_strongly_consistent().await?;
        step_c_state.set(1);
        assert_eq!(*dependent.read_strongly_consistent().await?, 3);
        assert_eq!(DEPENDENT_EXECUTIONS.load(Ordering::SeqCst), 4);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}
