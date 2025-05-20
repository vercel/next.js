#![no_main]
#![feature(arbitrary_self_types_pointers)]

use libfuzzer_sys::fuzz_target;

use crate::graph::TaskSpec;

#[path = "../src/graph.rs"]
mod graph;

// Run with:
// cd turbopack/crates/turbo-tasks-backend
// cargo fuzz run fuzz_graph

fuzz_target!(init: register(), |data: Vec<TaskSpec>| {
    graph::run(data);
});

pub fn register() {
    turbo_tasks::register();
    include!(concat!(env!("OUT_DIR"), "/register_fuzz_graph.rs"));
}
