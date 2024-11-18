#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::time::Duration;

use turbo_tasks::Vc;
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

const COUNT1: u32 = 100;
const COUNT2: u32 = 2000;

#[tokio::test]
async fn many_calls_to_many_children() {
    if matches!(
        std::env::var("TURBOPACK_TEST_PERFORMANCE").ok().as_deref(),
        None | Some("") | Some("no") | Some("false")
    ) {
        println!("Skipping test, pass `TURBOPACK_TEST_PERFORMANCE=yes` to run it");
        return;
    }

    run(&REGISTRATION, || async {
        // The first call will actually execute many_children and its children.
        let start = std::time::Instant::now();
        calls_many_children(0).strongly_consistent().await?;
        println!("Initial call took {:?}", start.elapsed());

        // The second call will connect to the cached many_children, but it would be ok if that's
        // not yet optimized.
        let start = std::time::Instant::now();
        calls_many_children(1).strongly_consistent().await?;
        println!("Second call took {:?}", start.elapsed());

        // Susbsequent calls should be very fast.
        let start = std::time::Instant::now();
        for i in 2..COUNT1 {
            calls_many_children(i).strongly_consistent().await?;
        }
        let subsequent = start.elapsed();
        println!(
            "First {} subsequent calls took {:?}",
            COUNT1 - 2,
            subsequent
        );

        let start = std::time::Instant::now();
        for i in COUNT1..COUNT1 * 2 - 2 {
            calls_many_children(i).strongly_consistent().await?;
        }
        let subsequent2 = start.elapsed();
        println!(
            "Another {} subsequent calls took {:?}",
            COUNT1 - 2,
            subsequent2
        );

        let start = std::time::Instant::now();
        calls_many_children(COUNT1 - 1)
            .strongly_consistent()
            .await?;
        let final_call = start.elapsed();
        println!("Final call took {:?}", final_call);

        assert!(
            subsequent2 * 2 < subsequent * 3,
            "Performance should not regress with more calls"
        );

        assert!(
            subsequent < Duration::from_micros(100) * (COUNT1 - 2),
            "Each call should be less than 100µs"
        );

        assert!(
            subsequent2 < Duration::from_micros(100) * (COUNT1 - 2),
            "Each call should be less than 100µs"
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value]
struct Value {
    value: u32,
}

#[turbo_tasks::function]
async fn calls_many_children(_i: u32) -> Vc<()> {
    let _ = many_children();
    Vc::cell(())
}

#[turbo_tasks::function]
fn many_children() -> Vc<()> {
    for i in 0..COUNT2 {
        let _ = many_children_inner(i);
    }
    Vc::cell(())
}

#[turbo_tasks::function]
fn many_children_inner(_i: u32) -> Vc<()> {
    Vc::cell(())
}
