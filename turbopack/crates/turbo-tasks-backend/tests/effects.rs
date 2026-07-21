#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use anyhow::Result;
use async_trait::async_trait;
use parking_lot::Mutex;
use rustc_hash::FxHashMap;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    ApplyError, CapturedEffect, Effect, EffectExt, EffectStateStorage, Effects, EffectsError,
    NonLocalValue, OperationValue, ReadRef, ResolvedVc, State, TurboTasks, Vc, take_effects,
    trace::TraceRawVcs,
};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

/// Per-test counters + `EffectStateStorage`. Tests assert against
/// `applies_by_key` to check how many times each effect ran.
///
/// A single `SharedState` can be associated with multiple `TestInput` cells (each
/// representing a separate producer task); they then share the same
/// `EffectStateStorage`, mirroring how on disk two producers writing the
/// same path contend on the same per-key state entry.
#[derive(TraceRawVcs, NonLocalValue)]
struct SharedState {
    #[turbo_tasks(trace_ignore)]
    applies_by_key: Mutex<FxHashMap<RcStr, u64>>,
    #[turbo_tasks(trace_ignore)]
    total_applies: AtomicU64,
    /// Counts captures that materialized content (i.e. those where
    /// `EffectStateStorage::matches_applied` returned false). Lets tests
    /// assert that capture skipped content materialization on re-runs.
    #[turbo_tasks(trace_ignore)]
    captures_with_content: AtomicU64,
    /// Shared `EffectStateStorage` used by both `matches_applied` (in `capture`)
    /// and `run_apply` (in `apply`).
    #[turbo_tasks(trace_ignore)]
    state_storage: EffectStateStorage,
}

impl SharedState {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            applies_by_key: Mutex::new(Default::default()),
            total_applies: AtomicU64::new(0),
            captures_with_content: AtomicU64::new(0),
            state_storage: EffectStateStorage::default(),
        })
    }

    fn applies_for(&self, key: &RcStr) -> u64 {
        self.applies_by_key.lock().get(key).copied().unwrap_or(0)
    }

    fn total(&self) -> u64 {
        self.total_applies.load(Ordering::Relaxed)
    }

    fn captures_with_content(&self) -> u64 {
        self.captures_with_content.load(Ordering::Relaxed)
    }
}
// Emit-side effect. A `#[turbo_tasks::value]` cell implementing the `Effect` value_trait. Marked
// `serialization = "skip"` because it holds `Arc<SharedState>` (counters + storage, not
// serializable) — these tests use `noop_backing_storage`, so persistence isn't exercised.
#[turbo_tasks::value(serialization = "skip", cell = "new", eq = "manual")]
struct TestEffect {
    key: RcStr,
    value_hash: u128,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    shared: Arc<SharedState>,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Effect for TestEffect {
    async fn capture(&self) -> Result<Box<dyn CapturedEffect>> {
        // Consult storage. If the per-key state already records `Applied { value_hash }`
        // matching our hash, elide content materialization (`content = false`). Otherwise
        // bump the captures-with-content counter (the test's stand-in for a `ReadRef` /
        // disk-read at this point).
        let content = if self
            .shared
            .state_storage
            .matches_applied(self.key.as_bytes(), self.value_hash)
        {
            false
        } else {
            self.shared
                .captures_with_content
                .fetch_add(1, Ordering::Relaxed);
            true
        };
        Ok(Box::new(TestEffectCaptured {
            key: self.key.clone(),
            value_hash: self.value_hash,
            content,
            shared: self.shared.clone(),
        }) as Box<dyn CapturedEffect>)
    }
}

// Post-capture effect — session-only plain struct.
#[derive(TraceRawVcs, NonLocalValue)]
struct TestEffectCaptured {
    key: RcStr,
    value_hash: u128,
    /// Whether `capture` materialized content. When `false`, `apply` passes `None` to
    /// `run_apply`; a non-matching storage state then triggers `ApplyOutcome::Retry`.
    content: bool,
    shared: Arc<SharedState>,
}

#[async_trait]
impl CapturedEffect for TestEffectCaptured {
    fn key(&self) -> Box<[u8]> {
        self.key.as_bytes().into()
    }

