use std::env;

fn main() -> anyhow::Result<()> {
    println!("cargo:rerun-if-env-changed=CI");
    let is_ci = env::var("CI").is_ok_and(|value| !value.is_empty());

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
        .fail_on_error()
        .add_instructions(&git)?
        .emit()?;

    Ok(())
}
