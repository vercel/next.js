use std::{io::Write, path::Path, process::Command};

use anyhow::{Context, Result, ensure};
use turbopack_go_toolchain::artifact::{archive_directory, for_target};

pub fn prepare(target: &str, offline: bool, notices: Option<&Path>) -> Result<()> {
    let artifact = for_target(target)?;
    let directory = archive_directory();
    std::fs::create_dir_all(&directory)?;
    let path = directory.join(&artifact.filename);
    if artifact.verify(&path).is_ok() {
        if let Some(notices) = notices {
            write_notices(&artifact, &path, notices)?;
        }
        println!("{}", std::fs::canonicalize(path)?.display());
        return Ok(());
    }
    ensure!(
        !offline,
        "verified Go archive unavailable in offline mode: {}",
        path.display()
    );
    let temp = tempfile::NamedTempFile::new_in(&directory)?;
    let status = Command::new("curl")
        .args([
            "--fail",
            "--location",
            "--retry",
            "3",
            "--connect-timeout",
            "30",
            "--max-time",
            "600",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--silent",
            "--show-error",
            "--output",
        ])
        .arg(temp.path())
        .arg(format!("https://go.dev/dl/{}", artifact.filename))
        .status()
        .context("acquiring official Go archive with curl")?;
    ensure!(status.success(), "Go archive download failed");
    artifact.verify(temp.path())?;
    temp.as_file().sync_all()?;
    temp.persist(&path).map_err(|error| error.error)?;
    // Preserve provenance alongside the verified archive for artifact packaging.
    let mut provenance = tempfile::NamedTempFile::new_in(&directory)?;
    writeln!(provenance, "{}  {}", artifact.sha256, artifact.filename)?;
    provenance
        .persist(path.with_extension("sha256"))
        .map_err(|error| error.error)?;
    if let Some(notices) = notices {
        write_notices(&artifact, &path, notices)?;
    }
    println!("{}", std::fs::canonicalize(path)?.display());
    Ok(())
}

fn write_notices(
    artifact: &turbopack_go_toolchain::artifact::Artifact,
    archive: &Path,
    output: &Path,
) -> Result<()> {
    artifact.verify(archive)?;
    std::fs::create_dir_all(output)?;
    turbopack_go_toolchain::artifact::visit(
        std::fs::File::open(archive)?,
        artifact.is_zip(),
        |path, directory, _, _, reader| {
            let name = path.rsplit('/').next().unwrap().to_ascii_lowercase();
            if !directory
                && (name.contains("license") || name.contains("notice") || name == "patents")
            {
                let target = output.join(path);
                std::fs::create_dir_all(target.parent().unwrap())?;
                std::io::copy(reader, &mut std::fs::File::create(target)?)?;
            }
            Ok(())
        },
    )?;
    std::fs::write(
        output.join("PROVENANCE.txt"),
        format!(
            "Official Go {} for {}-{}\nhttps://go.dev/dl/{}\nSHA256: {}\n",
            artifact.version, artifact.os, artifact.arch, artifact.filename, artifact.sha256
        ),
    )?;
    Ok(())
}
