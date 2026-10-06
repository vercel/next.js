#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(unexpected_cfgs)]

#[turbo_tasks::value(cell = "mutable", operation)]
#[derive(Clone)]
struct MutableValue { value: u32 }

fn main() {
    let _ = MutableValue { value: 0 }.cell();
    let _ = MutableValue { value: 0 }.resolved_cell();
}
