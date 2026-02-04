use std::{
    path::Path,
    process::{Child, Command, Stdio},
};

use anyhow::{Context, Result, anyhow};
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

pub struct Parcel;
impl Bundler for Parcel {
    fn get_name(&self) -> &str {
        "Parcel CSR"
    }

    fn prepare(&self, install_dir: &Path) -> Result<()> {
        npm::install(
            install_dir,
            &[
                NpmPackage::new("parcel", "^2.8.0"),
                // `process` would otherwise be auto-installed by Parcel. Do this in advance as
                // to not influence the benchmark.
                NpmPackage::new("process", "^0.11.10"),
            ],
        )
        .context("failed to install from npm")?;

        Ok(())
    }

    fn start_server(&self, test_dir: &Path) -> Result<(Child, String)> {
        let mut proc = Command::new("node")
            .args([
                (test_dir
                    .join("node_modules")
                    .join("parcel")
                    .join("lib")
                    .join("bin.js")
                    .to_str()
                    .unwrap()),
                "--port",
                &portpicker::pick_unused_port()
                    .ok_or_else(|| anyhow!("failed to pick unused port"))?
                    .to_string(),
                "index.html",
            ])
            .current_dir(test_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .context("failed to run `parcel` command")?;

        let addr = wait_for_match(
            proc.stdout
                .as_mut()
                .ok_or_else(|| anyhow!("missing stdout"))?,
            Regex::new("Server running at\\s+(.*)")?,
        )
        .ok_or_else(|| anyhow!("failed to find devserver address"))?;

        Ok((proc, addr))
    }
}
