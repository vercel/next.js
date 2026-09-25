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
    let public_map = source_maps.then(|| code.generate_source_map_ref(None));
    let analysis_map = code
        .has_analysis_source_map()
        .then(|| code.generate_analysis_source_map_ref(None));
    let collect_mappings = public_map.is_some() || analysis_map.is_some();

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
                    let source_map_names = if collect_mappings {
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

        let (src, src_map_buf) = print_program(cm.clone(), program, collect_mappings)?;
        (src, src_map_buf, source_map_names)
    };

    let mut builder = CodeBuilder::new_with_analysis(
        public_map.is_some(),
        analysis_map.is_some(),
        generate_debug_id,
    );
    src_map_buf.shrink_to_fit();
    let generate_map = |original: &turbo_tasks_fs::rope::Rope, mappings, names| {
        generate_js_source_map(
            &*cm,
            mappings,
            Some(original),
            true,
            // The input to the minifier is synthesized; don't inline its contents.
            false,
            names,
        )
    };
    let analysis = analysis_map
        .as_ref()
        .map(|map| generate_map(map, src_map_buf.clone(), source_map_names.clone()))
        .transpose()?;
    let public = public_map
        .as_ref()
        .map(|map| generate_map(map, src_map_buf, source_map_names))
        .transpose()?;
    builder.push_source_with_analysis(
        &src.into(),
        public.map(Into::into),
        analysis.map(Into::into),
    );
    Ok(builder.build())
}

#[cfg(test)]
mod tests {
    use turbo_tasks_fs::rope::Rope;
    use turbopack_core::code_builder::SectionMap;

    use super::*;

    #[test]
    fn internal_analysis_map_matches_public_partial_map_after_minification() -> Result<()> {
        let input = Rope::from("function example() { return 1 + 2; }\nexample();\n");
        let map: SectionMap = Rope::from(
            serde_json::json!({
                "version": 3,
                "mappings": "AAAA;AACA",
                "sources": ["module.ts"],
                "names": []
            })
            .to_string(),
        )
        .into();

        let mut public = CodeBuilder::new(true, false);
        public.push_source(&input, Some(map.clone()));
        let public = minify(public.build(), true, Some(MangleType::OptimalSize))?;

        let mut internal = CodeBuilder::new_with_analysis(false, true, false);
        internal.push_source_with_analysis(&input, None, Some(map));
        let internal = minify(internal.build(), false, Some(MangleType::OptimalSize))?;

        let mut unmapped = CodeBuilder::new(false, false);
        unmapped.push_source(&input, None::<SectionMap>);
        let unmapped = minify(unmapped.build(), false, Some(MangleType::OptimalSize))?;

        assert_eq!(public.source_code(), internal.source_code());
        assert_eq!(unmapped.source_code(), internal.source_code());
        assert!(!internal.has_source_map());
        assert_eq!(
            public.generate_source_map_ref(None),
            internal.generate_analysis_source_map_ref(None)
        );
        Ok(())
    }

    #[test]
    fn full_runtime_map_and_partial_analysis_map_share_minified_bytes() -> Result<()> {
        let input = Rope::from("function example() { return 42; }\nexample();\n");
        let mapping = |source: &str| -> SectionMap {
            Rope::from(
                serde_json::json!({
                    "version": 3,
                    "mappings": "AAAA;AACA",
                    "sources": [source],
                    "names": []
                })
                .to_string(),
            )
            .into()
        };
        let mut code = CodeBuilder::new_with_analysis(true, true, false);
        code.push_source_with_analysis(
            &input,
            Some(mapping("authored.tsx")),
            Some(mapping("compiled.js")),
        );
        let full = minify(code.build(), true, Some(MangleType::OptimalSize))?;

        let mut analysis_only = CodeBuilder::new_with_analysis(false, true, false);
        analysis_only.push_source_with_analysis(&input, None, Some(mapping("compiled.js")));
        let analysis_only = minify(analysis_only.build(), false, Some(MangleType::OptimalSize))?;

        assert_eq!(full.source_code(), analysis_only.source_code());
        assert!(
            full.generate_source_map_ref(None)
                .to_str()?
                .contains("authored.tsx")
        );
        assert!(
            full.generate_analysis_source_map_ref(None)
                .to_str()?
                .contains("compiled.js")
        );
        assert_eq!(
            full.generate_analysis_source_map_ref(None),
            analysis_only.generate_analysis_source_map_ref(None)
        );
        Ok(())
    }
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
