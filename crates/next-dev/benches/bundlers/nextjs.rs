use std::{
    fmt::Display,
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

#[derive(Debug)]
pub enum NextJsVersion {
    V11,
    V12,
}

#[derive(Debug)]
pub struct NextJs {
    version: NextJsVersion,
    name: String,
}

impl NextJs {
    pub fn new(version: NextJsVersion) -> Self {
        Self {
            name: format!("{version} SSR"),
            version,
        }
    }
}

impl Bundler for NextJs {
    fn get_name(&self) -> &str {
        &self.name
    }

    fn get_path(&self) -> &str {
        "/page"
    }

    fn react_version(&self) -> &str {
        self.version.react_version()
    }

    fn has_server_rendered_html(&self) -> bool {
        true
    }

    fn prepare(&self, install_dir: &Path) -> Result<()> {
        npm::install(
            install_dir,
            &[NpmPackage::new("next", self.version.version())],
        )
        .context("failed to install `next` module")?;
        Ok(())
    }

    fn start_server(&self, test_dir: &Path) -> Result<(Child, String)> {
        // Using `node_modules/.bin/next` would sometimes error with `Error: Cannot find
        // module '../build/output/log'`
        let mut proc = Command::new("node")
            .args([
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
                // Next.js currently has a bug where requests for port 0 are ignored and it falls
                // back to the default 3000. Use portpicker instead.
                &portpicker::pick_unused_port()
                    .ok_or_else(|| anyhow!("failed to pick unused port"))?
                    .to_string(),
            ])
            .current_dir(test_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .context("failed to run `next` command")?;

        let addr = wait_for_match(
            proc.stdout
                .as_mut()
                .ok_or_else(|| anyhow!("missing stdout"))?,
            Regex::new("started server.*url: (.*)")?,
        )
        .ok_or_else(|| anyhow!("failed to find devserver address"))?;

        Ok((proc, format!("{addr}/page")))
    }
}

impl Display for NextJsVersion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NextJsVersion::V11 => write!(f, "Next.js 11"),
            NextJsVersion::V12 => write!(f, "Next.js 12"),
        }
    }
}

impl NextJsVersion {
    /// Returns the version of Next.js to install from npm.
    pub fn version(&self) -> &'static str {
        match self {
            NextJsVersion::V11 => "^11",
            NextJsVersion::V12 => "^12",
        }
    }

    /// Returns the version of React to install from npm alongside this version
    /// of Next.js.
    pub fn react_version(&self) -> &'static str {
        match self {
            NextJsVersion::V11 => "^17.0.2",
            NextJsVersion::V12 => "^18.2.0",
        }
    }
}
