#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value(transparent)]
struct Wrapper(Vec<u32>);

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_shrink_to_fit() -> Result<()> {
    run_once(&REGISTRATION, || async {
        #[turbo_tasks::function(operation, root)]
        async fn capacity_operation(wrapper: ResolvedVc<Wrapper>) -> Result<Vc<usize>> {
            Ok(Vc::cell(wrapper.await?.capacity()))
        }
        let a = ResolvedVc::<Wrapper>::cell(Vec::with_capacity(100));
        assert_eq!(*capacity_operation(a).read_strongly_consistent().await?, 0);
        Ok(())
    })
    .await
}
