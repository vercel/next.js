#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use criterion::{Criterion, criterion_group, criterion_main};

pub(crate) mod gc;
pub(crate) mod overhead;
pub(crate) mod resident_storage;
pub(crate) mod scope_stress;
pub(crate) mod storage_locking;
pub(crate) mod stress;

criterion_group!(
    name = turbo_tasks_backend_stress;
    config = Criterion::default();
    targets = stress::fibonacci, scope_stress::scope_stress, overhead::overhead, gc::gc, storage_locking::storage_locking, resident_storage::resident_storage
);
criterion_main!(turbo_tasks_backend_stress);
