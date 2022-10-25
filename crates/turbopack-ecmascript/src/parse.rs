use std::{future::Future, sync::Arc};

use anyhow::Result;
use swc_core::{
    base::SwcComments,
    common::{
        errors::{Handler, HANDLER},
        input::StringInput,
        source_map::SourceMapGenConfig,
        BytePos, FileName, Globals, LineCol, Mark, SourceMap, GLOBALS,
    },
    ecma::{
        ast::{EsVersion, Program},
        parser::{lexer::Lexer, EsConfig, Parser, Syntax, TsConfig},
        transforms::base::{
            helpers::{Helpers, HELPERS},
            resolver,
        },
        visit::VisitMutWith,
    },
};
use turbo_tasks::{
    primitives::{StringVc, U64Vc},
    Value, ValueToString,
};
use turbo_tasks_fs::{FileContent, FileSystemPath, FileSystemPathVc};
use turbo_tasks_hash::{DeterministicHasher, Xxh3Hash64Hasher};
use turbopack_core::{
    asset::{AssetContent, AssetVc},
    code_builder::{EncodedSourceMap, EncodedSourceMapVc},
};
use turbopack_swc_utils::emitter::IssueEmitter;

use super::EcmascriptModuleAssetType;
use crate::{
    analyzer::graph::EvalContext,
    transform::{EcmascriptInputTransformsVc, TransformContext},
    utils::WrapFuture,
    EcmascriptInputTransform,
};

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
#[allow(clippy::large_enum_variant)]
pub enum ParseResult {
    Ok {
        #[turbo_tasks(trace_ignore)]
        program: Program,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        comments: SwcComments,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        eval_context: EvalContext,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        globals: Globals,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        source_map: Arc<SourceMap>,
    },
    Unparseable,
    NotFound,
}

impl PartialEq for ParseResult {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Ok { .. }, Self::Ok { .. }) => false,
            _ => core::mem::discriminant(self) == core::mem::discriminant(other),
        }
    }
}

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
pub struct ParseResultSourceMap {
    /// Confusingly, SWC's SourceMap is not a mapping of transformed locations
    /// to source locations. I don't know what it is, really, but it's not
    /// that.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    source_map: Arc<SourceMap>,

    /// The position mappings that can generate a real source map given a (SWC)
    /// SourceMap.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    mappings: Vec<(BytePos, LineCol)>,
}

impl PartialEq for ParseResultSourceMap {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.source_map, &other.source_map) && self.mappings == other.mappings
    }
}

impl ParseResultSourceMap {
    pub fn new(source_map: Arc<SourceMap>, mappings: Vec<(BytePos, LineCol)>) -> Self {
        ParseResultSourceMap {
            source_map,
            mappings,
        }
    }
}

#[turbo_tasks::value_impl]
impl EncodedSourceMap for ParseResultSourceMap {
    #[turbo_tasks::function]
    fn encoded_map(&self) -> Result<StringVc> {
        let source_map = self.source_map.build_source_map_with_config(
            // SWC expects a mutable vec, but it never modifies. Seems like an oversight.
            &mut self.mappings.clone(),
            None,
            InlineSourcesContentConfig {},
        );
        let mut bytes = vec![];
        source_map.to_writer(&mut bytes)?;
        let s = String::from_utf8(bytes)?;
        Ok(StringVc::cell(s))
    }
}

/// A config to generate a source map which includes the source content of every
/// source file. SWC doesn't inline sources content by default when generating a
/// sourcemap, so we need to provide a custom config to do it.
struct InlineSourcesContentConfig {}

impl SourceMapGenConfig for InlineSourcesContentConfig {
    fn file_name_to_source(&self, f: &FileName) -> String {
        match f {
            // The Custom filename surrounds the name with <>.
            FileName::Custom(s) => String::from("/") + s,
            _ => f.to_string(),
        }
    }

    fn inline_sources_content(&self, _f: &FileName) -> bool {
        true
    }
}

#[turbo_tasks::function]
pub async fn parse(
    source: AssetVc,
    ty: Value<EcmascriptModuleAssetType>,
    transforms: EcmascriptInputTransformsVc,
) -> Result<ParseResultVc> {
    let content = source.content();
    let fs_path = &*source.path().await?;
    let fs_path_str = &*source.path().to_string().await?;
    let file_path_hash = *hash_file_path(source.path()).await? as u128;
    let ty = ty.into_value();
    Ok(match &*content.await? {
        AssetContent::File(file) => match &*file.await? {
            FileContent::NotFound => ParseResult::NotFound.cell(),
            FileContent::Content(file) => match String::from_utf8(file.content().to_vec()) {
                Ok(string) => {
                    let transforms = &*transforms.await?;
                    parse_content(
                        string,
                        fs_path,
                        fs_path_str,
                        file_path_hash,
                        source,
                        ty,
                        transforms,
                    )
                    .await?
                }
                // FIXME: report error
                Err(_err) => ParseResult::Unparseable.cell(),
            },
        },
        AssetContent::Redirect { .. } => ParseResult::Unparseable.cell(),
    })
}

