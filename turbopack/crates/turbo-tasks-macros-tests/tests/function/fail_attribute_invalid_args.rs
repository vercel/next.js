#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use turbo_tasks::{ResolvedVc, Vc};

#[turbo_tasks::value(transparent)]
struct IntegersVec(Vec<ResolvedVc<u32>>);

#[turbo_tasks::function(invalid_argument)]
fn return_contains_resolved_vc() -> Vc<IntegersVec> {
    Vc::cell(Vec::new())
}

fn main() {
    // the macro should be error-tolerent and this function should still be created
    // despite the earlier compilation error, so this line should not also error
    let _ = return_contains_resolved_vc();
}
