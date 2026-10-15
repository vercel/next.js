use std::{fs, path::Path};

use serde_json::Value;

fn main() -> anyhow::Result<()> {
    println!("cargo:rerun-if-env-changed=CI");
    println!("cargo:rerun-if-env-changed=CARGO_CFG_TARGET_OS");

    // Version key for the persistent cache: `v<pkg version>-<git sha>` + git-dirty state.
    // The tool version + commit fully determines the transform/codegen behavior, so it is the
    // correct cache-invalidation key; mirrors `crates/next-napi-bindings/build.rs`.
    let pkg_version = {
        let package_json_path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../..")
            .join("packages/turbopack/package.json");
        println!("cargo:rerun-if-changed={}", package_json_path.display());
        let content = fs::read_to_string(&package_json_path)?;
        let json: Value = serde_json::from_str(&content)?;
        json["version"]
            .as_str()
            .expect("Expected a `version` string in packages/turbopack/package.json")
            .to_string()
    };
    println!("cargo:rustc-env=TURBOPACK_PKG_VERSION={pkg_version}");

    // `git describe`-style sha + dirty flag. `dirty(false)` = untracked files do NOT count toward
    // dirtiness (only tracked modifications), so scratch/untracked files never flip the cache to
    // the throwaway `temp` version or trigger spurious rebuilds.
    let cargo = vergen_gitcl::CargoBuilder::default()
        .target_triple(true)
        .build()?;
    let git = vergen_gitcl::GitclBuilder::default()
        .dirty(/* include_untracked */ false)
        .sha(/* short */ true)
        .build()?;
    vergen_gitcl::Emitter::default()
        .fail_on_error()
        .add_instructions(&cargo)?
        .add_instructions(&git)?
        .emit()?;

    let is_macos_target = std::env::var("CARGO_CFG_TARGET_OS").is_ok_and(|value| value == "macos");

    if !is_macos_target {
        napi_build::setup();
    }

    // napi always adds a GCC-specific flag on macOS; use dynamic lookup instead so the
    // Node symbols resolve at load time (mirrors crates/next-napi-bindings/build.rs).
    if is_macos_target {
        println!("cargo:rerun-if-env-changed=DEBUG_GENERATED_CODE");
        println!("cargo:rerun-if-env-changed=TYPE_DEF_TMP_PATH");
        println!("cargo:rerun-if-env-changed=CARGO_CFG_NAPI_RS_CLI_VERSION");
        println!("cargo:rustc-cdylib-link-arg=-undefined");
        println!("cargo:rustc-cdylib-link-arg=dynamic_lookup");
    }

    #[cfg(all(target_os = "linux", not(target_arch = "wasm32")))]
    println!("cargo:rustc-link-arg=-Wl,--warn-unresolved-symbols");

    Ok(())
}
