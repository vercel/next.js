use anyhow::Result;
use indexmap::map::Entry;

use crate::{
    self as turbo_tasks, FxIndexMap, OperationValue, OperationVc, ReadRef, ResolvedVc, State,
    TryJoinIterExt, Vc,
};

/// Just an empty type, but it's never equal to itself.
///
/// [`Vc<Completion>`] can be used as return value instead of `()` to have a concrete reference that
/// can be awaited. It will invalidate the awaiting task everytime the referenced task has been
/// executed.
///
/// Note: [`PartialEq`] is not implemented since it doesn't make sense to compare `Completion` this
/// way. You probably want to use [`ReadRef::ptr_eq`][crate::ReadRef::ptr_eq] instead.
#[turbo_tasks::value(cell = "new", eq = "manual")]
#[derive(Debug, OperationValue)]
pub struct Completion;

#[turbo_tasks::value_impl]
impl Completion {
    /// This will always be the same and never invalidates the reading task.
    #[turbo_tasks::function]
    pub fn immutable() -> Vc<Self> {
        Completion::cell(Completion)
    }

    /// Returns a completion from a session-dependent task. Awaiting this creates a dependency on
    /// a session-dependent task, which will cause the calling task to be re-executed when
    /// restored from persistent cache.
    #[turbo_tasks::function(session_dependent)]
    pub fn session_dependent() -> Vc<Self> {
        Completion::cell(Completion)
    }
}

// no #[turbo_tasks::value_impl] to inline new into the caller task
// this ensures it's re-created on each execution
impl Completion {
    /// An [`OperationVc`] of [`Completion::immutable`], for APIs that take a completion operation.
    pub fn immutable_operation() -> OperationVc<Self> {
        immutable_completion_operation()
    }

    /// This will always be a new completion and invalidates the reading task.
    pub fn new() -> Vc<Self> {
        Completion::cell(Completion)
    }
}

#[turbo_tasks::value(transparent)]
pub struct Completions(Vec<ResolvedVc<Completion>>);

#[turbo_tasks::value_impl]
impl Completions {
    /// Merges the list of completions into one.
    #[turbo_tasks::function]
    pub async fn completed(&self) -> anyhow::Result<Vc<Completion>> {
        if self.0.len() > 100 {
            let mid = self.0.len() / 2;
            let (left, right) = self.0.split_at(mid);
            let left = Vc::<Completions>::cell(left.to_vec());
            let right = Vc::<Completions>::cell(right.to_vec());
            let left = left.completed();
            let right = right.completed();
            left.await?;
            right.await?;
            Ok(Completion::new())
        } else {
            self.0
                .iter()
                .map(|&c| {
                    // Wraps the completion in a new completion. This makes it cheaper to
                    // restore since it doesn't need to restore the
                    // original task resp task chain.
                    wrap(*c)
                })
                .try_join()
                .await?;
            Ok(Completion::new())
        }
    }
}

#[turbo_tasks::function]
async fn wrap(completion: Vc<Completion>) -> Result<Vc<Completion>> {
    completion.await?;
    Ok(Completion::new())
}

/// A growing collection of [`Completion`]s that only invalidates its dependents when one of the
/// contained completions changes, but not when a new completion is added.
///
/// This allows a long-lived, shared resource (e.g. a pool of worker processes) to be invalidated
/// by the completions of all of its users, without making those completions part of the task key
/// of the task creating the resource.
///
/// Internally it uses two [`State`]s:
/// - The contained completions, each with the [`ReadRef`] last observed for it. Comparing these
///   with [`ReadRef::ptr_eq`] tells a changed completion apart from a newly added one.
/// - A counter that is incremented whenever a contained completion has changed. Tasks depending on
///   [`CompletionBag::invalidation_count`] or [`CompletionBag::completed`] are invalidated when it
///   changes.
///
/// The contained completions are connected as children of the bag's tasks, so a strongly
/// consistent read of the bag waits for every dirty contained completion to be recomputed. A
/// change is therefore detected even when no pusher reads its completion again.
#[turbo_tasks::value(
    serialization = "skip",
    eq = "manual",
    cell = "new",
    evict = "never",
    shared
)]
pub struct CompletionBag {
    #[turbo_tasks(debug_ignore)]
    completions: State<FxIndexMap<OperationVc<Completion>, ReadRef<Completion>>>,
    invalidation_count: State<u32>,
}

