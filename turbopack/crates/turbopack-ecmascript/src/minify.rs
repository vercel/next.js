use std::sync::Arc;

use anyhow::{Context, Result, bail};
use bytes_str::BytesStr;
use swc_core::{
    atoms::atom,
    base::try_with_handler,
    common::{
        BytePos, DUMMY_SP, FileName, FilePathMapping, GLOBALS, LineCol, Mark,
        SourceMap as SwcSourceMap,
        comments::{Comments, SingleThreadedComments},
    },
    ecma::{
        self,
        ast::{
            ArrowFunctionBody, AssignExpr, AssignOp, AssignTarget, EsVersion, Expr, ExprStmt,
            Ident, Lit, Program, Script, SeqExpr, SimpleAssignTarget, Stmt,
        },
        codegen::{
            Emitter, Node,
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
use turbo_tasks_fs::rope::Rope;
use turbopack_core::{
    chunk::MangleType,
    code_builder::{Code, CodeBuilder},
};

use crate::parse::{IdentCollector, generate_js_source_map};

/// Minify a whole program, typically a finished chunk.
#[instrument(level = "info", name = "minify ecmascript code", skip_all)]
pub fn minify(code: Code, source_maps: bool, mangle: Option<MangleType>) -> Result<Code> {
    // Pass None for the debug ID so we don't needlessly compute it for the pre-minified content, it
    // will be added by the Code object returned from this function
    let original_map = source_maps.then(|| code.generate_source_map_ref(None));
    let generate_debug_id = code.should_generate_debug_id();
    let source_code = BytesStr::from_utf8(code.into_source_code().into_bytes())?;
    minify_source(
        source_code,
        original_map,
        generate_debug_id,
        mangle,
        MinifyTarget::Program,
    )
}

/// Minify a single chunk item — one module factory expression — rather than the assembled chunk.
///
/// A chunk is a single top-level statement (one call holding every module factory), so minifying
/// the finished chunk cannot be split across cores: SWC parallelises statement lists, and there is
/// only ever one statement. Minifying each factory separately makes the work embarrassingly
/// parallel, and lets turbo-tasks cache it per item so an incremental build only re-minifies the
/// factories that changed.
///
/// This is sound because each factory is its own function scope, so the compressor has no
/// cross-factory optimisations available to it in the first place. Whole-chunk passes that
/// depend on seeing every factory at once are not performed.
///
/// With `strip_strict_directive`, the factory's own `"use strict"` directive is kept while
/// minifying (so strict-mode semantics are applied) but removed from the output. The chunk is
/// then responsible for placing the factory in a strict context, see
/// [`crate::chunk::strict_factory_mode`].
#[instrument(level = "info", name = "minify chunk item", skip_all)]
pub fn minify_chunk_item(
    code: &Code,
    source_maps: bool,
    mangle: Option<MangleType>,
    strip_strict_directive: bool,
) -> Result<Code> {
    let original_map = source_maps.then(|| code.generate_source_map_ref(None));
    let generate_debug_id = code.should_generate_debug_id();
    let source_code = BytesStr::from_utf8(code.source_code().clone().into_bytes())?;
    minify_source(
        source_code,
        original_map,
        generate_debug_id,
        mangle,
        MinifyTarget::ChunkItem {
            strip_strict_directive,
        },
    )
}

/// What [`minify_source`] is minifying. Everything except parsing the input and extracting the
/// output is shared between the two.
#[derive(Clone, Copy)]
enum MinifyTarget {
    /// A whole program whose top-level statements are side-effectful and are kept.
    Program,
    /// A single chunk item: a module factory expression, optionally preceded by the additional
    /// module ids of a merged (scope hoisted) module, i.e. `id2, id3, <factory>`.
    ///
    /// On its own the factory is an unused expression the compressor would discard, so it is
    /// wrapped in a synthetic `CHUNK_ITEM_SENTINEL = <factory>` assignment, which is stripped
    /// again before printing. The leading ids are split off before minification (as part of a
    /// sequence expression the compressor would drop them as side-effect free) and re-emitted
    /// unchanged in front of the minified factory.
    ///
    /// The wrapper is added at the AST level rather than by prepending text: prepending would
    /// shift every column on the first line and invalidate the item's existing source map. The
    /// synthetic nodes carry `DUMMY_SP` and contribute no mappings or source map names.
    ChunkItem { strip_strict_directive: bool },
}

/// Name the chunk item expression is assigned to while it is minified. It is never emitted. An
/// undeclared global is used because the mangler leaves unresolved names alone.
const CHUNK_ITEM_SENTINEL: &str = "__TURBOPACK_CHUNK_ITEM__";

fn minify_source(
    source_code: BytesStr,
    original_map: Option<Rope>,
    generate_debug_id: bool,
    mangle: Option<MangleType>,
    target: MinifyTarget,
) -> Result<Code> {
    let cm = Arc::new(SwcSourceMap::new(FilePathMapping::empty()));
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

    let (src, mut src_map_buf, source_map_names) =
        try_with_handler(cm.clone(), Default::default(), |handler| {
            GLOBALS.set(&Default::default(), || {
                // Expressions emitted verbatim in front of a chunk item's factory (its additional
                // module ids). Always empty for `MinifyTarget::Program`.
                let mut item_prefix = Vec::new();
                let parsed = match target {
                    MinifyTarget::Program => parser.parse_program(),
                    MinifyTarget::ChunkItem { .. } => parser.parse_expr().map(|expr| {
                        let factory = match *expr {
                            Expr::Seq(mut seq) if seq.exprs.len() > 1 => {
                                let factory = seq.exprs.pop().unwrap();
                                item_prefix = seq.exprs;
                                factory
                            }
                            expr => Box::new(expr),
                        };
                        wrap_in_sentinel(factory)
                    }),
                };
                let program = match parsed {
                    Ok(program) => program,
                    Err(err) => {
                        err.into_diagnostic(handler).emit();
                        bail!("failed to parse source code\n{}", fm.src)
                    }
                };

                // Collect identifier names for source maps before minification. Synthetic nodes
                // (the sentinel) have dummy spans and are skipped by the collector.
                let source_map_names = if original_map.is_some() {
                    let mut collector = IdentCollector::default();
                    program.visit_with(&mut collector);
                    collector.into_map()
                } else {
                    Default::default()
                };

                let mut program = optimize(program, &cm, &comments, mangle);

                let (src, src_map_buf) = match target {
                    MinifyTarget::Program => print(&cm, &program, original_map.is_some())?,
                    // Emit only the factory expression, so the result can be spliced back into
                    // the chunk. Emitting it as a statement would turn a `function (…) {}`
                    // factory into a declaration.
                    MinifyTarget::ChunkItem {
                        strip_strict_directive,
                    } => {
                        let factory = take_sentinel_rhs(&mut program).context(
                            "chunk item minification lost its sentinel assignment; the compressor \
                             rewrote the wrapper unexpectedly",
                        )?;
                        if strip_strict_directive {
                            remove_use_strict_directive(factory);
                        }
                        let factory = &*factory;
                        if item_prefix.is_empty() {
                            print(&cm, factory, original_map.is_some())?
                        } else {
                            let mut exprs = item_prefix;
                            exprs.push(Box::new(factory.clone()));
                            let seq = Expr::Seq(SeqExpr {
                                span: DUMMY_SP,
                                exprs,
                            });
                            print(&cm, &seq, original_map.is_some())?
                        }
                    }
                };
                Ok((src, src_map_buf, source_map_names))
            })
        })
        .map_err(|e| e.to_pretty_error())?;

    let mut builder = CodeBuilder::new(original_map.is_some(), generate_debug_id);
    if let Some(original_map) = original_map.as_ref() {
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
        builder.push_source(&src.into(), None::<Rope>);
    }
    Ok(builder.build())
}

/// Run the resolver, the SWC minifier and the post-minification fixups on a parsed program.
fn optimize(
    program: Program,
    cm: &Arc<SwcSourceMap>,
    comments: &SingleThreadedComments,
    mangle: Option<MangleType>,
) -> Program {
    let unresolved_mark = Mark::new();
    let top_level_mark = Mark::new();

    let program = program.apply(paren_remover(Some(comments)));

    let program = program.apply(swc_core::ecma::transforms::base::resolver(
        unresolved_mark,
        top_level_mark,
        false,
    ));

    let mut program = swc_core::ecma::minifier::optimize(
        program,
        cm.clone(),
        Some(comments),
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

    program.apply(ecma::transforms::base::fixer::fixer(Some(
        comments as &dyn Comments,
    )))
}

/// Wrap a chunk item expression as `CHUNK_ITEM_SENTINEL = <expr>;`. See
/// [`MinifyTarget::ChunkItem`].
fn wrap_in_sentinel(expr: Box<Expr>) -> Program {
    Program::Script(Script {
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
    })
}

/// Pull the right-hand side back out of the synthetic `SENTINEL = <factory>` wrapper.
fn take_sentinel_rhs(program: &mut Program) -> Option<&mut Expr> {
    let Program::Script(script) = program else {
        return None;
    };
    let [Stmt::Expr(stmt)] = script.body.as_mut_slice() else {
        return None;
    };
    let Expr::Assign(assign) = &mut *stmt.expr else {
        return None;
    };
    Some(&mut assign.right)
}

/// Remove a leading `"use strict"` directive from a factory function's body.
fn remove_use_strict_directive(factory: &mut Expr) {
    let body = match factory {
        Expr::Paren(paren) => return remove_use_strict_directive(&mut paren.expr),
        Expr::Arrow(arrow) => match &mut *arrow.body {
            ArrowFunctionBody::FunctionBody(body) => &mut body.stmts,
            ArrowFunctionBody::Expr(_) => return,
        },
        Expr::Fn(f) => match &mut f.function.body {
            Some(block) => &mut block.stmts,
            None => return,
        },
        _ => return,
    };
    if body.first().is_some_and(is_use_strict_directive) {
        body.remove(0);
    }
}

fn is_use_strict_directive(stmt: &Stmt) -> bool {
    matches!(
        stmt,
        Stmt::Expr(ExprStmt { expr, .. })
            if matches!(&**expr, Expr::Lit(Lit::Str(s)) if &*s.value == "use strict")
    )
}

// From https://github.com/swc-project/swc/blob/11efd4e7c5e8081f8af141099d3459c3534c1e1d/crates/swc/src/lib.rs#L523-L560
fn print(
    cm: &Arc<SwcSourceMap>,
    node: &impl Node,
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

            node.emit_with(&mut emitter)
                .context("failed to emit module")?;
        }
        // Invalid utf8 is valid in javascript world.
        // SAFETY: SWC generates valid utf8.
        unsafe { String::from_utf8_unchecked(buf) }
    };

    Ok((src, src_map_buf))
}

#[cfg(test)]
mod tests {
    use turbopack_core::{chunk::MangleType, code_builder::CodeBuilder};

    use super::*;

    fn code(src: &str) -> Code {
        let mut builder = CodeBuilder::new(false, false);
        builder.push_source(&src.to_string().into(), None::<Rope>);
        builder.build()
    }

    fn minify_item(src: &str, mangle: Option<MangleType>) -> String {
        let out = minify_chunk_item(&code(src), false, mangle, false).unwrap();
        out.source_code().to_str().unwrap().into_owned()
    }

    #[test]
    fn function_factory_stays_an_expression() {
        let out = minify_item(
            r#"function (__turbopack_context__) {
                const value = 1 + 2;
                __turbopack_context__.v(value);
            }"#,
            Some(MangleType::OptimalSize),
        );
        assert!(!out.contains(CHUNK_ITEM_SENTINEL), "{out}");
        assert!(out.starts_with("function("), "{out}");
        assert!(out.contains(".v(3)"), "{out}");
    }

    #[test]
    fn arrow_factory_is_minified_and_mangled() {
        let out = minify_item(
            r#"(__turbopack_context__) => {
                const someLongLocalName = __turbopack_context__.r(1);
                return someLongLocalName.foo + someLongLocalName.bar;
            }"#,
            Some(MangleType::Deterministic),
        );
        assert!(!out.contains(CHUNK_ITEM_SENTINEL), "{out}");
        assert!(!out.contains("someLongLocalName"), "{out}");
        assert!(!out.contains("__turbopack_context__"), "{out}");
    }

    #[test]
    fn use_strict_directive_is_kept() {
        let out = minify_item(
            r#"function (e) { "use strict"; e.v(1); }"#,
            Some(MangleType::OptimalSize),
        );
        assert!(out.contains("\"use strict\""), "{out}");
    }

    #[test]
    fn source_map_is_generated() {
        let mut builder = CodeBuilder::new(true, false);
        builder.push_source(
            &"function (ctx) { const value = 1; ctx.v(value); }"
                .to_string()
                .into(),
            None::<Rope>,
        );
        let out = minify_chunk_item(&builder.build(), true, Some(MangleType::OptimalSize), false)
            .unwrap();
        assert!(out.has_source_map());
        assert!(
            !out.source_code()
                .to_str()
                .unwrap()
                .contains(CHUNK_ITEM_SENTINEL)
        );
    }

    #[test]
    fn use_strict_directive_can_be_stripped() {
        for src in [
            r#"function (e) { "use strict"; e.v(1); }"#,
            r#"((e) => { "use strict"; e.v(1); })"#,
            r#"1, (e) => { "use strict"; e.v(1); }"#,
        ] {
            let out =
                minify_chunk_item(&code(src), false, Some(MangleType::OptimalSize), true).unwrap();
            let out = out.source_code().to_str().unwrap().into_owned();
            assert!(!out.contains("use strict"), "{out}");
            assert!(out.contains(".v(1)"), "{out}");
        }
    }

    #[test]
    fn additional_module_ids_are_kept() {
        // Merged (scope hoisted) modules prefix their factory with their additional ids.
        let out = minify_item(
            "85296, \"other id\", (__turbopack_context__) => {\n__turbopack_context__.v(1 + 2);\n}",
            Some(MangleType::OptimalSize),
        );
        assert!(out.starts_with("85296,\"other id\","), "{out}");
        assert!(out.contains(".v(3)"), "{out}");
        assert!(!out.contains(CHUNK_ITEM_SENTINEL), "{out}");
    }

    #[test]
    fn whole_program_still_keeps_statements() {
        let out = minify(
            code("globalThis.TURBOPACK = [1, function () { return 2 }];"),
            false,
            Some(MangleType::OptimalSize),
        )
        .unwrap();
        let out = out.source_code().to_str().unwrap().into_owned();
        assert!(out.contains("globalThis.TURBOPACK"), "{out}");
    }
}
