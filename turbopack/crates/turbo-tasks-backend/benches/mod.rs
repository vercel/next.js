#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use criterion::{Criterion, criterion_group, criterion_main};

pub(crate) mod aggregation_churn;
pub(crate) mod aggregation_queue;
pub(crate) mod batch_lookup;
pub(crate) mod cell_fan_out;
pub(crate) mod collectibles;
pub(crate) mod gc;
pub(crate) mod overhead;
pub(crate) mod scope_stress;
pub(crate) mod state_fan_out;
pub(crate) mod stress;

criterion_group!(
    name = turbo_tasks_backend_stress;
    config = Criterion::default();
    targets = stress::fibonacci, scope_stress::scope_stress, overhead::overhead, gc::gc,
        cell_fan_out::cell_fan_out, state_fan_out::state_fan_out, collectibles::collectibles,
        batch_lookup::batch_lookup, aggregation_churn::aggregation_churn,
        aggregation_queue::aggregation_queue
);
criterion_main!(turbo_tasks_backend_stress);
