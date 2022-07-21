use std::{
    collections::{HashMap, HashSet},
    env::{current_dir, var_os},
    path::PathBuf,
    process,
};

use clap::{arg, Command};

mod nft_bench;
mod publish;

use nft_bench::show_result;
use publish::run_publish;

fn cli() -> Command<'static> {
    Command::new("xtask")
        .about("turbo-tooling cargo tasks")
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
        .subcommand(
            Command::new("nft-bench-result")
                .about("Print node-file-trace benchmark result against @vercel/nft"),
        )
        .subcommand(
            Command::new("upgrade-swc")
                .about("Upgrade all SWC dependencies to the lastest version"),
        )
}

fn main() {
    let matches = cli().get_matches();
    match matches.subcommand() {
        Some(("npm", sub_matches)) => {
            let name = sub_matches.get_one::<String>("NAME").expect("required");
            run_publish(name);
        }
        Some(("nft-bench-result", _)) => {
            show_result();
        }
        Some(("upgrade-swc", _)) => {
            let workspace_dir = var_os("CARGO_WORKSPACE_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|| current_dir().unwrap());
            let cargo_lock_path = workspace_dir.join("Cargo.lock");
            let lock = cargo_lock::Lockfile::load(cargo_lock_path).unwrap();
            let packages = lock
                .packages
                .iter()
                .map(|p| (p.name.as_str(), p))
                .collect::<HashMap<_, _>>();
            let mut queue = packages
                .keys()
                .filter(|name| name.starts_with("swc_"))
                .copied()
                .collect::<Vec<_>>();
            let mut set = queue.iter().copied().collect::<HashSet<_>>();
            while let Some(name) = queue.pop() {
                let package = *packages.get(name).unwrap();
                for dep in package.dependencies.iter() {
                    let name = &dep.name.as_str();
                    if set.insert(name) {
                        queue.push(name);
                    }
                }
            }
            let status = process::Command::new("cargo")
                .arg("upgrade")
                .arg("--workspace")
                .args(set.into_iter())
                .current_dir(&workspace_dir)
                .stdout(process::Stdio::inherit())
                .stderr(process::Stdio::inherit())
                .status()
                .expect("Running cargo upgrade failed");
            assert!(status.success());
        }
        _ => {
            panic!("Unknown command {:?}", matches.subcommand().map(|c| c.0));
        }
    }
}