    fn value_hash(&self) -> u128 {
        self.value_hash
    }

    async fn apply(&self) -> Result<(), ApplyError> {
        let body = if self.content {
            Some(|| async {
                self.shared.total_applies.fetch_add(1, Ordering::Relaxed);
                *self
                    .shared
                    .applies_by_key
                    .lock()
                    .entry(self.key.clone())
                    .or_insert(0) += 1;
                Ok::<(), TestError>(())
            })
        } else {
            None
        };
        self.shared
            .state_storage
            .run_apply::<TestError, _, _>(self.key(), self.value_hash, body)
            .await
    }
}

#[derive(Debug, thiserror::Error, TraceRawVcs, NonLocalValue)]
enum TestError {}

/// Spec for what the producer should emit: a list of `(key, value_hash)`
/// pairs. Stored inside `State<EmitSpec>` so mutating it invalidates the
/// producer.
#[derive(Clone, Default, PartialEq, Eq, Debug, TraceRawVcs, NonLocalValue, OperationValue)]
struct EmitSpec {
    pairs: Vec<(RcStr, u128)>,
}

/// Input cell. Holds an `Arc<Shared>` (counters + `EffectStateStorage`) plus
/// its own `Arc<State<EmitSpec>>` driving what *this* producer emits. The
/// spec lives in an `Arc<State<…>>` rather than in the cell value so the
/// test body can mutate it from top-level via the handle returned by
/// `TestInput::new`, without going through a cached operation. Mutating from
/// inside a cached operation would make the operation non-deterministic.
///
/// Multiple `TestInput`s can share one `Arc<Shared>` (so they contend on the
/// same `EffectStateStorage`) while each carries its own independent spec —
/// this is what lets us simulate two sibling producers writing the same key
/// in the retry test.
#[turbo_tasks::value(eq = "manual", serialization = "skip")]
#[derive(Clone)]
struct TestInput {
    #[turbo_tasks(trace_ignore, debug_ignore)]
    shared: Arc<SharedState>,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    spec: Arc<State<EmitSpec>>,
    /// Side-channel `State` for invalidating the producer without changing
    /// `spec`. Lets tests simulate upstream input changes that don't affect
    /// emitted hashes (e.g. a comment edit that recompiles to identical bytes).
    #[turbo_tasks(trace_ignore, debug_ignore)]
    tick: Arc<State<u64>>,
}

impl PartialEq for TestInput {
    fn eq(&self, _other: &Self) -> bool {
        false
    }
}

impl TestInput {
    /// Construct a fresh `TestInput` cell with a fresh `Shared`.
    fn new() -> (ResolvedVc<Self>, Self) {
        Self::new_with_shared(SharedState::new())
    }

