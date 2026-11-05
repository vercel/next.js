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
    ApplyError, ApplyStep, Effect, EffectExt, EffectStateStorage, Effects, EffectsError,
    NonLocalValue, OperationValue, ReadRef, ResolvedVc, State, TurboTasks, Vc, take_effects,
};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

/// Per-test counters + `EffectStateStorage`. Tests assert against
/// `applies_by_key` to check how many times each effect ran.
///
/// A single `SharedState` can be associated with multiple `TestInput` cells (each
/// representing a separate producer task); they then share the same
/// `EffectStateStorage`, mirroring how on disk two producers writing the
/// same path contend on the same per-key state entry.
#[derive(NonLocalValue)]
struct SharedState {
    applies_by_key: Mutex<FxHashMap<RcStr, u64>>,
    total_applies: AtomicU64,
    /// Counts `content_hash` calls, which only happen for keys with multiple identities.
    content_hashes: AtomicU64,
    #[turbo_tasks(unsafe_ignore)]
    state_storage: EffectStateStorage,
}

impl SharedState {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            applies_by_key: Mutex::new(Default::default()),
            total_applies: AtomicU64::new(0),
            content_hashes: AtomicU64::new(0),
            state_storage: EffectStateStorage::default(),
        })
    }

    fn applies_for(&self, key: &RcStr) -> u64 {
        self.applies_by_key.lock().get(key).copied().unwrap_or(0)
    }

    fn total(&self) -> u64 {
        self.total_applies.load(Ordering::Relaxed)
    }

    fn content_hashes(&self) -> u64 {
        self.content_hashes.load(Ordering::Relaxed)
    }
}
// Emit-side effect. A `#[turbo_tasks::value]` cell implementing the `Effect` value_trait. Marked
// `serialization = "skip"` because it holds `Arc<SharedState>` (counters + storage, not
// serializable) — these tests use `noop_backing_storage`, so persistence isn't exercised.
#[turbo_tasks::value(serialization = "skip", cell = "new", eq = "manual")]
struct TestEffect {
    key: RcStr,
    identity: u128,
    /// The content hash reported for multi-writer resolution. Defaults to `identity`.
    content: u128,
    #[turbo_tasks(debug_ignore)]
    shared: Arc<SharedState>,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Effect for TestEffect {
    fn key(&self) -> Box<[u8]> {
        self.key.as_bytes().into()
    }

    fn identity(&self) -> u128 {
        self.identity
    }

    async fn content_hash(&self) -> Result<u128, ApplyError> {
        self.shared.content_hashes.fetch_add(1, Ordering::Relaxed);
        Ok(self.content)
    }

    async fn apply(&self) -> Result<(), ApplyError> {
        self.shared
            .state_storage
            .run_apply::<TestError, _, _>(self.key(), self.identity, async |previous| {
                if previous.is_some_and(|previous| previous.identity == self.identity) {
                    return ApplyStep::UpToDate;
                }
                self.shared.total_applies.fetch_add(1, Ordering::Relaxed);
                *self
                    .shared
                    .applies_by_key
                    .lock()
                    .entry(self.key.clone())
                    .or_insert(0) += 1;
                ApplyStep::Applied(Ok(()))
            })
            .await
    }
}

#[derive(Debug, thiserror::Error, NonLocalValue)]
enum TestError {}

/// Spec for what the producer should emit: a list of `(key, identity)`
/// pairs. Stored inside `State<EmitSpec>` so mutating it invalidates the
/// producer.
#[derive(Clone, Default, PartialEq, Eq, Debug, NonLocalValue, OperationValue)]
struct EmitSpec {
    pairs: Vec<(RcStr, u128)>,
    /// If set, all emitted effects report this content hash.
    content: Option<u128>,
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
    #[turbo_tasks(debug_ignore)]
    shared: Arc<SharedState>,
    #[turbo_tasks(debug_ignore)]
    spec: Arc<State<EmitSpec>>,
    /// Side-channel `State` for invalidating the producer without changing
    /// `spec`. Lets tests simulate upstream input changes that don't affect
    /// emitted hashes (e.g. a comment edit that recompiles to identical bytes).
    #[turbo_tasks(debug_ignore)]
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
    for (key, identity) in spec.pairs {
        TestEffect {
            key,
            identity,
            content: spec.content.unwrap_or(identity),
            shared: shared.clone(),
        }
        .resolved_cell()
        .emit();
    }
    Ok(())
}

/// Read the current spec from `input` and emit the corresponding effects,
/// returning the taken `Effects`. State mutation must happen OUTSIDE this
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
    spec.set(EmitSpec {
        pairs,
        content: None,
    });
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
/// `EffectStateStorage` with `Applied { identity }`; the second call sees a
/// matching identity in every state entry, so the effect reports `UpToDate`
/// without running its side effect again.
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
/// with the same `(key, identity)` set produces a fresh `Effects` value
/// whose identity multiset matches the previous one. `.apply_for_testing()` on the new
/// `Effects` short-circuits through the per-key state machine because each
/// `EffectStateEntry` is still `Applied { identity: matching }`.
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
/// short-circuited by its `Applied { identity: matching }` state entry.
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
/// InProgress, run body, write back `Applied { H_A }`. Effects are kept alive
/// for the lifetime of the cell so re-apply always has a body to run; there is
/// no Retry signal in this scenario because the test effects never lack the
/// data they need.
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
            content: None,
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

