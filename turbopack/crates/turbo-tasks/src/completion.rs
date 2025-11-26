use anyhow::Result;

use crate::{self as turbo_tasks, ResolvedVc, TryJoinIterExt, Vc};

/// Just an empty type, but it's never equal to itself.
///
/// [`Vc<Completion>`] can be used as return value instead of `()` to have a concrete reference that
/// can be awaited. It will invalidate the awaiting task everytime the referenced task has been
/// executed.
///
/// Note: [`PartialEq`] is not implemented since it doesn't make sense to compare `Completion` this
/// way. You probably want to use [`ReadRef::ptr_eq`][crate::ReadRef::ptr_eq] instead.
#[turbo_tasks::value(cell = "new", eq = "manual")]
#[derive(Debug)]
pub struct Completion;

#[turbo_tasks::value_impl]
impl Completion {
    /// This will always be the same and never invalidates the reading task.
    #[turbo_tasks::function]
    pub fn immutable() -> Vc<Self> {
        Completion::cell(Completion)
    }
}

// no #[turbo_tasks::value_impl] to inline new into the caller task
// this ensures it's re-created on each execution
impl Completion {
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
                .map(|&c| async move {
                    // Wraps the completion in a new completion. This makes it cheaper to restore
                    // since it doesn't need to restore the original task resp task chain.
                    wrap(*c).await?;
                    Ok(())
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
