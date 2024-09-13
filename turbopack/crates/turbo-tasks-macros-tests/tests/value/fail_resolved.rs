#![feature(arbitrary_self_types)]

use turbo_tasks::Vc;

#[turbo_tasks::value(resolved)]
struct MyValue {
    value: Vc<i32>,
}

fn main() {
    let v = MyValue { value: Vc::cell(0) };
    let _ = v.value;
}