impl CompletionBag {
    /// Creates an empty bag. Must be called from within a task.
    pub fn new() -> Self {
        Self {
            completions: State::new(FxIndexMap::default()),
            invalidation_count: State::new(0),
        }
    }

    /// Adds `completion` to the bag. This doesn't invalidate the dependents of the bag. Adding a
    /// completion that is already contained is a no-op.
    ///
    /// This connects and reads `completion`, so the calling task depends on it.
    pub async fn push(&self, completion: OperationVc<Completion>) -> Result<()> {
        // Record the value the caller observed, so that a change between this push and the next
        // execution of `detect_invalidations` is still detected.
        let current = completion.connect().await?;
        if !crate::turbo_tasks().is_tracking_dependencies() {
            // Without dependency tracking nothing is invalidated, so there is nothing to detect.
            // Mutating the state would also try to invalidate the readers, which isn't allowed
            // in this mode.
            return Ok(());
        }
        if self.completions.get_untracked().contains_key(&completion) {
            return Ok(());
        }
        self.completions
            .update_conditionally(|completions| match completions.entry(completion) {
                Entry::Occupied(_) => false,
                Entry::Vacant(entry) => {
                    entry.insert(current);
                    true
                }
            });
        Ok(())
    }
}

impl Default for CompletionBag {
    fn default() -> Self {
        Self::new()
    }
}

#[turbo_tasks::value_impl]
impl CompletionBag {
    /// Returns the number of times a contained completion has changed. Only changes when a
    /// contained completion changes, not when a completion is added.
    #[turbo_tasks::function]
    pub async fn invalidation_count(self: Vc<Self>) -> Result<Vc<u32>> {
        // Executes the diffing, which updates the counter read below.
        self.detect_invalidations().await?;
        let this = self.await?;
        let count = *this.invalidation_count.get();
        Ok(Vc::cell(count))
    }

    /// Invalidates the reading task whenever a contained completion changes.
    #[turbo_tasks::function]
    pub async fn completed(self: Vc<Self>) -> Result<Vc<Completion>> {
        self.invalidation_count().await?;
        Ok(Completion::new())
    }

    /// Reads all contained completions and compares them with the last observed values. This
    /// re-executes whenever a completion is added or a contained completion changes, but its
    /// output never changes. Only an actual change of a contained completion increments the
    /// counter.
    #[turbo_tasks::function]
    async fn detect_invalidations(self: Vc<Self>) -> Result<Vc<()>> {
        let this = self.await?;
        let completions = this
            .completions
            .get()
            .iter()
            .map(|(operation, last)| (*operation, last.clone()))
            .collect::<Vec<_>>();
        let current = completions
            .iter()
            .map(|(operation, _)| operation.connect())
            .try_join()
            .await?;

        let updates = completions
            .into_iter()
            .zip(current)
            .filter(|((_, last), current)| !ReadRef::ptr_eq(last, current))
            .map(|((operation, _), current)| (operation, current))
            .collect::<Vec<_>>();
        if updates.is_empty() {
            return Ok(Vc::cell(()));
        }

        // INVALIDATION: Only the last observed values are updated here, so dependents of the
        // completions (including this task) must not be invalidated. Returning `false` stores the
        // update without notifying them.
        this.completions.update_conditionally(|completions| {
            for (operation, current) in updates {
                if let Some(last) = completions.get_mut(&operation) {
                    *last = current;
                }
            }
            false
        });
        this.invalidation_count.update_conditionally(|count| {
            *count = count.wrapping_add(1);
            true
        });
        Ok(Vc::cell(()))
    }
}

#[turbo_tasks::function(operation)]
fn immutable_completion_operation() -> Vc<Completion> {
    Completion::immutable()
}
