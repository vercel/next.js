use turbo_tasks_build::{generate_register, rerun_if_glob};
use vergen::{vergen, Config};

fn main() {
    generate_register();
    rerun_if_glob("tests/integration/*/*", "tests/integration");

    // Attempt to collect some build time env values but will skip if there are any
    // errors.
    let _ = vergen(Config::default());
}
