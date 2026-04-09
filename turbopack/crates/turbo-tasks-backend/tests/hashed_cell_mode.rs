#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::atomic::{AtomicU32, Ordering};

use anyhow::Result;
use turbo_tasks::{ResolvedVc, State, Vc};
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher};
use turbo_tasks_testing::{Registration, register, run};

static REGISTRATION: Registration = register!();

static EXECUTION_COUNTER: AtomicU32 = AtomicU32::new(0);

/// A value type using `serialization = "hash"` mode.
/// Only `value` participates in DeterministicHash/Eq; `noise` does not.
#[turbo_tasks::value(serialization = "hash", eq = "manual", hash = "manual")]
#[derive(Debug)]
struct HashedValue {
    value: u32,
    noise: u64,
}

impl DeterministicHash for HashedValue {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        self.value.deterministic_hash(state);
    }
}

impl PartialEq for HashedValue {
    fn eq(&self, other: &Self) -> bool {
        self.value == other.value
    }
}

impl Eq for HashedValue {}

#[turbo_tasks::value(transparent)]
struct Step(State<u32>);

#[turbo_tasks::value]
struct ConsumeResult {
    value: u32,
    random: u32,
}

#[turbo_tasks::function(operation)]
fn create_state_operation() -> Vc<Step> {
    Step(State::new(0)).cell()
}

/// Produces a HashedValue from a state. The noise field changes each execution
/// but does not affect hash or equality.
#[turbo_tasks::function(operation)]
async fn produce_hashed(input: ResolvedVc<Step>) -> Result<Vc<HashedValue>> {
    let value = *input.await?.get();
    let noise = EXECUTION_COUNTER.fetch_add(1, Ordering::Relaxed) as u64;
    Ok(HashedValue { value, noise }.cell())
}

/// Consumes the HashedValue and records a random number to detect re-execution.
#[turbo_tasks::function(operation)]
async fn consume_hashed(input: ResolvedVc<Step>) -> Result<Vc<ConsumeResult>> {
    let hashed = produce_hashed(input).connect();
    let v = hashed.await?;
    let value = v.value;
    let random = EXECUTION_COUNTER.fetch_add(1, Ordering::Relaxed);
    Ok(ConsumeResult { value, random }.cell())
}

/// Test 1: When the value changes, the consumer SHOULD be invalidated and re-execute.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_hashed_cell_mode_change_triggers_invalidation() {
    run(&REGISTRATION, || async {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(42);

        let consumer = consume_hashed(state_vc);
        let result1 = consumer.read_strongly_consistent().await?;
        assert_eq!(result1.value, 42);

        // Change the value — this should invalidate the consumer.
        state.set(99);
        let result2 = consumer.read_strongly_consistent().await?;
        assert_eq!(result2.value, 99);
        // Consumer must have re-executed (different random).
        assert_ne!(
            result1.random, result2.random,
            "consumer should re-execute when value changes"
        );

        anyhow::Ok(())
    })
    .await
    .unwrap();
}

/// Test 2: When the value stays the same, the consumer should NOT be invalidated.
/// The producer re-runs (state.set triggers it) but produces an equal HashedValue.
/// With `serialization = "hash"`, the consumer should not be re-executed.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_hashed_cell_mode_equal_value_no_invalidation() {
    run(&REGISTRATION, || async {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(42);

        let consumer = consume_hashed(state_vc);
        let result1 = consumer.read_strongly_consistent().await?;
        assert_eq!(result1.value, 42);

        // Re-trigger the producer with the same value.
        // State::set unconditionally invalidates, so the producer re-runs.
        // But it produces an equal HashedValue (same `value`, different `noise`).
        // Since DeterministicHash and PartialEq only check `value`, the consumer should NOT
        // re-execute.
        state.set(42);
        let result2 = consumer.read_strongly_consistent().await?;
        assert_eq!(result2.value, 42);
        assert_eq!(
            result1.random, result2.random,
            "consumer should not re-execute when value (and hash) are the same"
        );

        anyhow::Ok(())
    })
    .await
    .unwrap();
}
