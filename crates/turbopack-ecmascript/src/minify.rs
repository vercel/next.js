use std::{io::Write, sync::Arc};

use anyhow::{bail, Context, Result};
use swc_core::{
    base::{try_with_handler, Compiler},
    common::{
        comments::{Comments, SingleThreadedComments},
        BytePos, FileName, FilePathMapping, LineCol, Mark, SourceMap as SwcSourceMap, GLOBALS,
    },
    ecma::{
        self,
        ast::{EsVersion, Program},
        codegen::{
            text_writer::{self, JsWriter, WriteJs},
            Emitter, Node,
        },
        minifier::option::{ExtraOptions, MinifyOptions},
        parser::{lexer::Lexer, Parser, StringInput, Syntax},
        transforms::base::fixer::paren_remover,
        visit::FoldWith,
    },
};
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    code_builder::{Code, CodeBuilder},
    source_map::GenerateSourceMap,
};

use crate::ParseResultSourceMap;

#[turbo_tasks::function]
pub async fn minify(path: Vc<FileSystemPath>, code: Vc<Code>) -> Result<Vc<Code>> {
    let path = path.await?;
    let original_map = code.generate_source_map();
    let code = code.await?;

    let cm = Arc::new(SwcSourceMap::new(FilePathMapping::empty()));
    let compiler = Arc::new(Compiler::new(cm.clone()));
    let fm = compiler.cm.new_source_file(
        FileName::Custom(path.path.to_string()),
        code.source_code().to_str()?.to_string(),
    );

    let lexer = Lexer::new(
        Syntax::default(),
        EsVersion::latest(),
        StringInput::from(&*fm),
        None,
    );
    let mut parser = Parser::new_from(lexer);
    // TODO should use our own handler that emits issues instead.
    let program = try_with_handler(cm.clone(), Default::default(), |handler| {
        GLOBALS.set(&Default::default(), || {
            let program = match parser.parse_program() {
                Ok(program) => program,
                Err(err) => {
                    // TODO should emit an issue
                    bail!(
                        "failed to parse source code\n{err:?}\n{}",
                        code.source_code().to_str()?
                    )
                }
            };
            let comments = SingleThreadedComments::default();
            let unresolved_mark = Mark::new();
            let top_level_mark = Mark::new();

            Ok(compiler.run_transform(handler, false, || {
                let program = program.fold_with(&mut paren_remover(Some(&comments)));

                let mut program =
                    program.fold_with(&mut swc_core::ecma::transforms::base::resolver(
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
                        compress: Some(Default::default()),
                        mangle: Some(Default::default()),
                        ..Default::default()
                    },
                    &ExtraOptions {
                        top_level_mark,
                        unresolved_mark,
                    },
                );

                program.fold_with(&mut ecma::transforms::base::fixer::fixer(Some(
                    &comments as &dyn Comments,
                )))
            }))
        })
    })?;

    let (src, src_map_buf) = print_program(cm.clone(), program)?;

    let mut builder = CodeBuilder::default();
    builder.push_source(
        &src.into(),
        Some(Vc::upcast(
            ParseResultSourceMap::new(cm, src_map_buf, original_map).cell(),
        )),
    );

    write!(
        builder,
        "\n\n//# sourceMappingURL={}.map",
        urlencoding::encode(path.file_name())
    )?;
    Ok(builder.build().cell())
}

// From https://github.com/swc-project/swc/blob/11efd4e7c5e8081f8af141099d3459c3534c1e1d/crates/swc/src/lib.rs#L523-L560
fn print_program(
    cm: Arc<SwcSourceMap>,
    program: Program,
) -> Result<(String, Vec<(BytePos, LineCol)>)> {
    let mut src_map_buf = vec![];

    let src = {
        let mut buf = vec![];
        {
            let wr = Box::new(text_writer::omit_trailing_semi(Box::new(JsWriter::new(
                cm.clone(),
                "\n",
                &mut buf,
                Some(&mut src_map_buf),
            )))) as Box<dyn WriteJs>;

            let mut emitter = Emitter {
                cfg: swc_core::ecma::codegen::Config::default().with_minify(true),
                comments: None,
                cm: cm.clone(),
                wr,
            };

            program
                .emit_with(&mut emitter)
                .context("failed to emit module")?;
        }
        // Invalid utf8 is valid in javascript world.
        String::from_utf8(buf).expect("invalid utf8 character detected")
    };

    Ok((src, src_map_buf))
}
