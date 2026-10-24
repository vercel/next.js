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
    code_builder::{Code, CodeBuilder, STRICT_DIRECTIVE},
};

use crate::parse::{IdentCollector, generate_js_source_map};

#[instrument(level = "info", name = "minify ecmascript code", skip_all)]
pub fn minify(code: Code, source_maps: bool, mangle: Option<MangleType>) -> Result<Code> {
    // Pass None for the debug ID so we don't needlessly compute it for the pre-minified content, it
    // will be added by the Code object returned from this function
    let source_maps = source_maps.then(|| code.generate_source_map_ref(None));

    let generate_debug_id = code.should_generate_debug_id();
    let strict_directive_prefix = code.has_strict_directive_prefix();
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
    let mut src = src;
    if strict_directive_prefix {
        // Keep the directive an unmapped prefix of its own, so the debug id snippet can be written
        // after it. The source map then has to describe the rest of the code only.
        if !src.starts_with(STRICT_DIRECTIVE) {
            bail!("the minified code no longer starts with its strict mode directive");
        }
        src.replace_range(..STRICT_DIRECTIVE.len(), "");
        let prefix_len = STRICT_DIRECTIVE.len() as u32;
        src_map_buf.retain_mut(|(_, generated)| {
            if generated.line != 0 {
                return true;
            }
            if generated.col < prefix_len {
                return false;
            }
            generated.col -= prefix_len;
            true
        });
        builder.push_strict_directive_prefix();
    }
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

#[cfg(test)]
mod tests {
    use turbo_tasks_fs::rope::Rope;
    use turbopack_core::{
        code_builder::{CodeBuilder, STRICT_DIRECTIVE},
        source_map::{SourceMap, Token},
    };

    use super::minify;

    const DEBUG_ID: &str = "00000000-0000-0000-0000-000000000000";

    /// `(generated line, generated column, original line, original column)` of the original tokens.
    fn tokens(map: &Rope) -> Vec<(u32, u32, u32, u32)> {
        SourceMap::new_from_rope(map)
            .unwrap()
            .unwrap()
            .tokens()
            .filter_map(|token| match token {
                Token::Original(t) => Some((
                    t.generated_line,
                    t.generated_column,
                    t.original_line,
                    t.original_column,
                )),
                Token::Synthetic(_) => None,
            })
            .collect()
    }

    #[test]
    fn minify_keeps_the_strict_directive_an_unmapped_prefix() {
        let mut builder = swc_sourcemap::SourceMapBuilder::new(None);
        let src = builder.add_source("turbopack:///[project]/a.js".into());
        // Without source contents, the original positions are lost when the minifier composes the
        // maps.
        builder.set_source_contents(src, Some("original".into()));
        builder.add_raw(0, 0, 0, 0, Some(src), None, false);
        builder.add_raw(1, 0, 1, 0, Some(src), None, false);
        let mut map = Vec::new();
        builder.into_sourcemap().to_writer(&mut map).unwrap();
        let map = Rope::from(map);

        let source = Rope::from(
            "\"a\", (ctx) => {\nctx.x = (function () { return this; })(\"\u{fc}\");\n}".to_string(),
        );
        let build = |marked| {
            let mut code = CodeBuilder::new(true, true);
            if marked {
                code.push_strict_directive_prefix();
            } else {
                code += STRICT_DIRECTIVE;
            }
            code += "(globalThis.x || (globalThis.x = [])).push([\n";
            code.push_source(&source, Some(map.clone()));
            code += "\n]);";
            minify(code.build(), true, None).unwrap()
        };
        let unmarked = build(false);
        let minified = build(true);
        assert!(minified.has_strict_directive_prefix());
        assert_eq!(minified.source_code(), unmarked.source_code());
        let source = minified.source_code().to_str().unwrap().into_owned();
        assert!(source.starts_with(STRICT_DIRECTIVE), "{source}");
        assert!(!source[STRICT_DIRECTIVE.len()..].contains("use strict"));

        let plain = tokens(&minified.generate_source_map_ref(None));
        assert_eq!(plain, tokens(&unmarked.generate_source_map_ref(None)));
        assert!(!plain.is_empty());
        let prefix_len = STRICT_DIRECTIVE.len() as u32;
        let expected: Vec<_> = plain
            .iter()
            .map(|&(line, column, original_line, original_column)| {
                if line == 0 {
                    assert!(column >= prefix_len, "the prefix is unmapped");
                    (1, column - prefix_len, original_line, original_column)
                } else {
                    (line + 1, column, original_line, original_column)
                }
            })
            .collect();
        assert_eq!(
            tokens(&minified.generate_source_map_ref(Some(DEBUG_ID.into()))),
            expected
        );
    }
}
