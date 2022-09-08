use std::{
    fs::{self, File},
    io::{self, BufRead, BufReader, Write},
    path::Path,
    process::{Child, ChildStdout, Command, Stdio},
};

use anyhow::{anyhow, Context, Result};
use regex::Regex;
use tempfile::TempDir;

pub trait Bundler {
    fn get_name(&self) -> &str;
    fn get_path(&self) -> &str {
        "/"
    }
    fn prepare(&self, _template_dir: &Path) -> Result<()> {
        Ok(())
    }
    fn start_server(&self, test_dir: &Path) -> Result<(Child, String)>;
}

struct Turbopack {
    name: String,
    path: String,
}

impl Turbopack {
    fn new(name: &str, path: &str) -> Self {
        Turbopack {
            name: name.to_owned(),
            path: path.to_owned(),
        }
    }
}

impl Bundler for Turbopack {
    fn get_name(&self) -> &str {
        &self.name
    }

    fn get_path(&self) -> &str {
        &self.path
    }

    fn start_server(&self, test_dir: &Path) -> Result<(Child, String)> {
        let mut proc = Command::new(std::env!("CARGO_BIN_EXE_next-dev"))
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
            Regex::new("server listening on: (.*)")?,
        )
        .ok_or_else(|| anyhow!("failed to find devserver address"))?;

        Ok((proc, addr))
    }
}

struct Vite {
    install_dir: TempDir,
}

impl Vite {
    fn new() -> Result<Self> {
        // Manage our own installation and avoid `npm exec`, `npx`, etc. to avoid their
        // overhead influencing benchmarks.
        let install_dir = tempfile::tempdir()?;
        install_from_npm(install_dir.path(), "vite", "3.0.9")
            .context("failed to install `vite` module")?;

        Ok(Vite { install_dir })
    }
}

impl Bundler for Vite {
    fn get_name(&self) -> &str {
        "Vite CSR"
    }

    fn start_server(&self, test_dir: &Path) -> Result<(Child, String)> {
        let mut proc = Command::new("node")
            .args([
                (self
                    .install_dir
                    .path()
                    .join("node_modules")
                    .join("vite")
                    .join("bin")
                    .join("vite.js")
                    .to_str()
                    .unwrap()),
                "--port",
                "0",
            ])
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

struct NextJs {
    version: u32,
    name: String,
}

impl NextJs {
    fn new(version: u32) -> Self {
        Self {
            version,
            name: format!("Next.js {version} SSR"),
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

    fn prepare(&self, install_dir: &Path) -> Result<()> {
        install_from_npm(install_dir, "next", &format!("^{}", self.version))
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

pub fn get_bundlers() -> Result<Vec<Box<dyn Bundler>>> {
    let config = std::env::var("TURBOPACK_BENCH_BUNDLERS").ok();
    let mut turbopack = false;
    let mut others = false;
    match config.as_deref() {
        Some("all") => {
            turbopack = true;
            others = true
        }
        Some("others") => others = true,
        None | Some("") => {
            turbopack = true;
        }
        _ => panic!("Invalid value for TURBOPACK_BENCH_BUNDLERS"),
    }
    let mut bundlers: Vec<Box<dyn Bundler>> = Vec::new();
    if turbopack {
        bundlers.push(Box::new(Turbopack::new("Turbopack CSR", "/")));
        bundlers.push(Box::new(Turbopack::new("Turbopack SSR", "/page")));
    }

    if others {
        bundlers.push(Box::new(Vite::new()?));
        bundlers.push(Box::new(NextJs::new(12)));
        bundlers.push(Box::new(NextJs::new(11)));
    }

    Ok(bundlers)
}

fn wait_for_match(stdout: &mut ChildStdout, re: Regex) -> Option<String> {
    // See https://docs.rs/async-process/latest/async_process/#examples
    let mut line_reader = BufReader::new(stdout).lines();
    // Read until the match appears in the buffer
    let mut matched: Option<String> = None;
    while let Some(Ok(line)) = line_reader.next() {
        if let Some(cap) = re.captures(&line) {
            matched = Some(cap.get(1).unwrap().as_str().into());
            break;
        }
    }

    matched
}

pub fn command(bin: &str) -> Command {
    if cfg!(windows) {
        let mut command = Command::new("cmd.exe");
        command.args(["/C", bin]);
        command
    } else {
        Command::new(bin)
    }
}

fn install_from_npm(
    install_dir: &Path,
    package_name: &str,
    package_version_expr: &str,
) -> Result<()> {
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
