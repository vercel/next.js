use std::{io::stdin, sync::Arc};

use anyhow::Result;
use clap::Parser;
use owo_colors::OwoColorize;
use regex::{NoExpand, Regex};
use swc_core::{
    base::{config::IsModule, try_with_handler, Compiler, HandlerOpts},
    common::{errors::ColorConfig, source_map::FileName, Globals, SourceMap, GLOBALS},
    ecma::{
        ast::EsVersion,
        parser::{Syntax, TsConfig},
    },
};

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct Args {
    /// Whether to keep Span (location) markers
    #[clap(long, value_parser, default_value_t = false)]
    spans: bool,
}

fn main() -> Result<()> {
    let args = Args::parse();

    let mut contents = String::new();
    stdin().read_line(&mut contents)?;

    let sm = Arc::new(SourceMap::default());
    let file = sm.new_source_file(FileName::Anon, contents);
    let target = EsVersion::latest();
    let syntax = Syntax::Typescript(TsConfig {
        tsx: true,
        decorators: false,
        dts: false,
        no_early_errors: true,
    });

    let compiler = Compiler::new(sm.clone());
    let res = GLOBALS.set(&Globals::new(), || {
        try_with_handler(
            sm,
            HandlerOpts {
                color: ColorConfig::Always,
                skip_filename: false,
            },
            |handler| compiler.parse_js(file, handler, target, syntax, IsModule::Unknown, None),
        )
    });

    let print = format!("{:#?}", res?);

    let stripped = if args.spans {
        print
    } else {
        let span = Regex::new(r"(?m)^\s+\w+: Span \{[^}]*\},\n").unwrap();
        span.replace_all(&print, NoExpand("")).to_string()
    };

    let alernate_ws = Regex::new(r" {8}").unwrap();
    let alternating = alernate_ws.replace_all(
        &stripped,
        NoExpand(&format!(
            "{}{}",
            "    ".on_default_color(),
            "    ".on_black()
        )),
    );
    let ws = Regex::new(r" {4}").unwrap();
    println!("{}", ws.replace_all(&alternating, NoExpand("  ")));

    Ok(())
}
