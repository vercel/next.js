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
    },
};
use tracing::instrument;
use turbopack_core::{
    chunk::MangleType,
    code_builder::{Code, CodeBuilder},
};

use crate::parse::generate_js_source_map;

#[instrument(level = "info", name = "minify ecmascript code", skip_all)]
pub fn minify(code: Code, source_maps: bool, mangle: Option<MangleType>) -> Result<Code> {
    // Pass None for the debug ID so we don't needlessly compute it for the pre-minified content, it
    // will be added by the Code object returned from this function
    let source_maps = source_maps.then(|| code.generate_source_map_ref(None));

    let generate_debug_id = code.should_generate_debug_id();
    let source_code = BytesStr::from_utf8(code.into_source_code().into_bytes())?;

    let cm = Arc::new(SwcSourceMap::new(FilePathMapping::empty()));
    let (src, mut src_map_buf) = {
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

        let program = try_with_handler(cm.clone(), Default::default(), |handler| {
            GLOBALS.set(&Default::default(), || {
                let program = match parser.parse_program() {
                    Ok(program) => program,
                    Err(err) => {
                        err.into_diagnostic(handler).emit();
                        bail!("failed to parse source code\n{}", fm.src)
                    }
                };
                let unresolved_mark = Mark::new();
                let top_level_mark = Mark::new();

                let program = program.apply(paren_remover(Some(&comments)));

                let mut program = program.apply(swc_core::ecma::transforms::base::resolver(
                    unresolved_mark,
                    top_level_mark,
                    false,
                ));

                program = swc_core::ecma::minifier::optimize(
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

                Ok(program.apply(ecma::transforms::base::fixer::fixer(Some(
                    &comments as &dyn Comments,
                ))))
            })
        })
        .map_err(|e| e.to_pretty_error())?;

        print_program(cm.clone(), program, source_maps.is_some())?
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
            )?),
        );
    } else {
        builder.push_source(&src.into(), None);
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
