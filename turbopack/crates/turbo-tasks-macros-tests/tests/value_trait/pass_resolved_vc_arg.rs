#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(dead_code)]
#![allow(unexpected_cfgs)]

use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};

// A trait whose methods accept `ResolvedVc<T>` arguments. The macro rewrites the
// external (exposed) signature so that `ResolvedVc<T>` arguments become `Vc<T>`,
// exactly like inherent and free functions.
#[turbo_tasks::value_trait]
trait MyTrait {
    #[turbo_tasks::function]
    fn from_resolved(&self, item: ResolvedVc<u32>) -> Vc<u32>;

    // Fully-qualified path and a nested `Vec<ResolvedVc<...>>` argument.
    #[turbo_tasks::function]
    fn from_resolved_vec(&self, items: Vec<turbo_tasks::ResolvedVc<u32>>) -> Vc<u32>;
}

#[turbo_tasks::value]
struct MyStruct;

#[turbo_tasks::value_impl]
impl MyTrait for MyStruct {
    #[turbo_tasks::function]
    fn from_resolved(&self, item: ResolvedVc<u32>) -> Vc<u32> {
        *item
    }

    #[turbo_tasks::function]
    fn from_resolved_vec(&self, items: Vec<turbo_tasks::ResolvedVc<u32>>) -> Vc<u32> {
        *items.into_iter().next().unwrap()
    }
}

#[allow(dead_code)]
async fn caller(s: Vc<MyStruct>) -> Result<()> {
    // The exposed trait methods accept `Vc<u32>` (not `ResolvedVc<u32>`) arguments.
    let _: Vc<u32> = s.from_resolved(Vc::cell(1));
    let _: Vc<u32> = s.from_resolved_vec(vec![Vc::cell(2), Vc::cell(3)]);
    Ok(())
}

fn main() {}
