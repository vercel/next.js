#![feature(arbitrary_self_types)]
#![allow(dead_code)]

use turbo_tasks::{ResolvedVc, Vc};

#[turbo_tasks::value]
struct ExampleStruct;

#[turbo_tasks::value(transparent, resolved)]
struct IntegersVec(Vec<ResolvedVc<u32>>);

#[turbo_tasks::value_impl]
impl ExampleStruct {
    #[turbo_tasks::function(resolved)]
    fn return_contains_resolved_vc(self: Vc<Self>) -> Vc<IntegersVec> {
        Vc::cell(Vec::new())
    }
}

fn main() {}