        // Step 3: re-apply A's original Effects. The effects are still alive
        // (Effects keeps them for the cell's lifetime; cell="new" drops them
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
/// `Effects` keeps its effects alive for the lifetime of the cell, so every
/// apply re-enters the state machine; with storage `Applied{H_A}` matching
/// the effect's identity H_A, the effect reports `UpToDate`
/// without invoking the body a second time.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn repeated_apply_after_unchanged_state_dedupes() {
    let tt = create_tt();
    tt.run_once(async move {
        let (input, TestInput { shared, spec, .. }) = TestInput::new();

        spec.set(EmitSpec {
            pairs: vec![(rcstr!("foo"), 0xAAAA)],
            content: None,
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
            content: None,
        });
        let op = extract_effects(input);
        let effects_v1 = op.read_strongly_consistent().await?;

        // Mutate spec to invalidate the producer.
        spec.set(EmitSpec {
            pairs: vec![(rcstr!("foo"), 0xBBBB)],
            content: None,
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

/// Multiple identities for one key with equal content hashes are deduplicated: one apply runs and
/// no conflict is reported.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn multiple_writers_with_equal_content_dedupe() {
    let tt = create_tt();
    tt.run_once(async move {
        let (input, TestInput { shared, spec, .. }) = TestInput::new();

        spec.set(EmitSpec {
            pairs: vec![(rcstr!("foo"), 0xAAAA), (rcstr!("foo"), 0xBBBB)],
            content: Some(0x1234),
        });
        extract_effects(input)
            .read_strongly_consistent()
            .await?
            .apply_for_testing()
            .await?;
        assert_eq!(shared.applies_for(&rcstr!("foo")), 1);
        assert_eq!(shared.content_hashes(), 2, "both writers are hashed");

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Multiple identities for one key with different content hashes are a conflict, and nothing is
/// applied.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn multiple_writers_with_different_content_conflict() {
    let tt = create_tt();
    tt.run_once(async move {
        let (input, TestInput { shared, spec, .. }) = TestInput::new();

        let effects = emit_and_take(
            &spec,
            input,
            vec![
                (rcstr!("foo"), 0xAAAA),
                (rcstr!("foo"), 0xBBBB),
                (rcstr!("bar"), 0xCCCC),
            ],
        )
        .await?;
        let err = effects
            .apply_for_testing()
            .await
            .expect_err("expected a conflict");
        assert!(
            matches!(err, EffectsError::Conflict(_)),
            "expected EffectsError::Conflict, got {err:?}"
        );
        assert_eq!(shared.total(), 0, "nothing is applied on conflict");

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Duplicate effects with the same identity for one key never need content hashing.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn same_identity_duplicates_skip_hashing() {
    let tt = create_tt();
    tt.run_once(async move {
        let (input, TestInput { shared, spec, .. }) = TestInput::new();

        emit_and_take(
            &spec,
            input,
            vec![(rcstr!("foo"), 0xAAAA), (rcstr!("foo"), 0xAAAA)],
        )
        .await?
        .apply_for_testing()
        .await?;
        assert_eq!(shared.applies_for(&rcstr!("foo")), 1);
        assert_eq!(shared.content_hashes(), 0);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}
