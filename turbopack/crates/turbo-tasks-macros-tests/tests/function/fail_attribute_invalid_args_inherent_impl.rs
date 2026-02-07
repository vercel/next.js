#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(unexpected_cfgs)]

use turbo_tasks::{ResolvedVc, Vc};

#[turbo_tasks::value]
struct ExampleStruct;

#[turbo_tasks::value(transparent)]
struct IntegersVec(Vec<ResolvedVc<u32>>);

#[turbo_tasks::value_impl]
impl ExampleStruct {
    #[turbo_tasks::function(invalid_argument)]
    fn return_contains_resolved_vc(self: Vc<Self>) -> Vc<IntegersVec> {
        Vc::cell(Vec::new())
    }
}

fn main() {
    // the macro should be error-tolerant and this function should still be created
    // despite the earlier compilation error, so this line should not also error
    let _ = ExampleStruct.cell().return_contains_resolved_vc();
}
