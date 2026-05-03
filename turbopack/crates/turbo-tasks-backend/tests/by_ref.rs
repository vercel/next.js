// Functions that declare arguments as `&T` exercise the by-reference branch of the
// `#[turbo_tasks::function]` macro. The macro:
//   1. exposes the function with the owned argument type (callers still pass owned),
//   2. emits an inline closure that takes `&T` and skips the per-execution arg clone,
//   3. routes the call through the by-ref blanket impls in `task_fn_impl!`.
//
// This test pins all three behaviors with `Vec<u32>` arguments — large enough that an
// accidental clone would actually do work, and a different shape (slice access, iteration)
// from the methods on `Vc` types that the rest of the suite covers.

#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)]

use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_by_ref() {
    run_once(&REGISTRATION, || async {
        test_by_ref_operation().read_strongly_consistent().await
    })
    .await
    .unwrap()
}

#[turbo_tasks::function(operation)]
async fn test_by_ref_operation() -> Result<Vc<()>> {
    // `sum_by_ref` takes its `Vec<u32>` by reference; callers still pass an owned Vec
    // (the cache key is built from owned values).
    let items = vec![1u32, 2, 3, 4, 5];
    assert_eq!(*sum_by_ref(items.clone()).await?, 15);

    // Cache hit: same input, same answer, no re-execution.
    assert_eq!(*sum_by_ref(items.clone()).await?, 15);

    // Different input, recomputed.
    assert_eq!(*sum_by_ref(vec![10u32, 20, 30]).await?, 60);

    // Mixed signature: one by-value `u32`, one by-ref `Vec<u32>`. Confirms the macro
    // shadow-clones only the by-value param and leaves the `&Vec` borrow alone.
    assert_eq!(*scaled_sum(2, vec![1u32, 2, 3]).await?, 12);

    // Method receiver + by-ref `Vec<u32>` — exercises the with-this by-ref impls.
    let counter = Counter { base: 100 }.cell();
    assert_eq!(*counter.add_all(vec![1u32, 2, 3]).await?, 106);

    // Regression: `&T` parameters whose `T` goes through `FromTaskInput` (e.g.
    // `ResolvedVc<…>`, `Vec<ResolvedVc<…>>`, `Option<ResolvedVc<…>>`). Before the macro
    // learned to borrow-cast cached `T::TaskInput` to `&T`, the runtime panicked at
    // `downcast_args_ref` because the cache stored `Vec<Vc<T>>` while the body asked
    // for `Vec<ResolvedVc<T>>`.
    // The exposed signature still takes the unwrapped form (`Vc<T>`,
    // `Vec<Vc<T>>`, `Option<Vc<T>>`), so callers pass owned `Vc`s — exactly the form the
    // cache key is built from.
    let a = ItemValue { v: 1 }.cell();
    let b = ItemValue { v: 4 }.cell();
    assert_eq!(*sum_resolved_items(vec![a, b]).await?, 5);
    assert_eq!(*one_resolved_item(a).await?, 1);
    assert_eq!(*maybe_resolved_item(Some(b)).await?, 4);
    assert_eq!(*maybe_resolved_item(None).await?, 0);

    Ok(Vc::cell(()))
}

#[turbo_tasks::function]
async fn sum_by_ref(items: &Vec<u32>) -> Vc<u32> {
    // Body sees `&Vec<u32>` directly — no clone in `get_args`, no shadow rebind.
    let sum: u32 = items.iter().sum();
    Vc::cell(sum)
}

#[turbo_tasks::function]
async fn scaled_sum(scale: u32, items: &Vec<u32>) -> Vc<u32> {
    // `scale` is owned in the body (the macro inserts `let scale = scale.clone();`),
    // `items` stays as `&Vec<u32>`.
    let sum: u32 = items.iter().map(|x| x * scale).sum();
    Vc::cell(sum)
}

#[turbo_tasks::value]
struct Counter {
    base: u32,
}

#[turbo_tasks::value_impl]
impl Counter {
    #[turbo_tasks::function]
    async fn add_all(&self, items: &Vec<u32>) -> Vc<u32> {
        // `self` deref'd via the `&Recv` receiver; `items` borrowed straight out of the
        // cached args. If by-ref were silently broken, this body would still compile but
        // the `task_fn` registration would fail at startup.
        let sum: u32 = items.iter().sum();
        Vc::cell(self.base + sum)
    }
}

#[turbo_tasks::value]
struct ItemValue {
    v: u32,
}

// `&Vec<ResolvedVc<…>>`: the cache stores `Vec<Vc<T>>` (post-`FromTaskInput`),
// so the macro has to borrow-cast it back to `&Vec<ResolvedVc<T>>` for the body.
#[turbo_tasks::function]
async fn sum_resolved_items(items: &Vec<ResolvedVc<ItemValue>>) -> Result<Vc<u32>> {
    let mut total = 0u32;
    for item in items {
        total += item.await?.v;
    }
    Ok(Vc::cell(total))
}

// `&ResolvedVc<…>` directly: same case at the leaf.
#[turbo_tasks::function]
async fn one_resolved_item(item: &ResolvedVc<ItemValue>) -> Result<Vc<u32>> {
    Ok(Vc::cell(item.await?.v))
}

// `&Option<ResolvedVc<…>>`: the macro has to borrow-cast through the `Option` wrapper.
#[turbo_tasks::function]
async fn maybe_resolved_item(item: &Option<ResolvedVc<ItemValue>>) -> Result<Vc<u32>> {
    Ok(Vc::cell(match item {
        Some(item) => item.await?.v,
        None => 0,
    }))
}
