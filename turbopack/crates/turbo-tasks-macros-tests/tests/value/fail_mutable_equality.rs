#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(unexpected_cfgs)]

use turbo_tasks::MutableCell;

#[turbo_tasks::value(cell = "mutable", operation, eq = "manual")]
#[derive(Clone)]
struct NoEquality { value: u32 }

fn writes_require_equality(cell: MutableCell<NoEquality>) {
    let _ = cell.set(NoEquality { value: 1 });
    let _ = cell.update(|value| value.value += 1);
}

fn main() {}
