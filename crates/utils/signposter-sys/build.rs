use std::{env, path::PathBuf};

fn main() {
    if env::var("CARGO_CFG_TARGET_OS").unwrap() != "macos" {
        return;
    }

    let sdk_path = std::process::Command::new("xcrun")
        .arg("--show-sdk-path")
        .output()
        .expect("Failed to execute xcrun")
        .stdout;
    let sdk_path = std::str::from_utf8(&sdk_path).expect("Failed to parse xcrun output");
    let sdk_path = sdk_path.trim();
    println!("cargo:rustc-link-search={}/usr/lib/log", sdk_path);

    println!("cargo:rustc-link-lib=log_signpost");

    println!("cargo:rerun-if-changed=src/wrapper.h");

    let bindings = bindgen::Builder::default()
        .header("src/wrapper.h")
        .parse_callbacks(Box::new(bindgen::CargoCallbacks))
        .generate()
        .expect("Unable to generate bindings");

    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings
        .write_to_file(out_path.join("bindings.rs"))
        .expect("Couldn't write bindings!");
}
