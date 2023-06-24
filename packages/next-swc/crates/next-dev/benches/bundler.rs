use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
};

use anyhow::{anyhow, Context, Result};
use regex::Regex;
use turbopack_binding::turbopack::bench::{
    bundlers::{Bundler, RenderType},
    util::{
        npm::{self, NpmPackage},
        wait_for_match,
    },
};

pub struct TurboNext {
    name: String,
    path: String,
    render_type: RenderType,
}

impl TurboNext {
    pub fn new(name: &str, path: &str, render_type: RenderType) -> Self {
        TurboNext {
            name: name.to_owned(),
            path: path.to_owned(),
            render_type,
        }
    }
}

impl Bundler for TurboNext {
    fn get_name(&self) -> &str {
        &self.name
    }

    fn get_path(&self) -> &str {
        &self.path
    }

    fn render_type(&self) -> RenderType {
        self.render_type
    }

    fn prepare(&self, install_dir: &Path) -> Result<()> {
        let repo_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../..")
            .canonicalize()?;

        let build = Command::new("pnpm")
            .args(["build"])
            .current_dir(&repo_path)
            .output()?;

        npm::install(
            install_dir,
            &[NpmPackage::new(
                "next",
                &repo_path.join("packages/next").to_string_lossy(),
            )],
        )
        .context("failed to install from npm")?;

        if !build.status.success() {
            io::stdout().write_all(&build.stdout)?;
            io::stderr().write_all(&build.stderr)?;
            return Err(anyhow!("pnpm build failed. See above."));
        }

        fs::write(
            install_dir.join("next.config.js"),
            include_bytes!("next.config.js"),
        )?;

        Ok(())
    }

    fn start_server(&self, test_dir: &Path) -> Result<(Child, String)> {
        let mut proc = Command::new(
            std::env::var("CARGO_BIN_EXE_next-dev")
                .unwrap_or_else(|_| std::env!("CARGO_BIN_EXE_next-dev").to_string()),
        )
        .args([
            test_dir
                .to_str()
                .ok_or_else(|| anyhow!("failed to convert test directory path to string"))?,
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
}
