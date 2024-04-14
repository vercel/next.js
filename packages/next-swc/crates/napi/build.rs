extern crate napi_build;

fn main() {
    // Generates, stores build-time information as static values.
    // There are some places relying on correct values for this (i.e telemetry),
    // So failing build if this fails.
    shadow_rs::new().expect("Should able to generate build time information");

    napi_build::setup();

    // Resolve a potential linker issue for unit tests on linux
    // https://github.com/napi-rs/napi-rs/issues/1782
    #[cfg(all(target_os = "linux", not(target_arch = "wasm32")))]
    println!("cargo:rustc-link-arg=-Wl,--warn-unresolved-symbols");

    #[cfg(not(target_arch = "wasm32"))]
    turbopack_binding::turbo::tasks_build::generate_register();
}
