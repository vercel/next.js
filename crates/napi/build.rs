use std::{env, fs, path::Path, process::Command, str};

use serde_json::Value;

extern crate napi_build;

fn main() -> anyhow::Result<()> {
    println!("cargo:rerun-if-env-changed=CI");
    let is_ci = env::var("CI").is_ok_and(|value| !value.is_empty());

    let nextjs_version = {
        let package_json_path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join("packages/next/package.json");

        println!("cargo:rerun-if-changed={}", package_json_path.display());

        let package_json_content = fs::read_to_string(&package_json_path)?;
        let package_json: Value = serde_json::from_str(&package_json_content)?;

        package_json["version"]
            .as_str()
            .expect("Expected a Next.js `version` string in its package.json")
            .to_string()
    };

    // Make the Next.js version available as a build-time environment variable
    println!("cargo:rustc-env=NEXTJS_VERSION={nextjs_version}");

    // Generates, stores build-time information as static values.
    // There are some places relying on correct values for this (i.e telemetry),
    // So failing build if this fails.
    let cargo = vergen_gitcl::CargoBuilder::default()
        .target_triple(true)
        .build()?;
    // We use the git dirty state to disable filesystem cache (filesystem cache relies on a
    // commit hash to be safe). One tradeoff of this is that we must invalidate the rust build more
    // often.
    //
    // This invalidates the build if any untracked files change. That's sufficient for the case
    // where we transition from dirty to clean.
    //
    // There's an edge-case here where the repository could be newly dirty, but we can't know
    // because our build hasn't been invalidated, since the untracked files weren't untracked last
    // time we ran. That will cause us to incorrectly report ourselves as clean.
    //
    // However, in practice that shouldn't be much of an issue: If no other dependency of this
    // top-level crate has changed (which would've triggered our rebuild), then the resulting binary
    // must be equivalent to a clean build anyways. Therefore, filesystem cache using the HEAD
    // commit hash as a version is okay.
    let git = vergen_gitcl::GitclBuilder::default()
        .dirty(/* include_untracked */ true)
        .describe(
            /* tags */ true,
            /* dirty */ !is_ci, // suppress the dirty suffix in CI
            /* matches */ Some("v[0-9]*"), // find the last version tag
        )
        .build()?;
    vergen_gitcl::Emitter::default()
        .add_instructions(&cargo)?
        .add_instructions(&git)?
        .fail_on_error()
        .emit()?;

    match Command::new("git").args(["rev-parse", "HEAD"]).output() {
        Ok(out) if out.status.success() => println!(
            "cargo:warning=git HEAD: {}",
            str::from_utf8(&out.stdout).unwrap()
        ),
        _ => println!("cargo:warning=`git rev-parse HEAD` failed"),
    }

    #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
    napi_build::setup();

    // This is a workaround for napi always including a GCC specific flag.
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        println!("cargo:rerun-if-env-changed=DEBUG_GENERATED_CODE");
        println!("cargo:rerun-if-env-changed=TYPE_DEF_TMP_PATH");
        println!("cargo:rerun-if-env-changed=CARGO_CFG_NAPI_RS_CLI_VERSION");

        println!("cargo:rustc-cdylib-link-arg=-undefined");
        println!("cargo:rustc-cdylib-link-arg=dynamic_lookup");
    }

    // Resolve a potential linker issue for unit tests on linux
    // https://github.com/napi-rs/napi-rs/issues/1782
    #[cfg(all(target_os = "linux", not(target_arch = "wasm32")))]
    println!("cargo:rustc-link-arg=-Wl,--warn-unresolved-symbols");

    Ok(())
}
