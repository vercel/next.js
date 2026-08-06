#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use criterion::{Criterion, criterion_group, criterion_main};

pub(crate) mod overhead;
pub(crate) mod scope_stress;
pub(crate) mod stress;

criterion_group!(
    name = turbo_tasks_backend_stress;
    config = Criterion::default();
    targets = stress::fibonacci, scope_stress::scope_stress, overhead::overhead
);
criterion_main!(turbo_tasks_backend_stress);
