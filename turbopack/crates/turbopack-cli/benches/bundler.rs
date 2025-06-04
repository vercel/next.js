use std::{
    path::Path,
    process::{Child, Command, Stdio},
    time::Duration,
};

use anyhow::{Context, Result, anyhow};
use regex::Regex;
use turbopack_bench::{
    bundlers::{Bundler, RenderType},
    util::{
        npm::{
            NpmPackage, {self},
        },
        wait_for_match,
    },
};

pub struct Turbopack;

impl Turbopack {
    pub fn new() -> Self {
        Turbopack
    }
}

impl Bundler for Turbopack {
    fn get_name(&self) -> &str {
        "Turbopack CSR"
    }

    fn get_path(&self) -> &str {
        "/"
    }

    fn render_type(&self) -> RenderType {
        RenderType::ClientSideRendered
    }

    fn prepare(&self, install_dir: &Path) -> Result<()> {
        npm::install(
            install_dir,
            &[
                NpmPackage::new("react-refresh", "^0.14.0"),
                NpmPackage::new("@next/react-refresh-utils", "^13.3.0"),
                NpmPackage::new("@swc/helpers", "0.4.11"),
            ],
        )
        .context("failed to install from npm")?;

        Ok(())
    }

    fn start_server(&self, test_dir: &Path) -> Result<(Child, String)> {
        let binary = std::env::var("CARGO_BIN_EXE_turobpack-cli")
            .unwrap_or_else(|_| std::env!("CARGO_BIN_EXE_turbopack-cli").to_string());
        let mut proc = Command::new(binary)
            .args([
                "dev",
                "--dir",
                test_dir
                    .to_str()
                    .ok_or_else(|| anyhow!("failed to convert test directory path to string"))?,
                "src/index",
                "--no-open",
                "--port",
                "0",
            ])
            .stdout(Stdio::piped())
            .spawn()?;

        // Wait for the devserver address to appear in stdout.
        let addr = wait_for_match(
            proc.stdout
                .as_mut()
                .ok_or_else(|| anyhow!("missing stdout"))?,
            Regex::new("started server on .+, url: (.*)")?,
        )
        .ok_or_else(|| anyhow!("failed to find devserver address"))?;

        Ok((proc, addr))
    }

    fn max_update_timeout(&self, _module_count: usize) -> std::time::Duration {
        Duration::from_millis(500)
    }
}
