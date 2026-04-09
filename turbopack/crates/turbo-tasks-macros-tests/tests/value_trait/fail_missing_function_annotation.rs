#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(unexpected_cfgs)]

use turbo_tasks::Vc;

#[turbo_tasks::value_trait]
trait MyTrait {
    fn item(&self) -> bool;

    #[turbo_tasks::function]
    fn item2(&self) -> Vc<bool>;

    #[turbo_tasks::function(operation)]
    fn item3(&self) -> Vc<bool>;
}

#[turbo_tasks::value]
struct MyStruct;

#[turbo_tasks::value_impl]
impl MyTrait for MyStruct {
    fn item(&self) -> bool {
        true
    }

    #[turbo_tasks::function]
    fn item2(&self) -> Vc<bool> {
        Vc::cell(true)
    }

    #[turbo_tasks::function]
    fn item3(&self) -> Vc<bool> {
        Vc::cell(true)
    }
}

fn expects_my_trait(_x: impl MyTrait) {}

fn main() {
    expects_my_trait(MyStruct {});
}
