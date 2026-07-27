#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::{future::Future, time::Duration};

use anyhow::Result;
use turbo_tasks::{TransientInstance, Vc};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

const COUNT1: u32 = 100;
const COUNT2: u32 = 2000;

async fn run_test<F, T>(
    f: impl Fn() -> F + Sync + Send + Clone + 'static,
    limit: Duration,
) -> anyhow::Result<()>
where
    F: Future<Output = anyhow::Result<T>> + Sync + Send + 'static,
{
    // The first call will actually execute everything.
    let start = std::time::Instant::now();
    f().await?;
    println!("Initial call took {:?}", start.elapsed());

    let mut warmup_calls = Vec::new();

    for _ in 0..10 {
        let start = std::time::Instant::now();
        f().await?;
        let warmup_call = start.elapsed();
        println!("Subsequent call took {warmup_call:?}");
        warmup_calls.push(warmup_call);
    }

    // Susbsequent calls should be very fast.
    let start = std::time::Instant::now();
    for _ in 0..COUNT1 {
        f().await?;
    }
    let subsequent = start.elapsed();
    println!(
        "First {} subsequent calls took {:?} ({:?} per call)",
        COUNT1,
        subsequent,
        subsequent / COUNT1
    );

    let start = std::time::Instant::now();
    for _ in 0..COUNT1 {
        f().await?;
    }
    let subsequent2 = start.elapsed();
    println!(
        "Another {} subsequent calls took {:?} ({:?} per call)",
        COUNT1,
        subsequent2,
        subsequent2 / COUNT1
    );

    let start = std::time::Instant::now();
    for _ in 0..COUNT1 {
        f().await?;
    }
    let subsequent3 = start.elapsed();
    println!(
        "Another {} subsequent calls took {:?} ({:?} per call)",
        COUNT1,
        subsequent3,
        subsequent3 / COUNT1
    );

    if subsequent2 * 2 > subsequent * 3 || subsequent3 * 2 > subsequent * 3 {
        // Performance regresses with more calls
        // Check if this fixes itself eventually
        for i in 0.. {
            let start = std::time::Instant::now();
            for _ in 0..COUNT1 {
                f().await?;
            }
            let subsequent4 = start.elapsed();
            println!(
                "Another {} subsequent calls took {:?} ({:?} per call)",
                COUNT1,
                subsequent4,
                subsequent4 / COUNT1
            );
            if subsequent4 * 2 < subsequent * 3 {
                break;
            }
            if i >= 20 {
                panic!("Performance regressed with more calls");
            }
        }
    }

    let start = std::time::Instant::now();
    f().await?;
    let final_call = start.elapsed();
    println!("Final call took {final_call:?}");

    let target = subsequent / COUNT1;

    for (i, warmup_call) in warmup_calls.into_iter().enumerate() {
        assert!(
            warmup_call < target * 10,
            "Warmup call {} should be less than {:?}",
            i,
            target * 10
        );
    }

    assert!(
        subsequent < limit * COUNT1,
        "Each call should be less than {limit:?}"
    );

    assert!(
        subsequent2 < limit * COUNT1,
        "Each call should be less than {limit:?}"
    );

    assert!(
        subsequent3 < limit * COUNT1,
        "Each call should be less than {limit:?}"
    );

    anyhow::Ok(())
}

