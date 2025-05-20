#![feature(arbitrary_self_types_pointers)]

use afl::fuzz;

use crate::graph::{TaskSpec, run};

#[path = "../src/graph.rs"]
mod graph;

// Run with:
// cargo afl build --bin afl_graph
// AFL_AUTORESUME=1 cargo afl fuzz -i turbopack/crates/turbo-tasks-backend/fuzz/afl-in -o
// turbopack/crates/turbo-tasks-backend/fuzz/afl-out -- target/debug/afl_graph

fn main() {
    register();
    fuzz!(|data: Vec<TaskSpec>| {
        run(data);
    });
}

pub fn register() {
    turbo_tasks::register();
    include!(concat!(env!("OUT_DIR"), "/register_afl_graph.rs"));
}
