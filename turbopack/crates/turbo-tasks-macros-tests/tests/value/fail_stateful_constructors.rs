#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(unexpected_cfgs)]

#[turbo_tasks::value(cell = "stateful", operation)]
#[derive(Clone)]
struct Stateful { value: u32 }

fn main() {
    let _ = Stateful { value: 0 }.cell();
    let _ = Stateful { value: 0 }.resolved_cell();
}
