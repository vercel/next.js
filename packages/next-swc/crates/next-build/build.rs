use turbopack_binding::turbo::tasks_build::generate_register;
use vergen::{vergen, Config};

fn main() {
    generate_register();

    // Attempt to collect some build time env values but will skip if there are any
    // errors.
    let _ = vergen(Config::default());
}
