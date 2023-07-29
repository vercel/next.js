use turbopack_binding::turbo::tasks_build::generate_register;

fn main() {
    // Generates, stores build-time information as static values.
    // There are some places relying on correct values for this (i.e telemetry),
    // So failing build if this fails.
    shadow_rs::new().expect("Should able to generate build time information");

    generate_register();
}
