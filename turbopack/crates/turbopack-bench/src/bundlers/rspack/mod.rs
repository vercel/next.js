use std::{
    fs,
    path::Path,
    process::{Child, Command, Stdio},
};

use anyhow::{anyhow, Context, Result};
use regex::Regex;

use crate::{
    bundlers::Bundler,
    util::{
        npm::{
            NpmPackage, {self},
        },
        wait_for_match,
    },
};

pub struct Rspack;
impl Bundler for Rspack {
    fn get_name(&self) -> &str {
        "Rspack CSR"
    }

    fn prepare(&self, install_dir: &Path) -> Result<()> {
        npm::install(
            install_dir,
            &[
                NpmPackage::new("react-refresh", "^0.14.0"),
                NpmPackage::new("@rspack/cli", "0.1.9"),
            ],
        )
        .context("failed to install from npm")?;

        fs::write(
            install_dir.join("rspack.config.js"),
            include_bytes!("rspack.config.js"),
        )?;

        Ok(())
    }

    fn start_server(&self, test_dir: &Path) -> Result<(Child, String)> {
        let mut proc = Command::new("node")
            .args([
                (test_dir
                    .join("node_modules")
                    .join("@rspack")
                    .join("cli")
                    .join("bin")
                    .join("rspack")
                    .to_str()
                    .unwrap()),
                "serve",
            ])
            .env("NO_COLOR", "1")
            .current_dir(test_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("failed to run `rspack-dev-server` command")?;

        let addr = wait_for_match(
            proc.stderr
                .as_mut()
                .ok_or_else(|| anyhow!("missing stderr"))?,
            Regex::new("Loopback:\\s+(.*)")?,
        )
        .ok_or_else(|| anyhow!("failed to find devserver address"))?;

        Ok((proc, addr))
    }
}