async fn parse_content(
    string: String,
    fs_path: &FileSystemPath,
    fs_path_str: &str,
    file_path_hash: u128,
    source: AssetVc,
    ty: EcmascriptModuleAssetType,
    transforms: &[EcmascriptInputTransform],
) -> Result<ParseResultVc> {
    let source_map: Arc<SourceMap> = Default::default();
    let handler = Handler::with_emitter(
        true,
        false,
        box IssueEmitter {
            source,
            source_map: source_map.clone(),
            title: Some("Parsing ecmascript source code failed".to_string()),
        },
    );
    let globals = Globals::new();
    let globals_ref = &globals;
    let helpers = GLOBALS.set(globals_ref, || Helpers::new(true));
    let mut result = WrapFuture::new(
        |f, cx| {
            GLOBALS.set(globals_ref, || {
                HANDLER.set(&handler, || HELPERS.set(&helpers, || f.poll(cx)))
            })
        },
        async {
            let file_name = FileName::Custom(fs_path_str.to_string());
            let fm = source_map.new_source_file(file_name.clone(), string);

            let comments = SwcComments::default();

            let mut parsed_program = {
                let lexer = Lexer::new(
                    match ty {
                        EcmascriptModuleAssetType::Ecmascript => Syntax::Es(EsConfig {
                            jsx: true,
                            fn_bind: true,
                            decorators: true,
                            decorators_before_export: true,
                            export_default_from: true,
                            import_assertions: true,
                            private_in_object: true,
                            allow_super_outside_method: true,
                            allow_return_outside_function: true,
                        }),
                        EcmascriptModuleAssetType::Typescript => Syntax::Typescript(TsConfig {
                            decorators: true,
                            dts: false,
                            no_early_errors: true,
                            tsx: true,
                        }),
                        EcmascriptModuleAssetType::TypescriptDeclaration => {
                            Syntax::Typescript(TsConfig {
                                decorators: true,
                                dts: true,
                                no_early_errors: true,
                                tsx: true,
                            })
                        }
                    },
                    EsVersion::latest(),
                    StringInput::from(&*fm),
                    Some(&comments),
                );

                let mut parser = Parser::new_from(lexer);

                let mut has_errors = false;
                for e in parser.take_errors() {
                    e.into_diagnostic(&handler).emit();
                    has_errors = true
                }

                if has_errors {
                    return Ok(ParseResult::Unparseable);
                }

                match parser.parse_program() {
                    Ok(parsed_program) => parsed_program,
                    Err(e) => {
                        e.into_diagnostic(&handler).emit();
                        return Ok(ParseResult::Unparseable);
                    }
                }
            };

            let unresolved_mark = Mark::new();
            let top_level_mark = Mark::new();

            let is_typescript = matches!(
                ty,
                EcmascriptModuleAssetType::Typescript
                    | EcmascriptModuleAssetType::TypescriptDeclaration
            );
            parsed_program.visit_mut_with(&mut resolver(
                unresolved_mark,
                top_level_mark,
                is_typescript,
            ));

            let context = TransformContext {
                comments: &comments,
                source_map: &source_map,
                top_level_mark,
                unresolved_mark,
                file_name_str: fs_path.file_name(),
                file_name_hash: file_path_hash,
            };
            for transform in transforms.iter() {
                transform.apply(&mut parsed_program, &context).await?;
            }

            let eval_context = EvalContext::new(&parsed_program, unresolved_mark);

            Ok::<ParseResult, anyhow::Error>(ParseResult::Ok {
                program: parsed_program,
                comments,
                eval_context,
                // Temporary globals as the current one can't be moved yet, since they are
                // borrowed
                globals: Globals::new(),
                source_map,
            })
        },
    )
    .await?;
    if let ParseResult::Ok {
        globals: ref mut g, ..
    } = result
    {
        // Assign the correct globals
        *g = globals;
    }
    Ok(result.cell())
}

#[turbo_tasks::function]
async fn hash_file_path(file_path_vc: FileSystemPathVc) -> Result<U64Vc> {
    let file_path = &*file_path_vc.await?;
    let mut hasher = Xxh3Hash64Hasher::new();
    hasher.write_bytes(file_path.file_name().as_bytes());
    Ok(U64Vc::cell(hasher.finish()))
}
