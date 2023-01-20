use turbo_tasks_build::rerun_if_glob;

fn main() {
    // The test/integration crate need to be rebuilt if any test input is changed.
    // Unfortunately, we can't have the build.rs file operate differently on
    // each file, so the entire next-dev crate needs to be rebuilt.
    rerun_if_glob("tests/integration/*/*", "tests/integration");
}
