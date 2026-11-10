#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(dead_code)]
#![allow(unexpected_cfgs)]

use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};

#[derive(Clone)]
#[turbo_tasks::value]
struct ExampleStruct {
    value: u32,
}

#[turbo_tasks::value_impl]
impl ExampleStruct {
    // A function may return `ResolvedVc<Self>` directly. The macro rewrites the
    // external signature to `Vc<Self>`.
    #[turbo_tasks::function]
    fn constructor_resolved(value: u32) -> ResolvedVc<Self> {
        ExampleStruct { value }.resolved_cell()
    }

    // A function may also return `Result<ResolvedVc<Self>>`.
    #[turbo_tasks::function]
    fn constructor_resolved_result(value: u32) -> Result<ResolvedVc<Self>> {
        Ok(ExampleStruct { value }.resolved_cell())
    }

    // Fully-qualified `turbo_tasks::ResolvedVc<...>` is also accepted.
    #[turbo_tasks::function]
    fn constructor_resolved_qualified(value: u32) -> turbo_tasks::ResolvedVc<Self> {
        ExampleStruct { value }.resolved_cell()
    }
}

// A free function returning `ResolvedVc<T>`.
#[turbo_tasks::function]
fn free_resolved() -> ResolvedVc<u32> {
    ResolvedVc::cell(42)
}

// A free function returning `Result<ResolvedVc<T>>`.
#[turbo_tasks::function]
async fn free_resolved_result() -> Result<ResolvedVc<u32>> {
    Ok(ResolvedVc::cell(42))
}

#[allow(dead_code)]
async fn caller() -> Result<()> {
    // The external signature is rewritten to `Vc<...>`, so callers receive a `Vc`.
    let _: Vc<ExampleStruct> = ExampleStruct::constructor_resolved(1);
    let _: Vc<ExampleStruct> = ExampleStruct::constructor_resolved_result(2);
    let _: Vc<ExampleStruct> = ExampleStruct::constructor_resolved_qualified(3);
    let value: Vc<u32> = free_resolved();
    assert_eq!(*value.await?, 42);
    let _: Vc<u32> = free_resolved_result();
    Ok(())
}

fn main() {}
