#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::{future::Future, time::Duration};

use turbo_tasks::{TransientInstance, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

const COUNT1: u32 = 100;
const COUNT2: u32 = 2000;

async fn run_test<F, T>(
    f: impl Fn() -> F + Sync + Send + Copy + 'static,
    limit: Duration,
) -> anyhow::Result<()>
where
    F: Future<Output = anyhow::Result<T>> + Sync + Send + 'static,
{
    // The first call will actually execute many_children and its children.
    let start = std::time::Instant::now();
    f().await?;
    println!("Initial call took {:?}", start.elapsed());

    // The second call will connect to the cached many_children, but it would be ok if that's
    // not yet optimized.
    let start = std::time::Instant::now();
    f().await?;
    println!("Second call took {:?}", start.elapsed());

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
    println!("Final call took {:?}", final_call);

    assert!(
        subsequent < limit * COUNT1,
        "Each call should be less than {:?}",
        limit
    );

    assert!(
        subsequent2 < limit * COUNT1,
        "Each call should be less than {:?}",
        limit
    );

    assert!(
        subsequent3 < limit * COUNT1,
        "Each call should be less than {:?}",
        limit
    );

    anyhow::Ok(())
}

#[tokio::test]
async fn many_calls_to_many_children() {
    // if matches!(
    //     std::env::var("TURBOPACK_TEST_PERFORMANCE").ok().as_deref(),
    //     None | Some("") | Some("no") | Some("false")
    // ) {
    //     println!("Skipping test, pass `TURBOPACK_TEST_PERFORMANCE=yes` to run it");
    //     return;
    // }

    run(&REGISTRATION, || {
        run_test(
            || calls_many_children(TransientInstance::new(()), None).strongly_consistent(),
            Duration::from_micros(100),
        )
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn many_calls_to_uncached_many_children() {
    // if matches!(
    //     std::env::var("TURBOPACK_TEST_PERFORMANCE").ok().as_deref(),
    //     None | Some("") | Some("no") | Some("false")
    // ) {
    //     println!("Skipping test, pass `TURBOPACK_TEST_PERFORMANCE=yes` to run it");
    //     return;
    // }

    run(&REGISTRATION, || {
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

#[turbo_tasks::value]
struct Value {
    value: u32,
}

#[turbo_tasks::function]
async fn calls_many_children(
    _i: TransientInstance<()>,
    j: Option<TransientInstance<()>>,
) -> Vc<()> {
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
