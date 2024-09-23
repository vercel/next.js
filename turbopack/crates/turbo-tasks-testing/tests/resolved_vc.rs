#![feature(arbitrary_self_types)]

use anyhow::Result;
use turbo_tasks::{ReadRef, ResolvedVc, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value]
struct Wrapper(u32);

#[tokio::test]
async fn test_conversion() -> Result<()> {
    run(&REGISTRATION, || async {
        let unresolved: Vc<u32> = Vc::cell(42);
        let resolved: ResolvedVc<u32> = unresolved.to_resolved().await?;
        let _: Vc<u32> = *resolved;
        let _: ReadRef<u32> = resolved.await?;
        let _: ReadRef<u32> = (&resolved).await?;
        let _: u32 = *resolved.await?;
        let _: u32 = *(&resolved).await?;
        Ok(())
    })
    .await
}

#[tokio::test]
async fn test_cell_construction() -> Result<()> {
    run(&REGISTRATION, || async {
        let a: ResolvedVc<u32> = ResolvedVc::cell(42);
        assert_eq!(*a.await?, 42);
        let b: ResolvedVc<Wrapper> = Wrapper(42).resolved_cell();
        assert_eq!(b.await?.0, 42);
        Ok(())
    })
    .await
}
