use std::{
    fs::{self, File},
    io::{self, Write},
    path::Path,
};

use anyhow::{anyhow, Result};

use crate::util::command;

pub fn install(install_dir: &Path, package_name: &str, package_version_expr: &str) -> Result<()> {
    if !fs::metadata(install_dir.join("package.json"))
        .map(|metadata| metadata.is_file())
        .unwrap_or(false)
    {
        // Create a simple package.json if one doesn't exist

        let package_json = json::object! {
            private: true,
            version: "0.0.0",
        };

        File::create(install_dir.join("package.json"))?
            .write_all(package_json.pretty(2).as_bytes())?;
    }

    let npm = command("npm")
        .args([
            "install",
            "--force",
            &format!("{}@{}", package_name, package_version_expr),
        ])
        .current_dir(install_dir)
        .output()?;

    if !npm.status.success() {
        io::stdout().write_all(&npm.stdout)?;
        io::stderr().write_all(&npm.stderr)?;
        return Err(anyhow!("npm install failed. See above."));
    }

    Ok(())
}
