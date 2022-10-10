#![feature(min_specialization)]

use criterion::{criterion_group, criterion_main};

pub(crate) mod stress;

criterion_group!(turbo_tasks_memory_stress, stress::fibonacci);
criterion_main!(turbo_tasks_memory_stress);

pub fn register() {
    turbo_tasks::register();
    include!(concat!(env!("OUT_DIR"), "/register_benches.rs"));
}
