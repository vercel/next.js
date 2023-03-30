use turbo_binding::turbo::tasks_build::{generate_register, rerun_if_glob};

fn main() {
    generate_register();
    // The test/integration crate need to be rebuilt if any test input is changed.
    // Unfortunately, we can't have the build.rs file operate differently on
    // each file, so the entire next-dev crate needs to be rebuilt.
    rerun_if_glob("tests/integration/*/*", "tests/integration");
}
