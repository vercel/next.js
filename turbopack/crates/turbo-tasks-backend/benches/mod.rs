#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use criterion::{criterion_group, criterion_main, Criterion};

pub(crate) mod scope_stress;
pub(crate) mod stress;

criterion_group!(
    name = turbo_tasks_memory_stress;
    config = Criterion::default();
    targets = stress::fibonacci, scope_stress::scope_stress
);
criterion_main!(turbo_tasks_memory_stress);

pub fn register() {
    turbo_tasks::register();
    include!(concat!(env!("OUT_DIR"), "/register_benches.rs"));
}
