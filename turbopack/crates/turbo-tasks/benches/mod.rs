#![feature(arbitrary_self_types)]

use criterion::{Criterion, criterion_group, criterion_main};

pub(crate) mod join_iter_ext;
pub(crate) mod scope;

criterion_group!(
    name = turbo_tasks;
    config = Criterion::default();
    targets = join_iter_ext::benchmark, scope::overhead
);
criterion_main!(turbo_tasks);