    /// Construct a fresh `TestInput` cell that shares an existing `Shared`.
    /// The new input has its own independent spec.
    fn new_with_shared(shared: Arc<SharedState>) -> (ResolvedVc<Self>, Self) {
        let spec = Arc::new(State::new(EmitSpec::default()));
        let tick = Arc::new(State::new(0u64));
        let input = Self { shared, spec, tick };

        (input.clone().resolved_cell(), input)
    }
}

#[turbo_tasks::function(operation, root)]
async fn producer_operation(input: ResolvedVc<TestInput>) -> Result<()> {
    let input = input.await?;
    let shared = input.shared.clone();
    let spec = input.spec.get().clone();
    // Track `tick` so callers can force a producer rerun without mutating `spec`.
    let _tick: u64 = *input.tick.get();
    for (key, value_hash) in spec.pairs {
        TestEffect {
            key,
            value_hash,
            shared: shared.clone(),
        }
        .resolved_cell()
        .emit();
    }
    Ok(())
}

/// Read the current spec from `input` and emit the corresponding effects,
/// returning the captured `Effects`. State mutation must happen OUTSIDE this
/// operation (at top-level via the spec handle), otherwise the operation
/// becomes non-deterministic and turbo-tasks may re-run it with stale inputs.
#[turbo_tasks::function(operation, root)]
async fn extract_effects(input: ResolvedVc<TestInput>) -> Result<Vc<Effects>> {
    let producer = producer_operation(input);
    let _ = producer.resolve().strongly_consistent().await?;
    Ok(take_effects(producer).await?.cell())
}

/// Mutate the spec via its top-level handle and return the resulting
/// `Effects`. State mutation is synchronous at top-level (so it doesn't make
/// any operation non-deterministic); only the `take_effects` step runs
/// inside an operation root so it gets strongly-consistent read semantics.
async fn emit_and_take(
    spec: &State<EmitSpec>,
    input: ResolvedVc<TestInput>,
    pairs: Vec<(RcStr, u128)>,
) -> Result<ReadRef<Effects>> {
    spec.set(EmitSpec { pairs });
    extract_effects(input).read_strongly_consistent().await
}

// =============================================================================
// Test harness
// =============================================================================

fn create_tt() -> Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions::default(),
        noop_backing_storage(),
    ))
}

// =============================================================================
// Tests
// =============================================================================

