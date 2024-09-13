#![feature(arbitrary_self_types)]

use anyhow::Result;
use turbo_tasks::{ReadRef, ResolvedVc, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

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
