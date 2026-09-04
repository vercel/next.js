#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use criterion::{Criterion, criterion_group, criterion_main};

pub(crate) mod gc;
pub(crate) mod overhead;
pub(crate) mod papaya_dirty;
pub(crate) mod papaya_map;
pub(crate) mod scope_stress;
pub(crate) mod storage_locking;
pub(crate) mod stress;

criterion_group!(
    name = turbo_tasks_backend_stress;
    config = Criterion::default();
    targets = stress::fibonacci, scope_stress::scope_stress, overhead::overhead, gc::gc, storage_locking::storage_locking, papaya_dirty::papaya_dirty, papaya_map::papaya_map
);
criterion_main!(turbo_tasks_backend_stress);
