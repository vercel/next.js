#![no_main]
#![feature(arbitrary_self_types_pointers)]

use libfuzzer_sys::fuzz_target;

use crate::graph::{TaskSpec, init};

#[path = "../src/graph.rs"]
mod graph;

// Run with:
// cd turbopack/crates/turbo-tasks-backend
// cargo fuzz run fuzz_graph -- -timeout=3 -print_pcs=1 -print_funcs=999999 -print_final_stats=1
// add --jobs=6 -workers=6 for parallel fuzzing

fuzz_target!(init: { init(); }, |data: Vec<TaskSpec>| {
    graph::run(data);
});
