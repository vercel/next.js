#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![feature(ptr_metadata)]

use turbo_tasks::Vc;

#[turbo_tasks::value]
struct MyValue {
    value: Vc<i32>,
}

fn main() {
    let v = MyValue { value: Vc::cell(0) };
    let _ = v.value;
}
