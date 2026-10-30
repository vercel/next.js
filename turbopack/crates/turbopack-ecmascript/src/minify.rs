use std::sync::Arc;

use anyhow::{Context, Result, bail};
use bytes_str::BytesStr;
use swc_core::{
    atoms::atom,
    base::try_with_handler,
    common::{
        BytePos, FileName, FilePathMapping, GLOBALS, LineCol, Mark, SourceMap as SwcSourceMap,
        comments::{Comments, SingleThreadedComments},
    },
    ecma::{
        self,
        ast::{EsVersion, Program},
        codegen::{
            Emitter,
            text_writer::{self, JsWriter, WriteJs},
        },
        minifier::option::{CompressOptions, ExtraOptions, MangleOptions, MinifyOptions},
        parser::{Parser, StringInput, Syntax, lexer::Lexer},
        transforms::base::{
            fixer::paren_remover,
            hygiene::{self, hygiene_with_config},
        },
        visit::VisitWith,
    },
};
use tracing::instrument;
use turbopack_core::{
    chunk::MangleType,
    code_builder::{Code, CodeBuilder},
};

use crate::parse::{IdentCollector, generate_js_source_map};

#[instrument(level = "info", name = "minify ecmascript code", skip_all)]
pub fn minify(code: Code, source_maps: bool, mangle: Option<MangleType>) -> Result<Code> {
    // Pass None for the debug ID so we don't needlessly compute it for the pre-minified content, it
    // will be added by the Code object returned from this function
    let source_maps = source_maps.then(|| code.generate_source_map_ref(None));

    let generate_debug_id = code.should_generate_debug_id();
    let source_code = BytesStr::from_utf8(code.into_source_code().into_bytes())?;

    let cm = Arc::new(SwcSourceMap::new(FilePathMapping::empty()));
    let (src, mut src_map_buf, source_map_names) = {
        let fm = cm.new_source_file(FileName::Anon.into(), source_code);

        // Collect all comments and pass to the minifier so that `PURE` comments are respected.
        let comments = SingleThreadedComments::default();

        let lexer = Lexer::new(
            Syntax::default(),
            EsVersion::latest(),
            StringInput::from(&*fm),
            Some(&comments),
        );
        let mut parser = Parser::new_from(lexer);

        let (program, source_map_names) =
            try_with_handler(cm.clone(), Default::default(), |handler| {
                GLOBALS.set(&Default::default(), || {
                    let program = match parser.parse_program() {
                        Ok(program) => program,
                        Err(err) => {
                            err.into_diagnostic(handler).emit();
                            bail!("failed to parse source code\n{}", fm.src)
                        }
                    };

                    // Collect identifier names for source maps before minification
                    let source_map_names = if source_maps.is_some() {
                        let mut collector = IdentCollector::default();
                        program.visit_with(&mut collector);
                        collector.into_map()
                    } else {
                        Default::default()
                    };

                    let unresolved_mark = Mark::new();
                    let top_level_mark = Mark::new();

                    let program = program.apply(paren_remover(Some(&comments)));

                    let program = program.apply(swc_core::ecma::transforms::base::resolver(
                        unresolved_mark,
                        top_level_mark,
                        false,
                    ));

                    let mut program = swc_core::ecma::minifier::optimize(
                        program,
                        cm.clone(),
                        Some(&comments),
                        None,
                        &MinifyOptions {
                            compress: Some(CompressOptions {
                                // Only run 2 passes, this is a tradeoff between performance and
                                // compression size. Default is 3 passes.
                                passes: 2,
                                keep_classnames: mangle.is_none(),
                                keep_fnames: mangle.is_none(),
                                ..Default::default()
                            }),
                            mangle: mangle.map(|mangle| {
                                let reserved = vec![atom!("AbortSignal")];
                                match mangle {
                                    MangleType::OptimalSize => MangleOptions {
                                        reserved,
                                        ..Default::default()
                                    },
                                    MangleType::Deterministic => MangleOptions {
                                        reserved,
                                        disable_char_freq: true,
                                        ..Default::default()
                                    },
                                }
                            }),
                            ..Default::default()
                        },
                        &ExtraOptions {
                            top_level_mark,
                            unresolved_mark,
                            mangle_name_cache: None,
                        },
                    );

                    if mangle.is_none() {
                        program.mutate(hygiene_with_config(hygiene::Config {
                            top_level_mark,
                            ..Default::default()
                        }));
                    }

                    let program = program.apply(ecma::transforms::base::fixer::fixer(Some(
                        &comments as &dyn Comments,
                    )));

                    Ok((program, source_map_names))
                })
            })
            .map_err(|e| e.to_pretty_error())?;

        let (src, src_map_buf) = print_program(cm.clone(), program, source_maps.is_some())?;
        (src, src_map_buf, source_map_names)
    };

    let mut builder = CodeBuilder::new(source_maps.is_some(), generate_debug_id);
    if let Some(original_map) = source_maps.as_ref() {
        src_map_buf.shrink_to_fit();
        builder.push_source(
            &src.into(),
            Some(generate_js_source_map(
                &*cm,
                src_map_buf,
                Some(original_map),
                true,
                // We do not inline source contents.
                // We provide a synthesized value to `cm.new_source_file` above, so it cannot be
                // the value user expect anyway.
                false,
                source_map_names,
            )?),
        );
    } else {
        builder.push_source(&src.into(), None::<turbo_tasks_fs::rope::Rope>);
    }
    Ok(builder.build())
}

