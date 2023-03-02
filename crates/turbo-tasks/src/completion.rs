use crate::{self as turbo_tasks, RawVc};

/// Just an empty type, but it's never equal to itself.
/// [CompletionVc] can be used as return value instead of `()`
/// to have a concrete reference that can be awaited.
/// It will invalidate the awaiting task everytime the referenced
/// task has been executed.
#[turbo_tasks::value(cell = "new")]
pub struct Completion;

impl Default for CompletionVc {
    fn default() -> Self {
        Self::new()
    }
}

#[turbo_tasks::value_impl]
impl CompletionVc {
    /// This will always be the same and never invalidates the reading task.
    #[turbo_tasks::function]
    pub fn immutable() -> Self {
        CompletionVc::cell(Completion)
    }
}

// no #[turbo_tasks::value_impl] to inline new into the caller task
// this ensures it's re-created on each execution
impl CompletionVc {
    /// This will always be a new completion and invalidates the reading task.
    pub fn new() -> Self {
        CompletionVc::cell(Completion)
    }

    /// Uses the previous completion. Can be used to cancel without triggering a
    /// new invalidation.
    pub fn unchanged() -> Self {
        // This is the same code that CompletionVc::cell uses except that it
        // only updates the cell when it is empty (CompletionVc::cell opted-out of
        // that via `#[turbo_tasks::value(cell = "new")]`)
        let cell = turbo_tasks::macro_helpers::find_cell_by_type(*COMPLETION_VALUE_TYPE_ID);
        cell.conditional_update_shared(|old| old.is_none().then_some(Completion));
        let raw: RawVc = cell.into();
        raw.into()
    }
}

#[turbo_tasks::value(transparent)]
pub struct Completions(Vec<CompletionVc>);

#[turbo_tasks::value_impl]
impl CompletionsVc {
    /// Merges multiple completions into one. The passed list will be part of
    /// the cache key, so this function should not be used with varying lists.
    ///
    /// Varying lists should use `CompletionsVc::cell(list).completed()`
    /// instead.
    #[turbo_tasks::function]
    pub fn all(completions: Vec<CompletionVc>) -> CompletionVc {
        CompletionsVc::cell(completions).completed()
    }

    /// Merges the list of completions into one.
    #[turbo_tasks::function]
    pub async fn completed(self) -> anyhow::Result<CompletionVc> {
        for c in self.await?.iter() {
            c.await?;
        }
        Ok(CompletionVc::new())
    }
}
