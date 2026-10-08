#![feature(arbitrary_self_types)]

use criterion::{Criterion, criterion_group, criterion_main};

pub(crate) mod message_queue;
pub(crate) mod scope;

criterion_group!(
    name = turbo_tasks;
    config = Criterion::default();
    targets = scope::overhead, message_queue::history_replay
);
criterion_main!(turbo_tasks);
