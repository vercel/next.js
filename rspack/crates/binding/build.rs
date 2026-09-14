fn main() {
    #[cfg(not(target_os = "macos"))]
    rspack_binding_build::setup();

    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-env-changed=DEBUG_GENERATED_CODE");
        println!("cargo:rerun-if-env-changed=TYPE_DEF_TMP_PATH");
        println!("cargo:rerun-if-env-changed=CARGO_CFG_NAPI_RS_CLI_VERSION");

        // napi-build emits an extra standalone "-Wl" flag on macOS, which
        // breaks when this workspace uses rust-lld as the linker.
        println!("cargo:rustc-cdylib-link-arg=-undefined");
        println!("cargo:rustc-cdylib-link-arg=dynamic_lookup");
    }
}
