use std::{
    fs::{
        File, {self},
    },
    io::{
        Write, {self},
    },
    path::Path,
};

use anyhow::Result;
use serde_json::json;

use crate::util::command;

pub struct NpmPackage<'a> {
    pub name: &'a str,
    pub version: &'a str,
}

impl<'a> NpmPackage<'a> {
    pub fn new(name: &'a str, version: &'a str) -> Self {
        NpmPackage { name, version }
    }
}

impl std::fmt::Display for NpmPackage<'_> {
    fn fmt(&self, fmt: &mut std::fmt::Formatter) -> std::fmt::Result {
        fmt.write_fmt(format_args!("{}@{}", self.name, self.version))
    }
}

pub fn install(install_dir: &Path, packages: &[NpmPackage<'_>]) -> Result<()> {
    if !fs::metadata(install_dir.join("package.json"))
        .map(|metadata| metadata.is_file())
        .unwrap_or(false)
    {
        // Create a simple package.json if one doesn't exist

        let package_json = json!({
            "private": true,
            "version": "0.0.0",
        });

        File::create(install_dir.join("package.json"))?
            .write_all(format!("{package_json:#}").as_bytes())?;
    }

    let mut args = vec![
        "install".to_owned(),
        "--force".to_owned(),
        // install-links will copy local dependencies into the node_modules folder instead of
        // symlinking, which fixes our root detection.
        "--install-links".to_owned(),
        "true".to_owned(),
    ];
    args.append(
        &mut packages
            .iter()
            .map(|p| p.to_string())
            .collect::<Vec<String>>(),
    );

    let npm = command("npm")
        .args(args)
        .current_dir(install_dir)
        .output()?;

    if !npm.status.success() {
        io::stdout().write_all(&npm.stdout)?;
        io::stderr().write_all(&npm.stderr)?;
        anyhow::bail!("npm install failed. See above.")
    }

    Ok(())
}
