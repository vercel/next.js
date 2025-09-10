#![feature(arbitrary_self_types_pointers)]

use afl::fuzz;

use crate::graph::{TaskSpec, init, run};

#[path = "../src/graph.rs"]
mod graph;

// Run with:
// cargo afl build --bin afl_graph
// AFL_AUTORESUME=1 cargo afl fuzz -i turbopack/crates/turbo-tasks-backend/fuzz/afl-in -o
// turbopack/crates/turbo-tasks-backend/fuzz/afl-out -- target/debug/afl_graph

fn main() {
    init();
    fuzz!(|data: Vec<TaskSpec>| {
        run(data);
    });
}
