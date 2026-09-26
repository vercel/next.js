fn main() {
    println!("cargo:rerun-if-env-changed=EMNAPI_LINK_DIR");

    // `cargo check` does not link, and therefore does not need Emnapi's static
    // archive. The NAPI-RS CLI sets EMNAPI_LINK_DIR for real WASI builds.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("wasi")
        && std::env::var_os("EMNAPI_LINK_DIR").is_none()
    {
        return;
    }

    napi_build::setup();
}
