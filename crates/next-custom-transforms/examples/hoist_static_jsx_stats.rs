//! Measures how many element allocations the hoist_static_jsx transform
//! caches across a real source tree.
//!
//! Each .tsx/.jsx file is run through the production pipeline (resolver,
//! TypeScript strip, automatic-runtime JSX, hoist_static_jsx), then the
//! output is scanned: every `jsx()`/`jsxs()` call is an element allocation,
//! and calls inside a `_hoistedN = ...` initializer only run once.
//!
//! Files are bucketed by their `'use client'` directive as an approximation
//! of the client/server module graphs.
//!
//! Usage:
//!   cargo run -p next-custom-transforms --example hoist_static_jsx_stats -- <dir>...

use std::{env, fs, panic, path::Path};

use next_custom_transforms::transforms::hoist_static_jsx::hoist_static_jsx;
use swc_core::{
    common::{
        FileName, GLOBALS, Globals, Mark, SourceMap,
        comments::SingleThreadedComments,
        errors::{ColorConfig, HANDLER, Handler},
        sync::Lrc,
    },
    ecma::{
        ast::*,
        parser::{EsSyntax, Parser, StringInput, Syntax, TsSyntax},
        transforms::{
            base::{
                helpers::{HELPERS, Helpers},
                resolver,
            },
            react, typescript,
        },
        visit::{Visit, VisitMutWith, VisitWith, noop_visit_type},
    },
};

const SKIPPED_DIRS: &[&str] = &[
    "node_modules",
    ".next",
    ".git",
    ".turbo",
    "dist",
    "__tests__",
    "__mocks__",
];

#[derive(Default)]
struct Stats {
    files: usize,
    jsx_files: usize,
    parse_failures: usize,
    call_sites: usize,
    cache_sites: usize,
    covered_calls: usize,
}

#[derive(Default)]
struct FileResult {
    is_client: bool,
    call_sites: usize,
    cache_sites: usize,
    covered_calls: usize,
}

fn main() {
    let roots: Vec<String> = env::args().skip(1).collect();
    if roots.is_empty() {
        eprintln!("usage: hoist_static_jsx_stats <dir>...");
        std::process::exit(1);
    }

    let mut server = Stats::default();
    let mut client = Stats::default();
    let mut top: Vec<(usize, usize, usize, String)> = Vec::new();

    for root in &roots {
        walk(Path::new(root), &mut |path| {
            let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
                return;
            };
            if !matches!(ext, "tsx" | "jsx") {
                return;
            }
            let name = path.to_string_lossy();
            if name.contains(".test.") || name.contains(".spec.") || name.contains(".stories.") {
                return;
            }
            let Ok(source) = fs::read_to_string(path) else {
                return;
            };

            let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
                process_file(&name, &source, ext == "tsx")
            }));
            match result {
                Ok(Some(r)) => {
                    let bucket = if r.is_client {
                        &mut client
                    } else {
                        &mut server
                    };
                    bucket.files += 1;
                    if r.call_sites > 0 {
                        bucket.jsx_files += 1;
                    }
                    bucket.call_sites += r.call_sites;
                    bucket.cache_sites += r.cache_sites;
                    bucket.covered_calls += r.covered_calls;
                    if !r.is_client && r.cache_sites > 0 {
                        top.push((
                            r.cache_sites,
                            r.covered_calls,
                            r.call_sites,
                            name.into_owned(),
                        ));
                    }
                }
                Ok(None) | Err(_) => {
                    server.files += 1;
                    server.parse_failures += 1;
                }
            }
        });
    }

    print_bucket("server (no 'use client')", &server);
    print_bucket("client ('use client')", &client);

    top.sort_by_key(|entry| std::cmp::Reverse(entry.0));
    println!("top server files by cache sites:");
    for (cache_sites, covered, total, name) in top.iter().take(20) {
        println!("  {cache_sites:>4} sites covering {covered:>4}/{total:<4} calls  {name}");
    }
}

