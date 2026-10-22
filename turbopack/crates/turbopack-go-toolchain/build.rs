#[allow(dead_code)]
#[path = "src/artifact.rs"]
mod artifact;

fn main() -> anyhow::Result<()> {
    println!("cargo:rerun-if-changed=archives.json");
    println!("cargo:rerun-if-changed=src/artifact.rs");
    println!("cargo:rerun-if-env-changed=TURBOPACK_GO_ARCHIVE_DIR");
    if std::env::var_os("CARGO_FEATURE_EMBEDDED").is_none() {
        return Ok(());
    }
    let target = std::env::var("TARGET")?;
    let artifact = artifact::for_target(&target)?;
    let archive = artifact::archive_directory().join(&artifact.filename);
    println!("cargo:rerun-if-changed={}", archive.display());
    artifact.verify(&archive).map_err(|error| {
        anyhow::anyhow!(
            "{error:#}; prepare the pinned archive with cargo xtask prepare-go-toolchain --target \
             {target}"
        )
    })?;
    let entries = artifact::inspect(&artifact, &archive)?;
    let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
    std::fs::write(out.join("entries.json"), serde_json::to_vec(&entries)?)?;
    // Embed a private copy of the bytes whose hash was verified. Cargo never downloads tools.
    std::fs::copy(&archive, out.join("go.archive"))?;
    artifact.verify(&out.join("go.archive"))?;
    std::fs::write(out.join("target.txt"), target)?;
    Ok(())
}
