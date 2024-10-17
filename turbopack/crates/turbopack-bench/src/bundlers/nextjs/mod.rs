use std::{
    fs,
    path::Path,
    process::{Child, Command, Stdio},
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use regex::Regex;

use super::RenderType;
use crate::{
    bundlers::Bundler,
    util::{
        npm::{
            NpmPackage, {self},
        },
        wait_for_match,
    },
};

#[derive(Debug)]
pub enum NextJsVersion {
    V12,
    V13,
    V14,
    Canary,
}

#[derive(Debug)]
pub struct NextJs {
    version: NextJsVersion,
    name: String,
    path: String,
    turbo: bool,
    render_type: RenderType,
}

impl NextJs {
    pub fn new(
        version: NextJsVersion,
        name: &str,
        path: &str,
        turbo: bool,
        render_type: RenderType,
    ) -> Self {
        Self {
            name: name.to_owned(),
            path: path.to_owned(),
            render_type,
            turbo,
            version,
        }
    }
}

impl Bundler for NextJs {
    fn get_name(&self) -> &str {
        &self.name
    }

    fn get_path(&self) -> &str {
        &self.path
    }

    fn render_type(&self) -> RenderType {
        self.render_type
    }

    fn react_version(&self) -> &str {
        self.version.react_version()
    }

    fn prepare(&self, install_dir: &Path) -> Result<()> {
        npm::install(
            install_dir,
            &[NpmPackage::new("next", self.version.version())],
        )
        .context("failed to install `next` module")?;

        if self.version.app_dir() {
            fs::write(
                install_dir.join("next.config.js"),
                include_bytes!("next.config.js"),
            )?;
        }
        Ok(())
    }

    fn start_server(&self, test_dir: &Path) -> Result<(Child, String)> {
        // Using `node_modules/.bin/next` would sometimes error with `Error: Cannot find
        // module '../build/output/log'`
        let mut proc = Command::new("node");
        proc.args([
            test_dir
                .join("node_modules")
                .join("next")
                .join("dist")
                .join("bin")
                .join("next")
                .to_str()
                .unwrap(),
            "dev",
            "--port",
            &match self.version {
                NextJsVersion::V12 => {
                    // Next.js 12 has a bug where requests for port 0 are ignored and it falls
                    // back to the default 3000. Use portpicker instead.
                    portpicker::pick_unused_port()
                        .ok_or_else(|| anyhow!("failed to pick unused port"))?
                }
                _ => 0,
            }
            .to_string(),
        ])
        .current_dir(test_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
        if self.turbo {
            proc.arg("--turbo");
        }
        let mut proc = proc.spawn().context("failed to run `next` command")?;

        let addr = wait_for_match(
            proc.stdout
                .as_mut()
                .ok_or_else(|| anyhow!("missing stdout"))?,
            match self.version {
                NextJsVersion::V12 => Regex::new("started server.*url: (.*)"),
                _ => Regex::new("- Local:\\s+(.*)"),
            }?,
        )
        .ok_or_else(|| anyhow!("failed to find devserver address"))?;

        Ok((proc, format!("{addr}/page")))
    }

    fn max_update_timeout(&self, module_count: usize) -> std::time::Duration {
        match (self.render_type, self.turbo) {
            (RenderType::ServerSidePrerendered, true) => Duration::from_millis(500),
            // Arbitrary default timeout that seems to work well for Next.js Webpack
            _ => Duration::from_millis(5000 + (module_count as f64 / 2.0).ceil() as u64),
        }
    }
}

impl NextJsVersion {
    /// Returns the version of Next.js to install from npm.
    pub fn version(&self) -> &'static str {
        match self {
            NextJsVersion::V12 => "^12",
            NextJsVersion::V13 => "^13",
            NextJsVersion::V14 => "^14",
            NextJsVersion::Canary => "canary",
        }
    }

    /// Returns the version of React to install from npm alongside this version
    /// of Next.js.
    pub fn react_version(&self) -> &'static str {
        match self {
            NextJsVersion::V12 => "^18.2.0",
            NextJsVersion::V13 => "^18.2.0",
            NextJsVersion::V14 => "^18.2.0",
            NextJsVersion::Canary => "rc",
        }
    }

    /// Returns whether this version of Next.js supports the appDir option.
    pub fn app_dir(&self) -> bool {
        matches!(self, NextJsVersion::V13 | NextJsVersion::Canary)
    }
}
