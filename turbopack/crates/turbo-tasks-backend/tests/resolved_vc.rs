#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::{ReadRef, ResolvedVc, Vc, read};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value]
struct Wrapper(u32);

#[turbo_tasks::function]
fn returns_int(value: u32) -> Vc<u32> {
    Vc::cell(value)
}

#[turbo_tasks::function]
fn assert_resolved(input: ResolvedVc<u32>) {
    // double-check that this `ResolvedVc` is *actually* resolved
    let input_vc: Vc<u32> = *input;
    assert!(input_vc.is_resolved());
}

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_conversion() -> Result<()> {
    // pass a nonce to re-run the test body on every turbo-tasks restart
    let mut nonce = 0;
    run_once(&REGISTRATION, move || {
        nonce += 1;
        async move {
            #[turbo_tasks::function(operation, root)]
            async fn test_operation(nonce: u32) -> Result<Vc<()>> {
                let _ = nonce; // ensure the nonce is part of our cache key
                let unresolved: Vc<u32> = Vc::cell(42);
                let resolved: ResolvedVc<u32> = read!(unresolved.to_resolved())?;
                let _: Vc<u32> = *resolved;
                let _: ReadRef<u32> = read!(resolved)?;
                let _: ReadRef<u32> = read!(&resolved)?;
                let _: u32 = *read!(resolved)?;
                let _: u32 = *read!(&resolved)?;
                Ok(Vc::cell(()))
            }
            test_operation(nonce).read_strongly_consistent().await
        }
    })
    .await
}

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_cell_construction() -> Result<()> {
    let mut nonce = 0;
    run_once(&REGISTRATION, move || {
        nonce += 1;
        async move {
            #[turbo_tasks::function(operation, root)]
            async fn test_operation(nonce: u32) -> Result<Vc<()>> {
                let _ = nonce;
                let a: ResolvedVc<u32> = ResolvedVc::cell(42);
                assert_eq!(*read!(a)?, 42);
                let b: ResolvedVc<Wrapper> = Wrapper(42).resolved_cell();
                assert_eq!(read!(b)?.0, 42);
                Ok(Vc::cell(()))
            }
            test_operation(nonce).read_strongly_consistent().await
        }
    })
    .await
}

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_resolved_vc_as_arg() -> Result<()> {
    let mut nonce = 0;
    run_once(&REGISTRATION, move || {
        nonce += 1;
        async move {
            #[turbo_tasks::function(operation, root)]
            async fn test_operation(nonce: u32) -> Result<Vc<()>> {
                dbg!(nonce);
                let _ = nonce;
                let unresolved: Vc<u32> = returns_int(42);
                assert!(!unresolved.is_resolved());
                // calling a function should cause it's arguments to get resolved automatically
                read!(assert_resolved(unresolved))?;
                Ok(Vc::cell(()))
            }
            test_operation(nonce).read_strongly_consistent().await
        }
    })
    .await
}

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_into_future() -> Result<()> {
    let mut nonce = 0;
    run_once(&REGISTRATION, move || {
        nonce += 1;
        async move {
            #[turbo_tasks::function(operation, root)]
            async fn test_operation(nonce: u32) -> Result<Vc<()>> {
                let _ = nonce;
                let mut resolved = ResolvedVc::cell(42);
                let _: ReadRef<u32> = read!(resolved)?;
                let _: ReadRef<u32> = read!(&resolved)?;
                let _: ReadRef<u32> = read!(&mut resolved)?;
                let mut unresolved = Vc::cell(42);
                let _: ReadRef<u32> = read!(unresolved)?;
                let _: ReadRef<u32> = read!(&unresolved)?;
                let _: ReadRef<u32> = read!(&mut unresolved)?;
                Ok(Vc::cell(()))
            }
            test_operation(nonce).read_strongly_consistent().await
        }
    })
    .await
}

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_sidecast() -> Result<()> {
    run_once(&REGISTRATION, || async {
        let concrete_value = ImplementsAAndB.resolved_cell();
        let as_a = ResolvedVc::upcast::<Box<dyn TraitA>>(concrete_value);
        let as_b = ResolvedVc::try_sidecast::<Box<dyn TraitB>>(as_a);
        assert!(as_b.is_some());
        let as_c = ResolvedVc::try_sidecast::<Box<dyn TraitC>>(as_a);
        assert!(as_c.is_none());
        Ok(())
    })
    .await
}

#[turbo_tasks::value_trait]
trait TraitA {}

#[turbo_tasks::value_trait]
trait TraitB {}

#[turbo_tasks::value_trait]
trait TraitC {}

#[turbo_tasks::value]
struct ImplementsAAndB;

#[turbo_tasks::value_impl]
impl TraitA for ImplementsAAndB {}

#[turbo_tasks::value_impl]
impl TraitB for ImplementsAAndB {}