/// A duplicate sequential `.apply_for_testing()` on the same `Effects` must run each
/// underlying side-effect exactly once. The first call populates the per-key
/// `EffectStateStorage` with `Applied { value_hash }`; the second call sees
/// `Effects.captured == None` and falls through `apply_post_drop` where every
/// state entry is `Applied` with a matching hash → no `dyn_apply` invocation.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn duplicate_apply_runs_once() {
    let tt = create_tt();
    tt.run_once(async move {
        let (input, TestInput { shared, spec, .. }) = TestInput::new();

        let effects = emit_and_take(&spec, input, vec![(rcstr!("foo"), 0xAAAA)]).await?;

        effects.apply_for_testing().await?;
        assert_eq!(
            shared.applies_for(&rcstr!("foo")),
            1,
            "first apply runs the effect"
        );

        effects.apply_for_testing().await?;
        assert_eq!(
            shared.applies_for(&rcstr!("foo")),
            1,
            "second apply on the same Effects must not re-run"
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Re-running the producer (e.g. because something upstream invalidated it)
/// with the same `(key, value_hash)` set produces a fresh `Effects` value
/// whose identity multiset matches the previous one. `.apply_for_testing()` on the new
/// `Effects` short-circuits through the per-key state machine because each
/// `EffectStateEntry` is still `Applied { value_hash: matching }`.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn reemit_unchanged_hash_does_not_reapply() {
    let tt = create_tt();
    tt.run_once(async move {
        let (input, TestInput { shared, spec, .. }) = TestInput::new();

        emit_and_take(
            &spec,
            input,
            vec![(rcstr!("foo"), 0xAAAA), (rcstr!("bar"), 0xBBBB)],
        )
        .await?
        .apply_for_testing()
        .await?;
        assert_eq!(shared.total(), 2, "first emit runs both effects");

        // Re-set with the same value. `State::set` is a no-op when the value
        // hasn't changed (PartialEq), but the second `extract_effects` invocation
        // is still a fresh root task — it re-takes the producer's collectibles.
        emit_and_take(
            &spec,
            input,
            vec![(rcstr!("foo"), 0xAAAA), (rcstr!("bar"), 0xBBBB)],
        )
        .await?
        .apply_for_testing()
        .await?;
        assert_eq!(
            shared.total(),
            2,
            "re-emit with same (key, hash) must not re-run any apply"
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Changing one effect's hash re-runs only that effect; the sibling stays
/// short-circuited by its `Applied { value_hash: matching }` state entry.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn hash_change_reapplies_only_changed_key() {
    let tt = create_tt();
    tt.run_once(async move {
        let (input, TestInput { shared, spec, .. }) = TestInput::new();

        emit_and_take(
            &spec,
            input,
            vec![(rcstr!("foo"), 0xAAAA), (rcstr!("bar"), 0xBBBB)],
        )
        .await?
        .apply_for_testing()
        .await?;
        assert_eq!(shared.applies_for(&rcstr!("foo")), 1);
        assert_eq!(shared.applies_for(&rcstr!("bar")), 1);

        // Change key 1's hash; leave key 2 alone.
        emit_and_take(
            &spec,
            input,
            vec![(rcstr!("foo"), 0xCCCC), (rcstr!("bar"), 0xBBBB)],
        )
        .await?
        .apply_for_testing()
        .await?;
        assert_eq!(
            shared.applies_for(&rcstr!("foo")),
            2,
            "key 1 hash changed; apply must run again"
        );
        assert_eq!(
            shared.applies_for(&rcstr!("bar")),
            1,
            "key 2 unchanged; apply must short-circuit"
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Adding a brand-new effect to the emitted set only runs the new key's
/// apply; the pre-existing keys stay short-circuited.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn adding_effect_only_runs_new_key() {
    let tt = create_tt();
    tt.run_once(async move {
        let (input, TestInput { shared, spec, .. }) = TestInput::new();

        emit_and_take(&spec, input, vec![(rcstr!("foo"), 0xAAAA)])
            .await?
            .apply_for_testing()
            .await?;
        assert_eq!(shared.total(), 1);

        // Add a new effect, key 2.
        emit_and_take(
            &spec,
            input,
            vec![(rcstr!("foo"), 0xAAAA), (rcstr!("bar"), 0xBBBB)],
        )
        .await?
        .apply_for_testing()
        .await?;

        assert_eq!(
            shared.applies_for(&rcstr!("foo")),
            1,
            "key 1 already applied"
        );
        assert_eq!(shared.applies_for(&rcstr!("bar")), 1, "key 2 newly added");
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Removing an effect from the emitted set must not re-run the surviving
/// effect, and the removed effect's apply must not fire again either.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn removing_effect_does_not_reapply_survivors() {
    let tt = create_tt();
    tt.run_once(async move {
        let (input, TestInput { shared, spec, .. }) = TestInput::new();

        emit_and_take(
            &spec,
            input,
            vec![(rcstr!("foo"), 0xAAAA), (rcstr!("bar"), 0xBBBB)],
        )
        .await?
        .apply_for_testing()
        .await?;
        assert_eq!(shared.total(), 2);

        // Drop key 2.
        emit_and_take(&spec, input, vec![(rcstr!("foo"), 0xAAAA)])
            .await?
            .apply_for_testing()
            .await?;

        assert_eq!(shared.applies_for(&rcstr!("foo")), 1, "key 1 stays cached");
        assert_eq!(
            shared.applies_for(&rcstr!("bar")),
            1,
            "key 2 was removed; its apply must not run again"
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// When sibling producers write the same key with different hashes, A's
/// re-apply (on the same `Effects` value) re-fires A's side effect because
/// the per-key state machine sees `Applied { H_B } != H_A` → break into
/// InProgress, run body, write back `Applied { H_A }`. Captured effects are
/// kept alive for the lifetime of the cell so re-apply always has a body to
/// run; there is no Retry signal in this scenario because the test effects
/// don't elide content at capture time.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn sibling_producer_overwrites_state_reapplies_on_call() {
    let tt = create_tt();
    tt.run_once(async move {
        let (
            input_a,
            TestInput {
                shared,
                spec: spec_a,
                ..
            },
        ) = TestInput::new();
        let (input_b, TestInput { spec: spec_b, .. }) = TestInput::new_with_shared(shared.clone());

        // Step 1: A emits and applies (key=1, hash=H1).
        spec_a.set(EmitSpec {
            pairs: vec![(rcstr!("foo"), 0xAAAA)],
        });
        let op_a = extract_effects(input_a);
        let effects_a = op_a.read_strongly_consistent().await?;
        effects_a.apply_for_testing().await?;
        assert_eq!(shared.applies_for(&rcstr!("foo")), 1, "A's first apply ran");

        // Step 2: B emits and applies (key=1, hash=H2). Different hash for the
        // same key overwrites the per-key state entry.
        emit_and_take(&spec_b, input_b, vec![(rcstr!("foo"), 0xBBBB)])
            .await?
            .apply_for_testing()
            .await?;
        assert_eq!(
            shared.applies_for(&rcstr!("foo")),
            2,
            "B's apply for the same key ran"
        );

        // Step 3: re-apply A's original Effects. Captured slice is still alive
        // (Effects keeps captured for the cell's lifetime; cell="new" drops it
        // when the producer reruns), so the state machine breaks into InProgress
        // and re-runs A's body, then writes back Applied{H_A}.
        effects_a.apply_for_testing().await?;
        assert_eq!(
            shared.applies_for(&rcstr!("foo")),
            3,
            "A's re-apply against stomped state re-fires its body"
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// When `Effects::apply` is called twice in sequence on the same value, the
/// second call short-circuits via the per-key dedup hit. This works because
/// `Effects` keeps `captured` alive for the lifetime of the cell, so every
/// apply re-enters the state machine; with storage `Applied{H_A}` matching
/// the captured hash H_A, the state machine returns the cached result
/// without invoking the body a second time.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn repeated_apply_after_unchanged_state_dedupes() {
    let tt = create_tt();
    tt.run_once(async move {
        let (input, TestInput { shared, spec, .. }) = TestInput::new();

        spec.set(EmitSpec {
            pairs: vec![(rcstr!("foo"), 0xAAAA)],
        });
        let op = extract_effects(input);
        let effects = op.read_strongly_consistent().await?;
        effects.apply_for_testing().await?;
        assert_eq!(shared.applies_for(&rcstr!("foo")), 1);

        effects.apply_for_testing().await?;
        assert_eq!(
            shared.applies_for(&rcstr!("foo")),
            1,
            "second apply with unchanged state must dedup-hit",
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Holding on to `effects_a`, deliberately suppress the test from holding
/// `ReadRef` references that would prevent eviction. We confirm referential
/// behavior: after a sibling stomps storage and A is invalidated and re-read,
/// the new `Effects` cell is a different value (cell = "new").
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn cell_new_produces_distinct_effects_per_producer_run() {
    let tt = create_tt();
    tt.run_once(async move {
        let (input, TestInput { spec, .. }) = TestInput::new();

        spec.set(EmitSpec {
            pairs: vec![(rcstr!("foo"), 0xAAAA)],
        });
        let op = extract_effects(input);
        let effects_v1 = op.read_strongly_consistent().await?;

        // Mutate spec to invalidate the producer.
        spec.set(EmitSpec {
            pairs: vec![(rcstr!("foo"), 0xBBBB)],
        });
        let effects_v2 = op.read_strongly_consistent().await?;

        assert!(
            !ReadRef::ptr_eq(&effects_v1, &effects_v2),
            "cell = \"new\" must allocate a fresh cell value on producer rerun"
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// When the producer reruns with the same `(key, value_hash)` after the first
/// apply succeeded, `capture` observes storage `Applied{matching}` and elides
/// content materialization. The apply-side state machine still dedup-hits
/// because storage is unchanged, so the side effect does not re-fire.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn capture_skips_content_when_storage_matches() {
    let tt = create_tt();
    tt.run_once(async move {
        let (
            input,
            TestInput {
                shared, spec, tick, ..
            },
        ) = TestInput::new();

        spec.set(EmitSpec {
            pairs: vec![(rcstr!("foo"), 0xAAAA)],
        });
        let op = extract_effects(input);
        op.read_strongly_consistent()
            .await?
            .apply_for_testing()
            .await?;
        assert_eq!(shared.applies_for(&rcstr!("foo")), 1, "first apply ran");
        assert_eq!(
            shared.captures_with_content(),
            1,
            "first capture had to materialize (storage was empty)"
        );

        // Force the producer to rerun without changing what it emits (simulates
        // an upstream input change that doesn't affect the output). Storage
        // still holds `Applied{0xAAAA}` so capture's `matches_applied` returns
        // true and we skip content materialization. Apply dedup-hits via the
        // state machine.
        tick.set(1);
        op.read_strongly_consistent()
            .await?
            .apply_for_testing()
            .await?;
        assert_eq!(
            shared.applies_for(&rcstr!("foo")),
            1,
            "re-emit with unchanged state must not re-run apply",
        );
        assert_eq!(
            shared.captures_with_content(),
            1,
            "second capture must skip content materialization",
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Race scenario: A's capture observed `Applied{H_A}` and elided content
/// materialization. Before A's apply runs, B applies a different hash for the
/// same key, stomping storage to `Applied{H_B}`. A's apply now sees the
/// mismatch but has no content — `ApplyOutcome::Retry` propagates as
/// `EffectsError::Retry`. The producer's invalidator fires; re-reading A
/// produces a fresh `Effects` whose `capture` sees the mismatch and
/// materializes content this time, so the second apply succeeds.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn capture_skip_then_stomp_signals_retry() {
    let tt = create_tt();
    tt.run_once(async move {
        let (
            input_a,
            TestInput {
                shared,
                spec: spec_a,
                tick: tick_a,
            },
        ) = TestInput::new();
        let (input_b, TestInput { spec: spec_b, .. }) = TestInput::new_with_shared(shared.clone());

        // T1: A applies (key=1, H_A). Storage = Applied{H_A}. Capture had to
        // materialize (storage was empty).
        spec_a.set(EmitSpec {
            pairs: vec![(rcstr!("foo"), 0xAAAA)],
        });
        let op_a = extract_effects(input_a);
        op_a.read_strongly_consistent()
            .await?
            .apply_for_testing()
            .await?;
        assert_eq!(shared.applies_for(&rcstr!("foo")), 1);
        assert_eq!(shared.captures_with_content(), 1);

        // T2: Force the producer to rerun by bumping `tick` (simulates an upstream
        // input change that doesn't affect the emitted hashes). Storage still
        // holds Applied{H_A}, so capture's matches_applied returns true and we
        // elide content materialization.
        tick_a.set(1);
        let effects_a_skipped = op_a.read_strongly_consistent().await?;
        assert_eq!(
            shared.captures_with_content(),
            1,
            "second capture skipped materialization",
        );

        // T3: B applies (key=1, H_B). Different hash, so B's capture materializes
        // and writes back Applied{H_B}.
        emit_and_take(&spec_b, input_b, vec![(rcstr!("foo"), 0xBBBB)])
            .await?
            .apply_for_testing()
            .await?;
        assert_eq!(shared.applies_for(&rcstr!("foo")), 2);

        // T4: A's apply on the content-elided Effects. State is Applied{H_B} ≠
        // H_A; capture had no content → run_apply returns Retry.
        let err = effects_a_skipped
            .apply_for_testing()
            .await
            .expect_err("expected Retry");
        assert!(
            matches!(err, EffectsError::Retry { .. }),
            "expected EffectsError::Retry, got {err:?}"
        );
        assert_eq!(
            shared.applies_for(&rcstr!("foo")),
            2,
            "Retry path must not run A's side effect",
        );

        // T5: Re-read A. capture sees Applied{H_B} ≠ H_A so it materializes
        // content. Apply succeeds and writes back Applied{H_A}.
        op_a.read_strongly_consistent()
            .await?
            .apply_for_testing()
            .await?;
        assert_eq!(
            shared.applies_for(&rcstr!("foo")),
            3,
            "fresh capture with content recovers A's apply",
        );
        assert!(
            shared.captures_with_content() >= 2,
            "recovery capture had to materialize at least once (storage diverged); got {}",
            shared.captures_with_content(),
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}