fn check_skip() -> bool {
    if matches!(
        std::env::var("TURBOPACK_TEST_PERFORMANCE").ok().as_deref(),
        None | Some("") | Some("no") | Some("false")
    ) {
        println!("Skipping test, pass `TURBOPACK_TEST_PERFORMANCE=yes` to run it");
        return true;
    }

    false
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn many_calls_to_many_children() {
    if check_skip() {
        return;
    }
    run_once(&REGISTRATION, || {
        run_test(
            || calls_many_children(TransientInstance::new(()), None).strongly_consistent(),
            Duration::from_micros(100),
        )
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn many_calls_to_uncached_many_children() {
    if check_skip() {
        return;
    }
    run_once(&REGISTRATION, || {
        run_test(
            || {
                calls_many_children(TransientInstance::new(()), Some(TransientInstance::new(())))
                    .strongly_consistent()
            },
            Duration::from_micros(100) * COUNT2,
        )
    })
    .await
    .unwrap();
}

fn run_big_graph_test(counts: Vec<u32>) -> impl Future<Output = Result<()>> + Send + 'static {
    println!(
        "Graph {:?} = {} tasks",
        counts,
        (1..=counts.len())
            .map(|i| counts.iter().take(i).product::<u32>())
            .sum::<u32>()
    );
    run_test(
        move || calls_big_graph(counts.clone(), TransientInstance::new(())).strongly_consistent(),
        Duration::from_micros(100),
    )
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn many_calls_to_big_graph_1() {
    if check_skip() {
        return;
    }
    run_once(&REGISTRATION, || run_big_graph_test(vec![5, 8, 10, 15, 20]))
        .await
        .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn many_calls_to_big_graph_2() {
    if check_skip() {
        return;
    }
    run_once(&REGISTRATION, || {
        run_big_graph_test(vec![2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2])
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn many_calls_to_big_graph_3() {
    if check_skip() {
        return;
    }
    run_once(&REGISTRATION, || run_big_graph_test(vec![1000, 3, 3, 3, 3]))
        .await
        .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn many_calls_to_big_graph_4() {
    if check_skip() {
        return;
    }
    run_once(&REGISTRATION, || run_big_graph_test(vec![3, 3, 3, 3, 1000]))
        .await
        .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn many_calls_to_big_graph_5() {
    if check_skip() {
        return;
    }
    run_once(&REGISTRATION, || {
        run_big_graph_test(vec![10, 10, 10, 10, 10])
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn many_calls_to_big_graph_6() {
    if check_skip() {
        return;
    }
    run_once(&REGISTRATION, || {
        run_big_graph_test(vec![2, 2, 2, 1000, 2, 2, 2])
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn many_calls_to_big_graph_7() {
    if check_skip() {
        return;
    }
    run_once(&REGISTRATION, || {
        run_big_graph_test(vec![
            1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 3, 1, 1, 1, 3, 2, 1, 1, 1, 1, 5, 1, 1, 1, 200, 2, 1,
            1, 1, 1, 1, 1, 1, 1, 1,
        ])
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn many_calls_to_big_graph_8() {
    if check_skip() {
        return;
    }
    run_once(&REGISTRATION, || {
        run_big_graph_test(vec![200, 2, 2, 2, 2, 200])
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn many_calls_to_big_graph_9() {
    if check_skip() {
        return;
    }
    run_once(&REGISTRATION, || {
        run_big_graph_test(vec![10000, 1, 1, 2, 1, 1, 2, 2, 1, 1, 1, 1])
    })
    .await
    .unwrap();
}

#[turbo_tasks::value]
struct Value {
    value: u32,
}

#[turbo_tasks::function]
fn calls_many_children(i: TransientInstance<()>, j: Option<TransientInstance<()>>) -> Vc<()> {
    let _ = i;
    let _ = many_children(j);
    Vc::cell(())
}

#[turbo_tasks::function]
fn many_children(_j: Option<TransientInstance<()>>) -> Vc<()> {
    for i in 0..COUNT2 {
        let _ = many_children_inner(i);
    }
    Vc::cell(())
}

#[turbo_tasks::function]
fn many_children_inner(_i: u32) -> Vc<()> {
    Vc::cell(())
}

#[turbo_tasks::function]
fn calls_big_graph(mut counts: Vec<u32>, i: TransientInstance<()>) -> Vc<()> {
    let _ = i;
    counts.reverse();
    let _ = big_graph(counts, vec![]);
    Vc::cell(())
}

#[turbo_tasks::function]
fn big_graph(mut counts: Vec<u32>, keys: Vec<u32>) -> Vc<()> {
    let Some(count) = counts.pop() else {
        return Vc::cell(());
    };
    for i in 0..count {
        let new_keys = keys.iter().copied().chain(std::iter::once(i)).collect();
        let _ = big_graph(counts.clone(), new_keys);
    }
    Vc::cell(())
}