fn print_bucket(label: &str, stats: &Stats) {
    let coverage = if stats.call_sites > 0 {
        100.0 * stats.covered_calls as f64 / stats.call_sites as f64
    } else {
        0.0
    };
    println!("== {label} ==");
    println!(
        "files:            {} (with jsx: {}, parse failures: {})",
        stats.files, stats.jsx_files, stats.parse_failures
    );
    println!("jsx call sites:   {}", stats.call_sites);
    println!("cache sites:      {}", stats.cache_sites);
    println!(
        "covered calls:    {} ({coverage:.1}% of call sites)",
        stats.covered_calls
    );
    println!();
}

fn walk(dir: &Path, f: &mut impl FnMut(&Path)) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if SKIPPED_DIRS.contains(&&*name) || name.starts_with('.') {
                continue;
            }
            walk(&path, f);
        } else {
            f(&path);
        }
    }
}

fn process_file(name: &str, source: &str, is_tsx: bool) -> Option<FileResult> {
    GLOBALS.set(&Globals::new(), || {
        let cm: Lrc<SourceMap> = Default::default();
        let handler = Handler::with_tty_emitter(ColorConfig::Never, false, false, Some(cm.clone()));
        let fm = cm.new_source_file(
            Lrc::new(FileName::Custom(name.to_string())),
            source.to_string(),
        );
        let syntax = if is_tsx {
            Syntax::Typescript(TsSyntax {
                tsx: true,
                decorators: true,
                ..Default::default()
            })
        } else {
            Syntax::Es(EsSyntax {
                jsx: true,
                ..Default::default()
            })
        };
        let mut parser = Parser::new(syntax, StringInput::from(&*fm), None);
        let mut program = Program::Module(parser.parse_module().ok()?);

        let is_client = match &program {
            Program::Module(module) => module
                .body
                .iter()
                .map_while(|item| match item {
                    ModuleItem::Stmt(Stmt::Expr(expr)) => match &*expr.expr {
                        Expr::Lit(Lit::Str(str)) => Some(str.value.clone()),
                        _ => None,
                    },
                    _ => None,
                })
                .any(|directive| directive == "use client"),
            _ => false,
        };

        let unresolved_mark = Mark::new();
        let top_level_mark = Mark::new();
        let comments = SingleThreadedComments::default();

        HANDLER.set(&handler, || {
            HELPERS.set(&Helpers::new(false), || {
                program.mutate(resolver(unresolved_mark, top_level_mark, is_tsx));
                if is_tsx {
                    program.mutate(typescript::typescript(
                        typescript::Config::default(),
                        unresolved_mark,
                        top_level_mark,
                    ));
                }
                program.mutate(react::react(
                    cm.clone(),
                    Some(&comments),
                    react::Options {
                        runtime: Some(react::Runtime::Automatic),
                        development: Some(false),
                        ..Default::default()
                    },
                    top_level_mark,
                    unresolved_mark,
                ));
                program.visit_mut_with(&mut hoist_static_jsx(unresolved_mark));
            })
        });

        let mut counter = CountJsx {
            result: FileResult {
                is_client,
                ..Default::default()
            },
            in_hoisted: false,
        };
        program.visit_with(&mut counter);
        Some(counter.result)
    })
}

struct CountJsx {
    result: FileResult,
    in_hoisted: bool,
}

impl Visit for CountJsx {
    noop_visit_type!();

    fn visit_call_expr(&mut self, call: &CallExpr) {
        call.visit_children_with(self);
        if let Callee::Expr(callee) = &call.callee
            && let Expr::Ident(ident) = &**callee
            && (ident.sym == "_jsx" || ident.sym == "_jsxs")
        {
            self.result.call_sites += 1;
            if self.in_hoisted {
                self.result.covered_calls += 1;
            }
        }
    }

    fn visit_assign_expr(&mut self, assign: &AssignExpr) {
        if let AssignTarget::Simple(SimpleAssignTarget::Ident(ident)) = &assign.left
            && ident.sym.starts_with("_hoisted")
        {
            self.result.cache_sites += 1;
            let prev = self.in_hoisted;
            self.in_hoisted = true;
            assign.right.visit_with(self);
            self.in_hoisted = prev;
            return;
        }
        assign.visit_children_with(self);
    }
}
