#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use anyhow::Result;
use turbo_tasks::{IntoTraitRef, State, TraitRef, Upcast, Vc};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

// Test that with `cell = "shared"`, the cell will be re-used as long as the
// value is equal.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_trait_ref_shared_cell_mode() {
    run_once(&REGISTRATION, || async {
        let input = CellIdSelector {
            value: 42,
            cell_idx: State::new(0),
        }
        .cell();

        // create the task and compute it
        let counter_value_vc = shared_value_from_input(input);
        let trait_ref_a = counter_value_vc.into_trait_ref().await?;

        // invalidate the task, and pick a different cell id for the next execution
        input.await?.cell_idx.set_unconditionally(1);

        // recompute the task
        let trait_ref_b = counter_value_vc.into_trait_ref().await?;

        for trait_ref in [&trait_ref_a, &trait_ref_b] {
            assert_eq!(*TraitRef::cell(trait_ref.clone()).get_value().await?, 42);
        }

        // because we're using `cell = "shared"`, these trait refs must use the same
        // underlying Arc/SharedRef (by identity)
        assert!(TraitRef::ptr_eq(&trait_ref_a, &trait_ref_b));

        anyhow::Ok(())
    })
    .await
    .unwrap();
}

// Test that with `cell = "new"`, the cell will is never re-used, even if the
// value is equal.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_trait_ref_new_cell_mode() {
    run_once(&REGISTRATION, || async {
        let input = CellIdSelector {
            value: 42,
            cell_idx: State::new(0),
        }
        .cell();

        // create the task and compute it
        let counter_value_vc = new_value_from_input(input);
        let trait_ref_a = counter_value_vc.into_trait_ref().await?;

        // invalidate the task, and pick a different cell id for the next execution
        input.await?.cell_idx.set_unconditionally(1);

        // recompute the task
        let trait_ref_b = counter_value_vc.into_trait_ref().await?;

        for trait_ref in [&trait_ref_a, &trait_ref_b] {
            assert_eq!(*TraitRef::cell(trait_ref.clone()).get_value().await?, 42);
        }

        // because we're using `cell = "new"`, these trait refs must use different
        // underlying Arc/SharedRefs (by identity)
        assert!(!TraitRef::ptr_eq(&trait_ref_a, &trait_ref_b));

        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[turbo_tasks::value_trait]
trait ValueTrait {
    #[turbo_tasks::function]
    fn get_value(&self) -> Vc<usize>;
}

#[turbo_tasks::value(transparent, cell = "shared")]
struct SharedValue(usize);

#[turbo_tasks::value(transparent, cell = "new")]
struct NewValue(usize);

#[turbo_tasks::value_impl]
impl ValueTrait for SharedValue {
    #[turbo_tasks::function]
    fn get_value(&self) -> Vc<usize> {
        Vc::cell(self.0)
    }
}

#[turbo_tasks::value_impl]
impl ValueTrait for NewValue {
    #[turbo_tasks::function]
    fn get_value(&self) -> Vc<usize> {
        Vc::cell(self.0)
    }
}

#[turbo_tasks::value]
struct CellIdSelector {
    value: usize,
    cell_idx: State<usize>,
}

async fn value_from_input<T>(
    input: Vc<CellIdSelector>,
    mut cell_fn: impl FnMut(usize) -> Vc<T>,
) -> Result<Vc<Box<dyn ValueTrait>>>
where
    T: ValueTrait + Upcast<Box<dyn ValueTrait>>,
{
    let input = input.await?;

    // create multiple cells so that we can pick from them, simulating a function
    // with non-deterministic ordering that returns a "random" cell that happens to
    // contain the same value
    let mut upcast_vcs = Vec::new();
    for _idx in 0..2 {
        upcast_vcs.push(Vc::upcast_non_strict((cell_fn)(input.value)));
    }

    // pick a different cell idx upon each invalidation/execution
    let picked_vc = upcast_vcs[*input.cell_idx.get()];

    // round-trip through `TraitRef::cell`
    Ok(TraitRef::cell(picked_vc.into_trait_ref().await?))
}

#[turbo_tasks::function]
async fn shared_value_from_input(input: Vc<CellIdSelector>) -> Result<Vc<Box<dyn ValueTrait>>> {
    value_from_input::<SharedValue>(input, Vc::<SharedValue>::cell).await
}

#[turbo_tasks::function]
async fn new_value_from_input(input: Vc<CellIdSelector>) -> Result<Vc<Box<dyn ValueTrait>>> {
    value_from_input::<NewValue>(input, Vc::<NewValue>::cell).await
}
