#![feature(arbitrary_self_types)]

use anyhow::Result;
use turbo_tasks::{run_once, Completion, TryJoinIterExt, Vc};
use turbo_tasks_testing::{register, Registration};

static REGISTRATION: Registration = register!();

#[test]
fn rectangle_stress() {
    REGISTRATION.ensure_registered();
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async {
        let tt = REGISTRATION.create_turbo_tasks("scope_stress_rectangle_stress", true);
        let size = std::env::var("TURBOPACK_TEST_RECTANGLE_STRESS_SIZE")
            .map(|size| size.parse().unwrap())
            .unwrap_or(50);
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
            .await
            .unwrap();
    })
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
