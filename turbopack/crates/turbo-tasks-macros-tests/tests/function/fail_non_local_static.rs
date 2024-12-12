#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(dead_code)]

use turbo_tasks::Vc;

#[turbo_tasks::value(transparent)]
struct IntegersVec(Vec<Vc<u32>>);

#[turbo_tasks::function(non_local_return)]
fn return_contains_unresolved_vc() -> Vc<IntegersVec> {
    Vc::cell(Vec::new())
}

fn main() {}
