#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::{run_once, Completion, TryJoinIterExt, Vc};
use turbo_tasks_testing::{register, run_with_tt, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread")]
async fn rectangle_stress() -> Result<()> {
    let size = std::env::var("TURBOPACK_TEST_RECTANGLE_STRESS_SIZE")
        .map(|size| size.parse().unwrap())
        .unwrap_or(50);
    run_with_tt(&REGISTRATION, move |tt| async move {
        (0..size)
            .map(|a| (a, size - 1))
            .chain((0..size - 1).map(|b| (size - 1, b)))
            .map(|(a, b)| {
                let tt = tt.clone();
                async move {
                    run_once(tt, async move {
                        rectangle(a, b).strongly_consistent().await?;
                        Ok(Vc::<()>::default())
                    })
                    .await
                }
            })
            .try_join()
            .await?;
        Ok(())
    })
    .await
}

/// This fills a rectagle from (0, 0) to (a, b) by
/// first filling (0, 0) to (a - 1, b) and then (0, 0) to (a, b - 1) recursively
#[turbo_tasks::function]
async fn rectangle(a: u32, b: u32) -> Result<Vc<Completion>> {
    if a > 0 {
        rectangle(a - 1, b).await?;
    }
    if b > 0 {
        rectangle(a, b - 1).await?;
    }
    Ok(Completion::new())
}
