#![feature(arbitrary_self_types)]
#![allow(dead_code)]

use turbo_tasks::Vc;

#[turbo_tasks::value]
struct ExampleStruct;

#[turbo_tasks::value(transparent)]
struct IntegersVec(Vec<Vc<u32>>);

#[turbo_tasks::value_impl]
impl ExampleStruct {
    #[turbo_tasks::function(resolved)]
    fn return_contains_unresolved_vc(self: Vc<Self>) -> Vc<IntegersVec> {
        Vc::cell(Vec::new())
    }
}

fn main() {}
