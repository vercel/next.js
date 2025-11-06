#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use criterion::{Criterion, criterion_group, criterion_main};

pub(crate) mod scope;

criterion_group!(
    name = turbo_tasks;
    config = Criterion::default();
    targets = scope::overhead
);
criterion_main!(turbo_tasks);
