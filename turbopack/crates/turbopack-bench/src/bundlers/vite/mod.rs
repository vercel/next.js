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

pub struct Vite {
    swc: bool,
    ssr: bool,
}

impl Vite {
    pub fn new(swc: bool, ssr: bool) -> Self {
        Vite { swc, ssr }
    }
}

impl Bundler for Vite {
    fn get_name(&self) -> &str {
        if self.ssr {
            if self.swc {
                "Vite SWC SSR"
            } else {
                "Vite SSR"
            }
        } else if self.swc {
            "Vite SWC CSR"
        } else {
            "Vite CSR"
        }
    }

    fn prepare(&self, install_dir: &Path) -> Result<()> {
        let mut packages = vec![NpmPackage::new("vite", "4.3.0-beta.2")];
        if self.swc {
            packages.push(NpmPackage::new("@vitejs/plugin-react-swc", "^3.2.0"));
        } else {
            packages.push(NpmPackage::new("@vitejs/plugin-react", "^3.1.0"));
        };
        if self.ssr {
            packages.push(NpmPackage::new("express", "^4.18.2"));
        }
        npm::install(install_dir, &packages).context("failed to install from npm")?;

        fs::write(
            install_dir.join("vite.config.js"),
            if self.swc {
                include_bytes!("vite.swc.config.js") as &[u8]
            } else {
                include_bytes!("vite.config.js") as &[u8]
            },
        )?;

        Ok(())
    }

    fn start_server(&self, test_dir: &Path) -> Result<(Child, String)> {
        let args = if self.ssr {
            vec![test_dir
                .join("vite-server.mjs")
                .to_str()
                .unwrap()
                .to_string()]
        } else {
            vec![
                test_dir
                    .join("node_modules")
                    .join("vite")
                    .join("bin")
                    .join("vite.js")
                    .to_str()
                    .unwrap()
                    .to_string(),
                "--port".to_string(),
                "0".to_string(),
            ]
        };
        let mut proc = Command::new("node")
            .args(args)
            .env("NO_COLOR", "1")
            .current_dir(test_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .context("failed to run `vite` command")?;

        let addr = wait_for_match(
            proc.stdout
                .as_mut()
                .ok_or_else(|| anyhow!("missing stdout"))?,
            Regex::new("Local:\\s+(.*)")?,
        )
        .ok_or_else(|| anyhow!("failed to find devserver address"))?;

        Ok((proc, addr))
    }
}
