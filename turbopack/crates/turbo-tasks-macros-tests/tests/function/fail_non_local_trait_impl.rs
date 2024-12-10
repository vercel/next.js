#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(dead_code)]

use turbo_tasks::Vc;

#[turbo_tasks::value]
struct ExampleStruct;

#[turbo_tasks::value(transparent)]
struct IntegersVec(Vec<Vc<u32>>);

#[turbo_tasks::value_trait]
trait ExampleTrait {
    fn return_contains_unresolved_vc(self: Vc<Self>) -> Vc<IntegersVec>;
}

#[turbo_tasks::value_impl]
impl ExampleTrait for ExampleStruct {
    #[turbo_tasks::function(non_local_return)]
    fn return_contains_unresolved_vc(self: Vc<Self>) -> Vc<IntegersVec> {
        Vc::cell(Vec::new())
    }
}

fn main() {}
