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
        npm::{self, NpmPackage},
        wait_for_match,
    },
};

pub struct Webpack;
impl Bundler for Webpack {
    fn get_name(&self) -> &str {
        "Webpack CSR"
    }

    fn prepare(&self, install_dir: &Path) -> Result<()> {
        npm::install(
            install_dir,
            &[
                NpmPackage::new("@pmmmwh/react-refresh-webpack-plugin", "0.5.7"),
                NpmPackage::new("@swc/core", "1.2.249"),
                NpmPackage::new("react-refresh", "0.14.0"),
                NpmPackage::new("swc-loader", "0.2.3"),
                NpmPackage::new("webpack", "5.74.0"),
                NpmPackage::new("webpack-cli", "4.10.0"),
                NpmPackage::new("webpack-dev-server", "4.11.0"),
            ],
        )
        .context("failed to install from npm")?;

        fs::write(
            install_dir.join("webpack.config.js"),
            include_bytes!("webpack.config.js"),
        )?;

        Ok(())
    }

    fn start_server(&self, test_dir: &Path) -> Result<(Child, String)> {
        let mut proc = Command::new("node")
            .args([
                (test_dir
                    .join("node_modules")
                    .join("webpack-dev-server")
                    .join("bin")
                    .join("webpack-dev-server.js")
                    .to_str()
                    .unwrap()),
                "--port",
                "0",
            ])
            .env("NO_COLOR", "1")
            .current_dir(test_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("failed to run `webpack-dev-server` command")?;

        let addr = wait_for_match(
            proc.stderr
                .as_mut()
                .ok_or_else(|| anyhow!("missing stderr"))?,
            Regex::new("\\[webpack\\-dev\\-server\\] Loopback:\\s+(.*)")?,
        )
        .ok_or_else(|| anyhow!("failed to find devserver address"))?;

        Ok((proc, addr))
    }
}
