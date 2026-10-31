use std::{ops::Range, sync::Arc};

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

/// Minifies a single chunk item: one module factory expression, optionally preceded by the
/// additional module ids of a merged module (`id2, id3, <factory>`). The ids are emitted
/// unchanged and only the factory is minified, so the result can be placed in a chunk as is.
///
/// A strict factory keeps its `"use strict"` directive. If it survives minification (the
/// compressor may drop it where it provably makes no difference), its position is recorded on
/// the returned [`Code`], so that a chunk placing the factory in a strict context anyway can
/// remove it again, see [`CodeBuilder::push_code_without_strict_directive`].
#[instrument(level = "info", name = "minify chunk item", skip_all)]
pub fn minify_chunk_item(
    code: &Code,
    source_maps: bool,
    mangle: Option<MangleType>,
) -> Result<Code> {
    let original_map = source_maps.then(|| code.generate_source_map_ref(None));
    let generate_debug_id = code.should_generate_debug_id();
    let source_code = BytesStr::from_utf8(code.source_code().clone().into_bytes())?;
    minify_source(
        source_code,
        original_map,
        generate_debug_id,
        mangle,
        MinifyTarget::ChunkItem,
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
    ChunkItem,
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

    let (output, source_map_names) = try_with_handler(cm.clone(), Default::default(), |handler| {
        GLOBALS.set(&Default::default(), || {
            // Expressions emitted verbatim in front of a chunk item's factory (its additional
            // module ids). Always empty for `MinifyTarget::Program`.
            let mut item_prefix = Vec::new();
            let parsed = match target {
                MinifyTarget::Program => parser.parse_program(),
                MinifyTarget::ChunkItem => parser.parse_expr().map(|expr| {
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

            let output = match target {
                MinifyTarget::Program => {
                    let (src, src_map_buf) = print(&cm, &program, original_map.is_some())?;
                    MinifiedOutput {
                        prefix: None,
                        src,
                        src_map_buf,
                        strict_directive: None,
                    }
                }
                // Emit only the factory expression, so the result can be spliced back into
                // the chunk. Emitting it as a statement would turn a `function (…) {}`
                // factory into a declaration.
                MinifyTarget::ChunkItem => {
                    let factory = take_sentinel_rhs(&mut program).context(
                        "chunk item minification lost its sentinel assignment; the compressor \
                         rewrote the wrapper unexpectedly",
                    )?;
                    // The additional module ids are synthetic code without mappings, so they
                    // are printed on their own, in front of the factory.
                    let prefix = match item_prefix.len() {
                        0 => None,
                        1 => Some(print(&cm, &*item_prefix[0], false)?.0),
                        _ => Some(
                            print(
                                &cm,
                                &Expr::Seq(SeqExpr {
                                    span: DUMMY_SP,
                                    exprs: item_prefix,
                                }),
                                false,
                            )?
                            .0,
                        ),
                    };
                    let has_directive = body_starts_with_use_strict(factory);
                    let (src, src_map_buf) = print(&cm, &*factory, original_map.is_some())?;
                    let strict_directive = if has_directive {
                        find_leading_use_strict(&src)
                    } else {
                        None
                    };
                    MinifiedOutput {
                        prefix,
                        src,
                        src_map_buf,
                        strict_directive,
                    }
                }
            };
            Ok((output, source_map_names))
        })
    })
    .map_err(|e| e.to_pretty_error())?;

    let MinifiedOutput {
        prefix,
        src,
        src_map_buf,
        strict_directive,
    } = output;
    let source_map = |src_map_buf: Vec<(BytePos, LineCol)>| {
        original_map
            .as_ref()
            .map(|original_map| {
                generate_js_source_map(
                    &*cm,
                    src_map_buf,
                    Some(original_map),
                    true,
                    // We do not inline source contents.
                    // We provide a synthesized value to `cm.new_source_file` above, so it cannot
                    // be the value user expect anyway.
                    false,
                    source_map_names.clone(),
                )
            })
            .transpose()
    };

    let mut builder = CodeBuilder::new(original_map.is_some(), generate_debug_id);
    if let Some(prefix) = prefix {
        builder.push_source(&format!("{prefix},").into(), None::<Rope>);
    }
    match strict_directive {
        None => builder.push_source(&src.into(), source_map(src_map_buf)?),
        Some(directive) => {
            // The directive becomes its own unmapped section, so that a chunk can remove it
            // without rewriting any source map. The code in front of it is the factory's
            // synthetic head (`function(e){` or `e=>{`, unmapped in the unminified factory as
            // well), so it is emitted unmapped too. The mappings of the body move into a section
            // starting right after the directive.
            let body_map = mappings_after(&src, src_map_buf, directive.end);
            builder.push_source(&src[..directive.start].to_string().into(), None::<Rope>);
            builder.push_strict_directive();
            builder.push_source(
                &src[directive.end..].to_string().into(),
                source_map(body_map)?,
            );
        }
    }
    Ok(builder.build())
}

struct MinifiedOutput {
    /// Code emitted unmapped in front of `src`, followed by a comma.
    prefix: Option<String>,
    src: String,
    src_map_buf: Vec<(BytePos, LineCol)>,
    /// Byte range in `src` of the factory's leading `"use strict"` directive.
    strict_directive: Option<Range<usize>>,
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

/// Whether a factory function's body starts with a `"use strict"` directive.
fn body_starts_with_use_strict(factory: &Expr) -> bool {
    let body = match factory {
        Expr::Paren(paren) => return body_starts_with_use_strict(&paren.expr),
        Expr::Arrow(arrow) => match &*arrow.body {
            ArrowFunctionBody::FunctionBody(body) => &body.stmts,
            ArrowFunctionBody::Expr(_) => return false,
        },
        Expr::Fn(f) => match &f.function.body {
            Some(block) => &block.stmts,
            None => return false,
        },
        _ => return false,
    };
    body.first().is_some_and(is_use_strict_directive)
}

/// Finds the `"use strict"` directive (with its `;`, if any) that starts the body of the printed
/// factory `src`. Only called once the AST showed that the body starts with one.
///
/// The parameters of a module factory are plain identifiers, so the first `{` opens the body.
fn find_leading_use_strict(src: &str) -> Option<Range<usize>> {
    let start = src.find('{')? + 1;
    let rest = &src[start..];
    let len = ["\"use strict\"", "'use strict'"]
        .into_iter()
        .find(|directive| rest.starts_with(directive))?
        .len();
    let len = if rest[len..].starts_with(';') {
        len + 1
    } else {
        len
    };
    Some(start..start + len)
}

/// The generated mappings of `src` at or after byte `offset`, relative to `offset`.
fn mappings_after(
    src: &str,
    mappings: Vec<(BytePos, LineCol)>,
    offset: usize,
) -> Vec<(BytePos, LineCol)> {
    // Generated columns count UTF-16 code units.
    let before = &src[..offset];
    let line_start = before.rfind('\n').map_or(0, |i| i + 1);
    let line = before.matches('\n').count() as u32;
    let col = before[line_start..].encode_utf16().count() as u32;
    mappings
        .into_iter()
        .filter(|(_, lc)| (lc.line, lc.col) >= (line, col))
        .map(|(pos, lc)| {
            let lc = if lc.line == line {
                LineCol {
                    line: 0,
                    col: lc.col - col,
                }
            } else {
                LineCol {
                    line: lc.line - line,
                    col: lc.col,
                }
            };
            (pos, lc)
        })
        .collect()
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
    use swc_sourcemap::{DecodedMap, SourceMapBuilder};
    use turbopack_core::{
        chunk::MangleType,
        code_builder::{CodeBuilder, STRICT_DIRECTIVE},
    };

    use super::*;

    fn code(src: &str) -> Code {
        let mut builder = CodeBuilder::new(false, false);
        builder.push_source(&src.to_string().into(), None::<Rope>);
        builder.build()
    }

    fn minify_item(src: &str, mangle: Option<MangleType>) -> String {
        let out = minify_chunk_item(&code(src), false, mangle).unwrap();
        out.source_code().to_str().unwrap().into_owned()
    }

    /// The minified code and the text of its recorded strict directive.
    fn minify_strict(src: &str) -> (Code, String, Option<String>) {
        let out = minify_chunk_item(&code(src), false, Some(MangleType::Deterministic)).unwrap();
        let text = out.source_code().to_str().unwrap().into_owned();
        let directive = out.strict_directive().map(|range| {
            // The directive starts the factory body.
            assert_eq!(&text[range.start - 1..range.start], "{", "{text}");
            text[range].to_string()
        });
        (out, text, directive)
    }

    fn compose_text(factory: &Code, without_directive: bool) -> String {
        let mut code = CodeBuilder::new(false, false);
        code += "[1,";
        if without_directive {
            code.push_code_without_strict_directive(factory);
        } else {
            code.push_code(factory);
        }
        code += "]";
        code.build().source_code().to_str().unwrap().into_owned()
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
        let out = minify_chunk_item(&builder.build(), true, Some(MangleType::OptimalSize)).unwrap();
        assert!(out.has_source_map());
        assert!(
            !out.source_code()
                .to_str()
                .unwrap()
                .contains(CHUNK_ITEM_SENTINEL)
        );
    }

    #[test]
    fn strict_directive_is_kept_and_recorded() {
        for src in [
            r#"function (e) { "use strict"; e.v(1); }"#,
            r#"((e) => { "use strict"; e.v(1); })"#,
            // The ids in front of a merged module's factory are not mistaken for its body.
            r#""{\"use strict\";", ((e) => { "use strict"; e.v(1); })"#,
        ] {
            let (_, text, directive) = minify_strict(src);
            assert_eq!(directive.as_deref(), Some(STRICT_DIRECTIVE), "{text}");
        }
    }

    #[test]
    fn missing_strict_directive_is_not_recorded() {
        // No directive at all, a directive-like string that is not the first statement, and one
        // only in the ids in front of the factory.
        for src in [
            r#"((e) => { e.v(1); })"#,
            r#"((e) => { e.v(1); "use strict"; e.w(2); })"#,
            r#""{\"use strict\";", ((e) => { e.v(1); })"#,
        ] {
            let (factory, text, directive) = minify_strict(src);
            assert_eq!(directive, None, "{text}");
            assert_eq!(compose_text(&factory, true), compose_text(&factory, false));
        }
        // The compressor may drop a directive that makes no difference. Whether it does or not,
        // only a directive that is still there is recorded.
        let (factory, text, directive) = minify_strict(r#"((e) => { "use strict"; return 2; })"#);
        assert_eq!(
            directive.is_some(),
            text.contains("{\"use strict\""),
            "{text}"
        );
        if directive.is_none() {
            assert_eq!(compose_text(&factory, true), compose_text(&factory, false));
        }
    }

    /// `(generated line, generated column, original line, original column)` of every token
    /// mapped to an original source.
    fn tokens(code: &Code) -> Vec<(u32, u32, u32, u32)> {
        let map = match swc_sourcemap::decode_slice(&code.generate_source_map_ref(None).to_bytes())
            .unwrap()
        {
            DecodedMap::Regular(map) => map,
            DecodedMap::Index(index) => index.flatten().unwrap(),
            DecodedMap::Hermes(_) => unreachable!(),
        };
        map.tokens()
            .filter(|token| token.has_source())
            .map(|token| {
                (
                    token.get_dst_line(),
                    token.get_dst_col(),
                    token.get_src_line(),
                    token.get_src_col(),
                )
            })
            .collect()
    }

    #[test]
    fn removing_strict_directive_keeps_source_map() {
        // A strict factory whose code maps line by line to `a.js`.
        let src = "((e) => {\n\"use strict\";\ne.v(first);\ne.w(second);\n})";
        let mut map = SourceMapBuilder::new(None);
        let id = map.add_source("a.js".into());
        map.set_source_contents(id, Some(src.to_string().into()));
        for (line, text) in src.lines().enumerate() {
            for (col, _) in text.char_indices() {
                map.add_raw(
                    line as u32,
                    col as u32,
                    line as u32,
                    col as u32,
                    Some(id),
                    None,
                    false,
                );
            }
        }
        let mut map_bytes = Vec::new();
        map.into_sourcemap().to_writer(&mut map_bytes).unwrap();
        let mut builder = CodeBuilder::new(true, false);
        builder.push_source(&src.to_string().into(), Some(Rope::from(map_bytes)));
        let factory =
            minify_chunk_item(&builder.build(), true, Some(MangleType::Deterministic)).unwrap();
        assert!(factory.strict_directive().is_some());

        let compose = |without_directive: bool| {
            let mut code = CodeBuilder::new(true, false);
            code += "[1,";
            if without_directive {
                code.push_code_without_strict_directive(&factory);
            } else {
                code.push_code(&factory);
            }
            code += "]";
            code.build()
        };
        let without = compose(true);
        let text = without.source_code().to_str().unwrap().into_owned();
        assert!(!text.contains("use strict"), "{text}");

        // Minified, the directive shares its line with the body, so removing it moves the body
        // left by its length and keeps every original position.
        let directive_start = factory.strict_directive().unwrap().start + "[1,".len();
        let expected = tokens(&compose(false))
            .into_iter()
            .filter(|&(_, col, ..)| col as usize >= directive_start + STRICT_DIRECTIVE.len())
            .map(|(line, col, src_line, src_col)| {
                (line, col - STRICT_DIRECTIVE.len() as u32, src_line, src_col)
            })
            .collect::<Vec<_>>();
        let actual = tokens(&without)
            .into_iter()
            .filter(|&(_, col, ..)| col as usize >= directive_start)
            .collect::<Vec<_>>();
        assert!(!expected.is_empty());
        assert_eq!(actual, expected);
        // Independent of the version with the directive, the global names are still mapped to
        // where they are in `a.js`.
        for (name, original) in [("first", (2, 4)), ("second", (3, 4))] {
            let generated = text.find(name).unwrap() as u32;
            assert!(
                actual.iter().any(|&(line, col, src_line, src_col)| {
                    line == 0 && col == generated && (src_line, src_col) == original
                }),
                "{name} at {generated} is not mapped to {original:?}: {actual:?}"
            );
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
