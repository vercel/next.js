use std::{
    io::{Read, stdin},
    sync::Arc,
};

use anyhow::Result;
use clap::Parser;
use owo_colors::OwoColorize;
use regex::{NoExpand, Regex};
use swc_core::{
    base::{Compiler, HandlerOpts, config::IsModule, try_with_handler},
    common::{GLOBALS, Globals, SourceMap, errors::ColorConfig, source_map::FileName},
    ecma::{
        ast::EsVersion,
        parser::{Syntax, TsSyntax},
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
    stdin().read_to_string(&mut contents)?;

    let sm = Arc::new(SourceMap::default());
    let file = sm.new_source_file(FileName::Anon.into(), contents);
    let target = EsVersion::latest();
    let syntax = Syntax::Typescript(TsSyntax {
        tsx: true,
        ..Default::default()
    });

    let compiler = Compiler::new(sm.clone());
    let res = GLOBALS
        .set(&Globals::new(), || {
            try_with_handler(
                sm,
                HandlerOpts {
                    color: ColorConfig::Always,
                    skip_filename: false,
                },
                |handler| compiler.parse_js(file, handler, target, syntax, IsModule::Unknown, None),
            )
        })
        .map_err(|e| e.to_pretty_error());

    let print = format!("{:#?}", res?);

    let stripped = if args.spans {
        print
    } else {
        let span = Regex::new(r"(?m)^\s+\w+: Span \{[^}]*\},\n").unwrap();
        span.replace_all(&print, NoExpand("")).to_string()
    };

    let alternate_ws = Regex::new(r" {8}").unwrap();
    let alternating = alternate_ws.replace_all(
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
