use std::{collections::HashMap, env, fs, process};

use clap::{arg, Command};
use semver::Version;
use serde_json::json;

const PLATFORM_LINUX_X64: NpmSupportedPlatform = NpmSupportedPlatform {
    os: "linux",
    arch: "x64",
    rust_target: "x86_64-unknown-linux-musl",
};

const PLATFORM_DARWIN_X64: NpmSupportedPlatform = NpmSupportedPlatform {
    os: "darwin",
    arch: "x64",
    rust_target: "x86_64-apple-darwin",
};

const PLATFORM_DARWIN_ARM64: NpmSupportedPlatform = NpmSupportedPlatform {
    os: "darwin",
    arch: "arm64",
    rust_target: "aarch64-apple-darwin",
};

const PLATFORM_WIN32_X64: NpmSupportedPlatform = NpmSupportedPlatform {
    os: "win32",
    arch: "x64",
    rust_target: "x86_64-pc-windows-msvc",
};

const NPM_PACKAGES: &[NpmPackage] = &[NpmPackage {
    crate_name: "node-file-trace",
    name: "@vercel/node-module-trace",
    description: "Node.js module trace",
    bin: "node-file-trace",
    platform: &[
        PLATFORM_LINUX_X64,
        PLATFORM_DARWIN_X64,
        PLATFORM_DARWIN_ARM64,
        PLATFORM_WIN32_X64,
    ],
}];

struct NpmSupportedPlatform {
    os: &'static str,
    arch: &'static str,
    rust_target: &'static str,
}

struct NpmPackage {
    crate_name: &'static str,
    name: &'static str,
    description: &'static str,
    bin: &'static str,
    platform: &'static [NpmSupportedPlatform],
}

fn main() {
    let matches = cli().get_matches();
    match matches.subcommand() {
        Some(("npm", sub_matches)) => {
            let name = sub_matches.get_one::<String>("NAME").expect("required");
            if let Some(pkg) = NPM_PACKAGES.iter().find(|p| p.crate_name == name) {
                let mut optional_dependencies = Vec::with_capacity(pkg.platform.len());
                let mut is_alpha = false;
                let mut is_beta = false;
                let mut is_canary = false;
                let version = if let Ok(release_version) = env::var("RELEASE_VERSION") {
                    // node-file-trace@1.0.0-alpha.1
                    let release_tag_version = release_version
                        .trim()
                        .trim_start_matches("node-file-trace@");
                    if let Ok(semver_version) = Version::parse(release_tag_version) {
                        is_alpha = semver_version.pre.contains("alpha");
                        is_beta = semver_version.pre.contains("beta");
                        is_canary = semver_version.pre.contains("canary");
                    };
                    release_tag_version.to_owned()
                } else {
                    format!(
                        "0.0.0-{}",
                        env::var("GITHUB_SHA")
                            .map(|mut sha| {
                                sha.truncate(7);
                                sha
                            })
                            .unwrap_or_else(|_| {
                                if let Ok(mut o) = process::Command::new("git")
                                    .args(&["rev-parse", "--short", "HEAD"])
                                    .output()
                                    .map(|o| {
                                        String::from_utf8(o.stdout).expect("Invalid utf8 output")
                                    })
                                {
                                    o.truncate(7);
                                    return o;
                                }
                                panic!("Unable to get git commit sha");
                            })
                    )
                };
                let tag = if is_alpha {
                    "alpha"
                } else if is_beta {
                    "beta"
                } else if is_canary {
                    "canary"
                } else {
                    "latest"
                };
                let current_dir = env::current_dir().expect("Get current dir failed");
                let temp_dir = current_dir.join("npm");
                if let Ok(()) = fs::remove_dir_all(&temp_dir) {};
                fs::create_dir(&temp_dir).expect("Unable to create temporary npm directory");
                for platform in pkg.platform.iter() {
                    let bin_file_name = if platform.os == "win32" {
                        format!("{}.exe", pkg.bin)
                    } else {
                        pkg.bin.to_string()
                    };
                    let platform_package_name =
                        format!("{}-{}-{}", pkg.name, platform.os, platform.arch);
                    optional_dependencies.push(platform_package_name.clone());
                    let pkg_json = serde_json::json!({
                      "name": platform_package_name,
                      "version": version,
                      "description": pkg.description,
                      "os": [platform.os],
                      "cpu": [platform.arch],
                      "bin": {
                        pkg.bin: bin_file_name
                      }
                    });
                    let dir_name =
                        format!("npm/{}-{}-{}", pkg.crate_name, platform.os, platform.arch);
                    let target_dir = current_dir.join(dir_name);
                    fs::create_dir(&target_dir)
                        .expect(&format!("Unable to create dir: {:?}", &target_dir));
                    fs::write(
                        target_dir.join("package.json"),
                        serde_json::to_string_pretty(&pkg_json).unwrap(),
                    )
                    .expect("Unable to write package.json");
                    let artifact_path = current_dir
                        .join("artifacts")
                        .join(format!("node-file-trace-{}", platform.rust_target))
                        .join(&bin_file_name);
                    let dist_path = target_dir.join(&bin_file_name);
                    fs::copy(&artifact_path, &dist_path).expect(&format!(
                        "Copy file from [{:?}] to [{:?}] failed",
                        artifact_path, dist_path
                    ));
                    let status = process::Command::new("npm")
                        .arg("publish")
                        .arg("--access")
                        .arg("restricted")
                        .arg("--tag")
                        .arg(tag)
                        .current_dir(&target_dir)
                        .stdout(process::Stdio::inherit())
                        .stderr(process::Stdio::inherit())
                        .status()
                        .expect("Publish npm package failed");
                    assert!(status.success());
                }
                let target_pkg_dir = temp_dir.join(pkg.name);
                fs::create_dir_all(&target_pkg_dir).expect(&format!(
                    "Unable to create target npm directory [{:?}]",
                    target_pkg_dir
                ));
                let optional_dependencies_with_version = optional_dependencies
                    .into_iter()
                    .map(|name| (name, version.clone()))
                    .collect::<HashMap<String, String>>();
                let pkg_json = json!({
                  "name": pkg.name,
                  "version": version,
                  "description": pkg.description,
                  "optionalDependencies": optional_dependencies_with_version,
                });
                fs::write(
                    target_pkg_dir.join("package.json"),
                    serde_json::to_string_pretty(&pkg_json).unwrap(),
                )
                .expect(&format!(
                    "Write [{:?}] failed",
                    target_pkg_dir.join("package.json")
                ));
                let status = process::Command::new("npm")
                    .arg("publish")
                    .arg("--access")
                    .arg("restricted")
                    .arg("--tag")
                    .arg(tag)
                    .current_dir(&target_pkg_dir)
                    .stdout(process::Stdio::inherit())
                    .stderr(process::Stdio::inherit())
                    .status()
                    .expect("Publish npm package failed");
                assert!(status.success());
            }
        }
        _ => {
            panic!("Unknown command {:?}", matches.subcommand().map(|c| c.0));
        }
    }
}

fn cli() -> Command<'static> {
    Command::new("publish")
        .about("Publish turbo-tooling stuffs")
        .subcommand_required(true)
        .arg_required_else_help(true)
        .allow_external_subcommands(true)
        .allow_invalid_utf8_for_external_subcommands(true)
        .subcommand(
            Command::new("npm")
                .about("Publish binaries to npm")
                .arg(arg!(<NAME> "the package to publish"))
                .arg_required_else_help(true),
        )
}
