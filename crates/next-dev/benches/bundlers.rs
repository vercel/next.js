use std::{
    env::{self, VarError},
    fs::File,
    io::{self, BufRead, BufReader, Write},
    path::Path,
    process::{Child, ChildStdout, Command, Stdio},
};

use regex::Regex;
use tempfile::TempDir;

pub trait Bundler {
    fn get_name(&self) -> &str;
    fn start_server(&self, test_dir: &Path) -> (Child, String);
}

struct Turbopack;
impl Bundler for Turbopack {
    fn get_name(&self) -> &str {
        "Turbopack"
    }

    fn start_server(&self, test_dir: &Path) -> (Child, String) {
        let mut proc = Command::new(std::env!("CARGO_BIN_EXE_next-dev"))
            .args([test_dir.to_str().unwrap(), "--no-open", "--port", "0"])
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();

        // Wait for the devserver address to appear in stdout.
        let addr = wait_for_match(
            proc.stdout.as_mut().unwrap(),
            Regex::new("server listening on: (.*)").unwrap(),
        );

        (proc, addr)
    }
}

struct Vite {
    install_dir: TempDir,
}

impl Vite {
    fn new() -> Self {
        // Manage our own installation and avoid `npm exec`, `npx`, etc. to avoid their
        // overhead influencing benchmarks.
        let install_dir = tempfile::tempdir().unwrap();

        let package_json = json::object! {
            private: true,
            version: "0.0.0",
            dependencies: json::object! {
                "vite": "3.0.9",
            }
        };

        File::create(install_dir.path().join("package.json"))
            .unwrap()
            .write_all(package_json.pretty(2).as_bytes())
            .unwrap();

        let npm = command("npm")
            .args(["install", "--prefer-offline"])
            .current_dir(&install_dir)
            .output()
            .unwrap();

        if !npm.status.success() {
            io::stdout().write_all(&npm.stdout).unwrap();
            io::stderr().write_all(&npm.stderr).unwrap();
            panic!("npm install failed. See above.");
        }

        Vite { install_dir }
    }
}

impl Bundler for Vite {
    fn get_name(&self) -> &str {
        "Vite"
    }

    fn start_server(&self, test_dir: &Path) -> (Child, String) {
        let mut proc = Command::new("node")
            .args([
                &self
                    .install_dir
                    .path()
                    .join("node_modules")
                    .join("vite")
                    .join("bin")
                    .join("vite.js")
                    .to_str()
                    .unwrap(),
                "--port",
                "0",
            ])
            .env("NO_COLOR", "1")
            .current_dir(test_dir.to_str().unwrap())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();

        // Wait for the devserver address to appear in stdout.
        let addr = wait_for_match(
            proc.stdout.as_mut().unwrap(),
            Regex::new("Local:\\s+(.*)").unwrap(),
        );

        (proc, addr)
    }
}

pub fn get_bundlers() -> Vec<Box<dyn Bundler>> {
    if let Err(VarError::NotPresent) = env::var("TURBOPACK_BENCH_ALL") {
        vec![Box::new(Turbopack {})]
    } else {
        vec![Box::new(Turbopack {}), Box::new(Vite::new())]
    }
}

fn wait_for_match(stdout: &mut ChildStdout, re: Regex) -> String {
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

    matched.unwrap()
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
