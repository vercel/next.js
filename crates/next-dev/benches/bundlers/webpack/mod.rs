use std::{
    fs,
    path::Path,
    process::{Child, Command, Stdio},
};

use anyhow::{anyhow, Context, Result};
use regex::Regex;

use crate::{
    bundlers::Bundler,
    util::{npm, wait_for_match},
};

pub struct Webpack;
impl Bundler for Webpack {
    fn get_name(&self) -> &str {
        "Webpack CSR"
    }

    fn prepare(&self, install_dir: &Path) -> Result<()> {
        npm::install(install_dir, "@pmmmwh/react-refresh-webpack-plugin", "0.5.7")
            .context("failed to install `@pmmmwh/react-refresh-webpack-plugin` module")?;
        npm::install(install_dir, "@swc/core", "1.2.249")
            .context("failed to install `@swc/core` module")?;
        npm::install(install_dir, "react-refresh", "0.14.0")
            .context("failed to install `react-refresh` module")?;
        npm::install(install_dir, "swc-loader", "0.2.3")
            .context("failed to install `swc-loader` module")?;
        npm::install(install_dir, "webpack", "5.74.0")
            .context("failed to install `webpack` module")?;
        npm::install(install_dir, "webpack-cli", "4.10.0")
            .context("failed to install `webpack-cli` module")?;
        npm::install(install_dir, "webpack-dev-server", "4.11.0")
            .context("failed to install `webpack-dev-server` module")?;

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
