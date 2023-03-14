use turbo_binding::turbo::tasks_build::{generate_register, rerun_if_glob};
use vergen::{vergen, Config};

fn main() {
    generate_register();

    // Attempt to collect some build time env values but will skip if there are any
    // errors.
    let _ = vergen(Config::default());
}
