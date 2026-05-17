#![feature(arbitrary_self_types)]

// Force linking the static-dispatch providers — see the matching
// `extern crate` and dev-dep declaration on `turbo-tasks-backend`.
extern crate turbo_tasks_backend;

use criterion::{Criterion, criterion_group, criterion_main};

pub(crate) mod scope;

criterion_group!(
    name = turbo_tasks;
    config = Criterion::default();
    targets = scope::overhead
);
criterion_main!(turbo_tasks);
