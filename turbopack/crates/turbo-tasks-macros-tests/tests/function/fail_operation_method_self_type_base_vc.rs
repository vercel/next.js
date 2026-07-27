#![allow(dead_code)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(unexpected_cfgs)]

use turbo_tasks::Vc;

#[turbo_tasks::value]
struct Foobar;

#[turbo_tasks::value_impl]
impl Foobar {
    #[turbo_tasks::function(operation)]
    fn arbitrary_self_type_base_vc(self: Vc<Self>) -> Vc<()> {
        Vc::cell(())
    }
}

fn main() {}