// From https://github.com/swc-project/swc/blob/11efd4e7c5e8081f8af141099d3459c3534c1e1d/crates/swc/src/lib.rs#L523-L560
fn print_program(
    cm: Arc<SwcSourceMap>,
    program: Program,
    source_maps: bool,
) -> Result<(String, Vec<(BytePos, LineCol)>)> {
    let mut src_map_buf = vec![];

    let src = {
        let mut buf = vec![];
        {
            let wr = Box::new(text_writer::omit_trailing_semi(Box::new(JsWriter::new(
                cm.clone(),
                "\n",
                &mut buf,
                source_maps.then_some(&mut src_map_buf),
            )))) as Box<dyn WriteJs>;

            let mut emitter = Emitter {
                cfg: swc_core::ecma::codegen::Config::default().with_minify(true),
                comments: None,
                cm: cm.clone(),
                wr,
            };

            emitter
                .emit_program(&program)
                .context("failed to emit module")?;
        }
        // Invalid utf8 is valid in javascript world.
        // SAFETY: SWC generates valid utf8.
        unsafe { String::from_utf8_unchecked(buf) }
    };

    Ok((src, src_map_buf))
}

/// Name the chunk item expression is assigned to while it is minified. It is never emitted: the
/// assignment exists only so the compressor sees a statement with observable side effects and
/// does not discard the factory as an unused expression. An undeclared global is used because
/// the mangler leaves unresolved names alone.
const CHUNK_ITEM_SENTINEL: &str = "__TURBOPACK_CHUNK_ITEM__";

