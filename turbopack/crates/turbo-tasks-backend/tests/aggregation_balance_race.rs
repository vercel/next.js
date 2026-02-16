#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)]

use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use anyhow::Result;
use tokio::time::{Duration, timeout};
use turbo_tasks::{Completion, ResolvedVc, State, TryJoinIterExt, Vc, run_once};
use turbo_tasks_testing::{Registration, register, run_with_tt};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value]
struct Toggle {
    state: State<bool>,
}

/// Grid task with conditional cross-links.
#[turbo_tasks::function]
async fn grid(a: u32, b: u32, toggle: Vc<Toggle>) -> Result<Vc<Completion>> {
    if a > 0 {
        grid(a - 1, b, toggle).await?;
    }
    if b > 0 {
        grid(a, b - 1, toggle).await?;
    }
    // Toggle-dependent: link to shared interior node
    let should_cross = *toggle.await?.state.get();
    if should_cross && (a > 2 || b > 2) {
        grid(1, 1, toggle).await?;
    }
    Ok(Completion::new())
}

/// Reproduces a bug in `inner_of_uppers_lost_follower` where hierarchical
/// uppers in the same `upper_ids` list cause a double-remove of follower edges.
///
/// Requires feature `test_aggregation_race` on turbo-tasks-backend to inject
/// the sleep that widens the race window.
#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
async fn balance_edge_race() -> Result<()> {
    let grid_size: u32 = 14;

    // Install a panic hook to detect panics on worker threads.
    // The panic in aggregation_update happens inside task_execution_completed
    // on a tokio worker. tokio catches it via catch_unwind but the JoinHandle
    // is dropped (WorkerFuture::spawn in priority_runner.rs), so the panic is
    // silently swallowed and strongly_consistent() / run_once() hang forever.
    let panicked = Arc::new(AtomicBool::new(false));
    let prev_hook = std::panic::take_hook();
    let panicked_clone = panicked.clone();
    std::panic::set_hook(Box::new(move |info| {
        panicked_clone.store(true, Ordering::SeqCst);
        prev_hook(info);
    }));

    let result = run_with_tt(&REGISTRATION, move |tt| {
        let panicked = panicked.clone();
        async move {
            // Wrap everything in a timeout. If the backend panics,
            // run_once/strongly_consistent hang forever because the
            // task never completes (WorkerFuture JoinHandle is dropped).
            let panicked_inner = panicked.clone();
            let inner_result = timeout(Duration::from_secs(10), async move {
                let toggle: ResolvedVc<Toggle> = run_once(tt.clone(), async move {
                    let t = Toggle {
                        state: State::new(false),
                    }
                    .cell();
                    Ok(t.to_resolved().await?)
                })
                .await?;

                let edge_coords: Vec<(u32, u32)> = (0..grid_size)
                    .map(|a| (a, grid_size - 1))
                    .chain((0..grid_size - 1).map(|b| (grid_size - 1, b)))
                    .collect();

                // Establish initial grid
                let setup_futs: Vec<_> = edge_coords
                    .iter()
                    .map(|&(a, b)| {
                        let tt = tt.clone();
                        async move {
                            let _ = run_once(tt, async move {
                                grid(a, b, *toggle).strongly_consistent().await?;
                                Ok(Vc::<()>::default())
                            })
                            .await;
                            anyhow::Ok(())
                        }
                    })
                    .collect();
                setup_futs.into_iter().try_join().await?;

                for _round in 0..100 {
                    if panicked_inner.load(Ordering::SeqCst) {
                        anyhow::bail!(
                            "Worker thread panicked in aggregation update \
                             (inner_of_uppers_lost_follower)"
                        );
                    }

                    // Toggle on
                    let _ = run_once(tt.clone(), async move {
                        toggle.await?.state.set(true);
                        Ok(Vc::<()>::default())
                    })
                    .await?;

                    // Fire all reads concurrently
                    let read_futs: Vec<_> = edge_coords
                        .iter()
                        .map(|&(a, b)| {
                            let tt = tt.clone();
                            async move {
                                let _ = run_once(tt, async move {
                                    grid(a, b, *toggle).strongly_consistent().await?;
                                    Ok(Vc::<()>::default())
                                })
                                .await?;
                                anyhow::Ok(())
                            }
                        })
                        .collect();

                    // Immediately toggle off (while reads are still in progress!)
                    let _ = run_once(tt.clone(), async move {
                        toggle.await?.state.set(false);
                        Ok(Vc::<()>::default())
                    })
                    .await?;

                    // Fire more reads while cleanup from toggle-on is happening
                    let read_futs2: Vec<_> = edge_coords
                        .iter()
                        .map(|&(a, b)| {
                            let tt = tt.clone();
                            async move {
                                let _ = run_once(tt, async move {
                                    grid(a, b, *toggle).strongly_consistent().await?;
                                    Ok(Vc::<()>::default())
                                })
                                .await?;
                                anyhow::Ok(())
                            }
                        })
                        .collect();

                    // Wait for all reads from both batches
                    let _ = futures::future::try_join(
                        read_futs.into_iter().try_join(),
                        read_futs2.into_iter().try_join(),
                    )
                    .await;
                }

                anyhow::Ok(())
            })
            .await;

            match inner_result {
                Err(_elapsed) => {
                    if panicked.load(Ordering::SeqCst) {
                        anyhow::bail!(
                            "Worker thread panicked in aggregation update \
                             (inner_of_uppers_lost_follower)"
                        );
                    }
                    anyhow::bail!("Timed out waiting for test to complete");
                }
                Ok(result) => result,
            }
        }
    })
    .await;

    // Restore the default panic hook
    let _ = std::panic::take_hook();

    result
}
