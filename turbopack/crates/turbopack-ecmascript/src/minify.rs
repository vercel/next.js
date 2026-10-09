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
    source_map::{SourceMapGeneration, SourceMapType},
};

use crate::parse::{IdentCollector, generate_js_source_map};

#[instrument(level = "info", name = "minify ecmascript code", skip_all)]
pub fn minify(
    code: Code,
    generation: SourceMapGeneration,
    mangle: Option<MangleType>,
) -> Result<Code> {
    // Pass None for the debug ID so we don't needlessly compute it for the pre-minified content, it
    // will be added by the Code object returned from this function
    let full_map = generation
        .full
        .then(|| code.generate_source_map_ref(None, SourceMapType::Full));
    let partial_map = generation
        .partial
        .then(|| code.generate_source_map_ref(None, SourceMapType::Partial));
    let source_maps = generation.any();

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
                    let source_map_names = if source_maps {
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

        let (src, src_map_buf) = print_program(cm.clone(), program, source_maps)?;
        (src, src_map_buf, source_map_names)
    };

    src_map_buf.shrink_to_fit();
    let compose = |original_map: Option<&turbo_tasks_fs::rope::Rope>| -> Result<_> {
        original_map
            .map(|original_map| {
                generate_js_source_map(
                    &*cm,
                    src_map_buf.clone(),
                    Some(original_map),
                    true,
                    false,
                    source_map_names.clone(),
                )
            })
            .transpose()
    };
    let mut builder = CodeBuilder::new(generation, generate_debug_id);
    builder.push_source(
        &src.into(),
        compose(full_map.as_ref())?,
        compose(partial_map.as_ref())?,
    );
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
        chunk::MangleType,
        code_builder::CodeBuilder,
        source_map::{SourceMapGeneration, SourceMapType},
    };

    use crate::minify::minify;

    #[test]
    fn independent_maps_preserve_minified_code() -> anyhow::Result<()> {
        let source = Rope::from("export function greeting(name) { return 'Hello ' + name; }\n");
        let full_map = Rope::from(
            r#"{"version":3,"sources":["original.ts"],"sourcesContent":["original"],"names":[],"mappings":"AAAA"}"#,
        );
        let partial_map = Rope::from(
            r#"{"version":3,"sources":["module.js"],"sourcesContent":["module"],"names":[],"mappings":"AAAA"}"#,
        );
        for mangle in [
            None,
            Some(MangleType::OptimalSize),
            Some(MangleType::Deterministic),
        ] {
            let mut outputs = Vec::new();
            for generation in [
                SourceMapGeneration::NONE,
                SourceMapGeneration {
                    full: true,
                    partial: false,
                },
                SourceMapGeneration {
                    full: false,
                    partial: true,
                },
                SourceMapGeneration {
                    full: true,
                    partial: true,
                },
            ] {
                let mut builder = CodeBuilder::new(generation, true);
                builder.push_source(&source, Some(full_map.clone()), Some(partial_map.clone()));
                let code = minify(builder.build(), generation, mangle)?;
                assert_eq!(
                    code.has_source_map_for(SourceMapType::Full),
                    generation.full
                );
                assert_eq!(
                    code.has_source_map_for(SourceMapType::Partial),
                    generation.partial
                );
                assert!(code.should_generate_debug_id());
                outputs.push(code);
            }
            for code in &outputs {
                assert_eq!(code.source_code(), outputs[0].source_code());
            }
            for (index, ty, expected_source) in [
                (1, SourceMapType::Full, "original.ts"),
                (2, SourceMapType::Partial, "module.js"),
            ] {
                let map = outputs[index].generate_source_map_ref(None, ty);
                assert_eq!(map, outputs[3].generate_source_map_ref(None, ty));
                assert!(map.to_str()?.contains(expected_source));
            }
        }
        Ok(())
    }
}