/// Minify a single chunk item — one module factory expression — rather than the assembled chunk.
///
/// A browser chunk is a single top-level statement (one `.push([...])` call holding every module
/// factory), so minifying the finished chunk cannot be split across cores: SWC parallelises
/// statement lists, and there is only ever one statement. Minifying each factory separately makes
/// the work embarrassingly parallel, and lets turbo-tasks cache it per item so an incremental
/// build only re-minifies the factories that changed.
///
/// This is sound because each factory is its own function scope, so the compressor has no
/// cross-factory optimisations available to it in the first place. Two consequences are worth
/// knowing:
///
/// * Output is marginally larger. A factory inside a strict wrapper keeps its own `"use strict"`
///   directive, because a per-item pass cannot see the wrapper the chunk will place it in.
/// * Whole-chunk passes that depend on seeing every factory at once are not performed.
///
/// The factory is wrapped in a synthetic assignment at the AST level rather than by prepending
/// text to the source. Prepending would shift every column on the first line and invalidate the
/// item's existing source map; the synthetic nodes carry `DUMMY_SP` and contribute no mappings,
/// so the parsed expression keeps the spans it was parsed with.
#[instrument(level = "info", name = "minify chunk item", skip_all)]
pub fn minify_chunk_item(
    code: &Code,
    source_maps: bool,
    mangle: Option<MangleType>,
) -> Result<Code> {
    use swc_core::{
        common::DUMMY_SP,
        ecma::ast::{
            AssignExpr, AssignOp, AssignTarget, Expr, ExprStmt, Ident, Script, SimpleAssignTarget,
            Stmt,
        },
    };

    let original_map = source_maps.then(|| code.generate_source_map_ref(None));
    let generate_debug_id = code.should_generate_debug_id();
    let source_code = BytesStr::from_utf8(code.source_code().clone().into_bytes())?;

    let cm = Arc::new(SwcSourceMap::new(FilePathMapping::empty()));
    let fm = cm.new_source_file(FileName::Anon.into(), source_code);
    let comments = SingleThreadedComments::default();
    let lexer = Lexer::new(
        Syntax::default(),
        EsVersion::latest(),
        StringInput::from(&*fm),
        Some(&comments),
    );
    let mut parser = Parser::new_from(lexer);

    let (minified, src_map_buf, source_map_names) =
        try_with_handler(cm.clone(), Default::default(), |handler| {
            GLOBALS.set(&Default::default(), || {
                let expr = match parser.parse_expr() {
                    Ok(expr) => expr,
                    Err(err) => {
                        err.into_diagnostic(handler).emit();
                        bail!("failed to parse chunk item\n{}", fm.src)
                    }
                };

                let source_map_names = if original_map.is_some() {
                    let mut collector = IdentCollector::default();
                    expr.visit_with(&mut collector);
                    collector.into_map()
                } else {
                    Default::default()
                };

                let unresolved_mark = Mark::new();
                let top_level_mark = Mark::new();

                let program = Program::Script(Script {
                    span: DUMMY_SP,
                    body: vec![Stmt::Expr(ExprStmt {
                        span: DUMMY_SP,
                        expr: Box::new(Expr::Assign(AssignExpr {
                            span: DUMMY_SP,
                            op: AssignOp::Assign,
                            left: AssignTarget::Simple(SimpleAssignTarget::Ident(
                                Ident::new_no_ctxt(CHUNK_ITEM_SENTINEL.into(), DUMMY_SP).into(),
                            )),
                            right: expr,
                        })),
                    })],
                    shebang: None,
                });

                let program = program.apply(paren_remover(Some(&comments)));
                let program = program.apply(swc_core::ecma::transforms::base::resolver(
                    unresolved_mark,
                    top_level_mark,
                    false,
                ));

                let mut program = swc_core::ecma::minifier::optimize(
                    program,
                    cm.clone(),
                    Some(&comments),
                    None,
                    &MinifyOptions {
                        compress: Some(CompressOptions {
                            // Match `minify`: 2 passes rather than the default 3.
                            passes: 2,
                            keep_classnames: mangle.is_none(),
                            keep_fnames: mangle.is_none(),
                            ..Default::default()
                        }),
                        mangle: mangle.map(|mangle| {
                            let reserved = vec![atom!("AbortSignal")];
                            match mangle {
                                MangleType::OptimalSize => MangleOptions {
                                    reserved,
                                    ..Default::default()
                                },
                                MangleType::Deterministic => MangleOptions {
                                    reserved,
                                    disable_char_freq: true,
                                    ..Default::default()
                                },
                            }
                        }),
                        ..Default::default()
                    },
                    &ExtraOptions {
                        top_level_mark,
                        unresolved_mark,
                        mangle_name_cache: None,
                    },
                );

                if mangle.is_none() {
                    program.mutate(hygiene_with_config(hygiene::Config {
                        top_level_mark,
                        ..Default::default()
                    }));
                }
                let program = program.apply(ecma::transforms::base::fixer::fixer(Some(
                    &comments as &dyn Comments,
                )));

                // Unwrap the sentinel assignment and emit only the factory expression, so the
                // result can be spliced back into the chunk's array. Emitting it as a statement
                // would turn a `function (…) {}` factory into a declaration.
                let factory = take_sentinel_rhs(program).context(
                    "chunk item minification lost its sentinel assignment; the compressor rewrote \
                     the wrapper unexpectedly",
                )?;
                let (src, src_map_buf) = print_expr(cm.clone(), &factory, original_map.is_some())?;
                Ok((src, src_map_buf, source_map_names))
            })
        })
        .map_err(|e| e.to_pretty_error())?;

    let mut builder = CodeBuilder::new(original_map.is_some(), generate_debug_id);
    if let Some(original_map) = original_map.as_ref() {
        let mut src_map_buf = src_map_buf;
        src_map_buf.shrink_to_fit();
        builder.push_source(
            &minified.into(),
            Some(generate_js_source_map(
                &*cm,
                src_map_buf,
                Some(original_map),
                true,
                false,
                source_map_names,
            )?),
        );
    } else {
        builder.push_source(&minified.into(), None::<turbo_tasks_fs::rope::Rope>);
    }
    Ok(builder.build())
}

/// Pull the right-hand side back out of the synthetic `SENTINEL = <factory>` wrapper.
fn take_sentinel_rhs(program: Program) -> Option<Box<swc_core::ecma::ast::Expr>> {
    use swc_core::ecma::ast::{Expr, Stmt};
    let Program::Script(script) = program else {
        return None;
    };
    let [Stmt::Expr(stmt)] = script.body.as_slice() else {
        return None;
    };
    let Expr::Assign(assign) = &*stmt.expr else {
        return None;
    };
    Some(assign.right.clone())
}

/// Emit a bare expression, mirroring [`print_program`]'s writer configuration.
fn print_expr(
    cm: Arc<SwcSourceMap>,
    expr: &swc_core::ecma::ast::Expr,
    source_maps: bool,
) -> Result<(String, Vec<(BytePos, LineCol)>)> {
    use swc_core::ecma::codegen::Node;

    let mut src_map_buf = vec![];
    let mut buf = vec![];
    {
        let wr = Box::new(text_writer::omit_trailing_semi(Box::new(JsWriter::new(
            cm.clone(),
            "\n",
            &mut buf,
            source_maps.then_some(&mut src_map_buf),
        )))) as Box<dyn WriteJs>;
        let mut emitter = Emitter {
            cfg: swc_core::ecma::codegen::Config::default().with_minify(true),
            comments: None,
            cm: cm.clone(),
            wr,
        };
        expr.emit_with(&mut emitter)
            .context("failed to emit chunk item")?;
    }
    Ok((String::from_utf8(buf)?, src_map_buf))
}
