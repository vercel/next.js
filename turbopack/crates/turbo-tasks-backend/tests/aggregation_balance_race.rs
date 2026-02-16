#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)]

/// This test reliably produces a panic when run with
// ~/projects/next_2/next.js (aggregation_balance_race *$)$   cargo test -p turbo-tasks-backend
// --test aggregation_balance_race --features test_aggregation_race
use std::{future::Future, sync::Arc};

use anyhow::Result;
use tokio::sync::Notify;
use turbo_tasks::{Completion, ResolvedVc, State, TryJoinIterExt, Vc, run_once};
use turbo_tasks_testing::{Registration, register, run_with_tt};

static REGISTRATION: Registration = register!();

/// Races a future against a panic notification. Drops the future's value on success,
/// or bails if the panic event fires first.
async fn race_panic<T>(panic_event: &Notify, fut: impl Future<Output = Result<T>>) -> Result<()> {
    tokio::select! {
        biased;
        _ = panic_event.notified() => {
            anyhow::bail!("Worker thread panicked in aggregation update");
        }
        result = fut => {
            let _ = result?;
            Ok(())
        }
    }
}

#[turbo_tasks::value]
struct CrossLink {
    /// 0 = no cross-link, otherwise the coordinate of the interior node to link to.
    state: State<u32>,
}

/// Grid task with conditional cross-links.
#[turbo_tasks::function]
async fn grid(a: u32, b: u32, cross_link: Vc<CrossLink>) -> Result<Vc<Completion>> {
    if a > 0 {
        grid(a - 1, b, cross_link).await?;
    }
    if b > 0 {
        grid(a, b - 1, cross_link).await?;
    }
    // Cross-link to a different interior node each round
    let target = *cross_link.await?.state.get();
    if target > 0 && (a > target + 1 || b > target + 1) {
        grid(target, target, cross_link).await?;
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
    const GRID_SIZE: u32 = 20;
    const ROUNDS: usize = 100;

    // Install a panic hook to detect panics on worker threads.
    // The panic in aggregation_update happens inside task_execution_completed
    // on a tokio worker. tokio catches it via catch_unwind but turbotasks does not reliably
    // propagate panics from core infrastructure
    let panic_event = Arc::new(Notify::new());
    let prev_hook = std::panic::take_hook();
    let panic_event_clone = panic_event.clone();
    std::panic::set_hook(Box::new(move |info| {
        panic_event_clone.notify_waiters();
        prev_hook(info);
    }));

    let result = run_with_tt(&REGISTRATION, move |tt| {
        let panic_event = panic_event.clone();
        async move {
            let cross_link: ResolvedVc<CrossLink> = run_once(tt.clone(), async move {
                let t = CrossLink {
                    state: State::new(0),
                }
                .cell();
                t.to_resolved().await
            })
            .await?;

            let edge_coords: Vec<(u32, u32)> = (0..GRID_SIZE)
                .map(|a| (a, GRID_SIZE - 1))
                .chain((0..GRID_SIZE - 1).map(|b| (GRID_SIZE - 1, b)))
                .collect();

            // Establish initial grid
            race_panic(
                &panic_event,
                edge_coords
                    .iter()
                    .map(|&(a, b)| {
                        run_once(tt.clone(), async move {
                            grid(a, b, *cross_link).strongly_consistent().await?;
                            Ok(Vc::<()>::default())
                        })
                    })
                    .try_join(),
            )
            .await?;

            for round in 0..ROUNDS {
                // Set cross-link target to a different interior node each round
                let target = (round as u32 % (GRID_SIZE - 3)) + 1;
                race_panic(
                    &panic_event,
                    run_once(tt.clone(), async move {
                        cross_link.await?.state.set(target);
                        Ok(Vc::<()>::default())
                    }),
                )
                .await?;

                // Fire all reads concurrently
                let read_futs: Vec<_> = edge_coords
                    .iter()
                    .map(|&(a, b)| {
                        run_once(tt.clone(), async move {
                            grid(a, b, *cross_link).strongly_consistent().await?;
                            Ok(Vc::<()>::default())
                        })
                    })
                    .collect();

                // Immediately disable cross-links (while reads are still in progress!)
                race_panic(
                    &panic_event,
                    run_once(tt.clone(), async move {
                        cross_link.await?.state.set(0);
                        Ok(Vc::<()>::default())
                    }),
                )
                .await?;

                // Fire more reads while cleanup from cross-link is happening
                let read_futs2: Vec<_> = edge_coords
                    .iter()
                    .map(|&(a, b)| {
                        run_once(tt.clone(), async move {
                            grid(a, b, *cross_link).strongly_consistent().await?;
                            Ok(Vc::<()>::default())
                        })
                    })
                    .collect();

                // Wait for all reads from both batches
                race_panic(
                    &panic_event,
                    futures::future::try_join(
                        read_futs.into_iter().try_join(),
                        read_futs2.into_iter().try_join(),
                    ),
                )
                .await?;

                // Wait for all foreground jobs (including aggregation queue
                // processing) to complete before starting the next round
                tt.wait_foreground_done().await;
            }

            anyhow::Ok(())
        }
    })
    .await;

    // Restore the default panic hook
    let _ = std::panic::take_hook();

    result
}
