use std::env;

fn main() -> anyhow::Result<()> {
    println!("cargo:rerun-if-env-changed=CI");
    let is_ci = env::var("CI").is_ok_and(|value| !value.is_empty());

    // Generates, stores build-time information as static values.
    // There are some places relying on correct values for this (i.e telemetry),
    // So failing build if this fails.
    let cargo = vergen_gitcl::CargoBuilder::default()
        .target_triple(true)
        .build()?;
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

    Ok(())
}
