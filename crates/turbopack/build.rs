use turbo_tasks_build::{generate_register, rerun_if_glob};

fn main() {
    generate_register();
    // The test/snapshot crate need to be rebuilt if any snapshots are added.
    // Unfortunately, we can't have the build.rs file operate differently on
    // each file, so the entire turbopack crate needs to be rebuilt.
    rerun_if_glob("tests/snapshot/*/*");
}
