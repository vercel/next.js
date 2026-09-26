// Both tests check assertions that only exist in debug builds.
#![cfg(debug_assertions)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::panic::{AssertUnwindSafe, catch_unwind};

use turbo_tasks::{GcRoot, State, TransientState, Vc, turbo_tasks};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value(transparent)]
struct Step(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_state() -> Vc<Step> {
    Step(State::new(1)).cell()
}

#[turbo_tasks::value(transparent, serialization = "skip", evict = "never")]
struct TransientStep(TransientState<u32>);

#[turbo_tasks::function(operation, root)]
fn create_transient_state() -> Vc<TransientStep> {
    TransientStep(TransientState::new(1)).cell()
}

/// Runs `f`, which must panic, and returns the panic message.
fn panic_message(f: impl FnOnce()) -> String {
    let panic = catch_unwind(AssertUnwindSafe(f)).expect_err("expected a panic");
    panic
        .downcast_ref::<String>()
        .cloned()
        .or_else(|| panic.downcast_ref::<&str>().map(|s| s.to_string()))
        .unwrap_or_default()
}

/// An update closure on a persisted `State` runs inside a backend operation, so calling back into
/// turbo-tasks from it can deadlock against a pending snapshot. Debug builds turn that into an
/// immediate, explanatory panic.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn update_closure_must_not_call_turbo_tasks() {
    run_once(&REGISTRATION, async || {
        let state_op = create_state();
        let state = state_op.read_strongly_consistent().await?;
        let message = panic_message(|| {
            state.update_conditionally(|value| {
                // Pinning goes through the backend.
                let _root = GcRoot::pin(turbo_tasks(), state_op);
                *value = 2;
                true
            })
        });
        assert!(
            message.contains("must not call back into turbo-tasks"),
            "unexpected panic: {message}"
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Running a state's invalidators reaches into the backend, so it must not happen while the thread
/// holds a state lock, such as a `TransientState` read guard. Debug builds assert this.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalidators_must_not_run_with_a_state_lock_held() {
    run_once(&REGISTRATION, async || {
        let state = create_state().read_strongly_consistent().await?;
        let transient = create_transient_state().read_strongly_consistent().await?;
        let message = panic_message(|| {
            let _guard = transient.get_untracked();
            state.set_unconditionally(2);
        });
        assert!(
            message.contains("must not be run while a state lock is held"),
            "unexpected panic: {message}"
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}
