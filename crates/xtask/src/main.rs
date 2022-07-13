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
        _ => {
            panic!("Unknown command {:?}", matches.subcommand().map(|c| c.0));
        }
    }
}
