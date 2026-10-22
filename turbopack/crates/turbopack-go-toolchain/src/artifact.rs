//! Pinned official artifacts and archive validation, shared with the offline build script.
use std::{
    collections::BTreeSet,
    fs::File,
    io::{Read, Seek},
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, Deserialize)]
pub struct Artifact {
    pub filename: String,
    pub os: String,
    pub arch: String,
    pub version: String,
    pub sha256: String,
    pub size: u64,
}

pub fn for_target(target: &str) -> Result<Artifact> {
    let (os, arch) = match target {
        "x86_64-apple-darwin" => ("darwin", "amd64"),
        "aarch64-apple-darwin" => ("darwin", "arm64"),
        "x86_64-pc-windows-msvc" => ("windows", "amd64"),
        "aarch64-pc-windows-msvc" => ("windows", "arm64"),
        "x86_64-unknown-linux-gnu" | "x86_64-unknown-linux-musl" => ("linux", "amd64"),
        "aarch64-unknown-linux-gnu" | "aarch64-unknown-linux-musl" => ("linux", "arm64"),
        _ => anyhow::bail!(
            "embedded Go is unsupported for Rust target {target}; build without embedded-go and \
             supply --go"
        ),
    };
    let artifacts: Vec<Artifact> = serde_json::from_str(include_str!("../archives.json"))?;
    artifacts
        .into_iter()
        .find(|a| a.os == os && a.arch == arch)
        .context("missing pinned Go artifact")
}

pub fn archive_directory() -> PathBuf {
    std::env::var_os("TURBOPACK_GO_ARCHIVE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../..")
                .join("target/go-toolchain-archives")
        })
}

pub fn hash(reader: &mut dyn Read, mut check: impl FnMut() -> Result<()>) -> Result<(u64, String)> {
    let mut digest = Sha256::new();
    let mut size = 0;
    let mut buffer = [0; 65536];
    loop {
        check()?;
        let length = reader.read(&mut buffer)?;
        if length == 0 {
            break;
        }
        digest.update(&buffer[..length]);
        size += length as u64;
    }
    Ok((size, format!("{:x}", digest.finalize())))
}

impl Artifact {
    pub fn verify(&self, path: &Path) -> Result<()> {
        let (size, sha256) = hash(&mut File::open(path)?, || Ok(()))?;
        ensure!(
            size == self.size && sha256 == self.sha256,
            "Go archive checksum/size mismatch: {}",
            path.display()
        );
        Ok(())
    }
    pub fn key(&self) -> String {
        format!(
            "v1-{}-{}-{}-{}",
            self.version, self.os, self.arch, self.sha256
        )
    }
    pub fn is_zip(&self) -> bool {
        self.filename.ends_with(".zip")
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Entry {
    pub path: String,
    pub directory: bool,
    pub size: u64,
    pub executable: bool,
    pub sha256: String,
}

pub fn relative_path(name: &str) -> Result<Option<&str>> {
    let name = name.strip_suffix('/').unwrap_or(name);
    if name == "go" {
        return Ok(None);
    }
    let relative = name
        .strip_prefix("go/")
        .context("Go archive entry outside go/")?;
    ensure!(
        !relative.is_empty() && !relative.contains(['\\', ':', '\0']),
        "unsafe Go archive path: {name}"
    );
    for component in relative.split('/') {
        ensure!(
            !component.is_empty()
                && component != "."
                && component != ".."
                && !component.ends_with(['.', ' ']),
            "unsafe Go archive path: {name}"
        );
        let stem = component.split('.').next().unwrap().to_ascii_uppercase();
        ensure!(
            ![
                "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
                "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8",
                "LPT9"
            ]
            .contains(&stem.as_str()),
            "reserved Go archive path: {name}"
        );
    }
    Ok(Some(relative))
}

pub fn visit<R: Read + Seek>(
    reader: R,
    zipped: bool,
    mut visitor: impl FnMut(&str, bool, u64, bool, &mut dyn Read) -> Result<()>,
) -> Result<()> {
    let mut seen = BTreeSet::new();
    let mut entry =
        |name: &str, directory: bool, size: u64, mode: u32, reader: &mut dyn Read| -> Result<()> {
            let Some(path) = relative_path(name)? else {
                ensure!(directory, "archive root must be a directory");
                return Ok(());
            };
            ensure!(
                seen.insert(path.to_lowercase()),
                "duplicate Go archive path: {path}"
            );
            ensure!(
                size <= 512 * 1024 * 1024 && seen.len() <= 100_000,
                "Go archive exceeds extraction limits"
            );
            visitor(
                path,
                directory,
                size,
                mode & 0o111 != 0 || path.ends_with(".exe"),
                reader,
            )
        };
    if zipped {
        let mut archive = zip::ZipArchive::new(reader)?;
        for index in 0..archive.len() {
            let mut file = archive.by_index(index)?;
            let directory = file.is_dir();
            let mode = file
                .unix_mode()
                .unwrap_or(if directory { 0o40755 } else { 0o100644 });
            ensure!(
                mode & 0o170000 == 0
                    || mode & 0o170000 == if directory { 0o040000 } else { 0o100000 },
                "unsupported Go archive entry type"
            );
            let name = file.name()?.into_owned();
            let size = file.size();
            entry(&name, directory, size, mode, &mut file)?;
        }
    } else {
        let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(reader));
        for file in archive.entries()? {
            let mut file = file?;
            let kind = file.header().entry_type();
            ensure!(
                kind.is_file() || kind.is_dir(),
                "unsupported Go archive entry type"
            );
            let name = file
                .path()?
                .to_str()
                .context("non-UTF8 Go archive path")?
                .to_owned();
            let size = file.size();
            let mode = file.header().mode()?;
            entry(&name, kind.is_dir(), size, mode, &mut file)?;
        }
    }
    Ok(())
}

pub fn inspect(artifact: &Artifact, path: &Path) -> Result<Vec<Entry>> {
    let mut entries = Vec::new();
    visit(
        File::open(path)?,
        artifact.is_zip(),
        |path, directory, size, executable, reader| {
            let (actual, sha256) = hash(reader, || Ok(()))?;
            ensure!(actual == size, "truncated Go archive entry: {path}");
            entries.push(Entry {
                path: path.to_owned(),
                directory,
                size,
                executable,
                sha256,
            });
            Ok(())
        },
    )?;
    ensure!(
        entries.iter().any(|e| e.path == "VERSION")
            && entries.iter().any(|e| e.path
                == if artifact.os == "windows" {
                    "bin/go.exe"
                } else {
                    "bin/go"
                }),
        "incomplete Go distribution"
    );
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn targets_and_archive_paths() {
        assert_eq!(for_target("aarch64-apple-darwin").unwrap().arch, "arm64");
        assert_eq!(
            for_target("x86_64-unknown-linux-musl").unwrap().filename,
            for_target("x86_64-unknown-linux-gnu").unwrap().filename
        );
        assert!(for_target("wasm32-unknown-unknown").is_err());
        for path in [
            "../go/bin/go",
            "go/../evil",
            "go//bin",
            "go/C:evil",
            "go/a\\b",
            "go/CON",
            "go/aux.txt",
            "go/a.",
            "go/a ",
        ] {
            assert!(relative_path(path).is_err(), "{path}");
        }
        assert_eq!(
            relative_path("go/src/runtime/asm_arm64.s").unwrap(),
            Some("src/runtime/asm_arm64.s")
        );
    }
}
