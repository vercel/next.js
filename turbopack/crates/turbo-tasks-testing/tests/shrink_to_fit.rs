#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value(transparent)]
struct Wrapper(Vec<u32>);

#[tokio::test]
async fn test_shrink_to_fit() -> Result<()> {
    run(&REGISTRATION, || async {
        // `Vec::shrink_to_fit` is implicitly called when a cell is constructed.
        let a: Vc<Wrapper> = Vc::cell(Vec::with_capacity(100));
        assert_eq!(a.await?.capacity(), 0);

        let b: Vc<Wrapper> = Vc::local_cell(Vec::with_capacity(100));
        assert_eq!(b.await?.capacity(), 0);

        Ok(())
    })
    .await
}
