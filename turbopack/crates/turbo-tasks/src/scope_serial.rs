//! Serial fallback for [`crate::scope`] used in no-tokio (`sync`) builds.
//!
//! The tokio version runs scoped tasks across a worker pool; without an async
//! runtime we just run each spawned closure immediately on the current thread and
//! collect the results in spawn order. The public API (`scope_and_block` + `Scope`
//! with `spawn`) matches the tokio version so callers are unchanged.

use std::{cell::RefCell, marker::PhantomData};

pub struct Scope<'scope, 'env: 'scope, R: Send + 'env> {
    results: RefCell<Vec<R>>,
    scope: PhantomData<&'scope ()>,
    // Invariance over 'env, matching the tokio implementation.
    env: PhantomData<&'env mut &'env ()>,
}

impl<'scope, 'env: 'scope, R: Send + 'env> Scope<'scope, 'env, R> {
    /// Runs `f` immediately on the current thread and records its result.
    pub fn spawn<F>(&self, f: F)
    where
        F: FnOnce() -> R + Send + 'env,
    {
        self.results.borrow_mut().push(f());
    }
}

/// Runs `f` (which spawns work into the scope) and returns the spawned results in
/// order. Serial: each `spawn` runs immediately. `number_of_tasks` is ignored (it's
/// only a capacity hint for the parallel version).
pub fn scope_and_block<'env, F, R>(number_of_tasks: usize, f: F) -> impl Iterator<Item = R>
where
    R: Send + 'env,
    F: for<'scope> FnOnce(&'scope Scope<'scope, 'env, R>) + 'env,
{
    let _ = number_of_tasks;
    let scope = Scope {
        results: RefCell::new(Vec::new()),
        scope: PhantomData,
        env: PhantomData,
    };
    f(&scope);
    scope.results.into_inner().into_iter()
}
