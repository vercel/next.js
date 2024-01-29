use std::{future::Future, sync::Arc};

use anyhow::{anyhow, Context, Result};
use swc_core::{
    base::SwcComments,
    common::{
        errors::{Handler, HANDLER},
        input::StringInput,
        source_map::SourceMapGenConfig,
        BytePos, FileName, Globals, LineCol, Mark, GLOBALS,
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
use tracing::Instrument;
use turbo_tasks::{util::WrapFuture, Value, ValueToString, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    asset::{Asset, AssetContent},
    error::PrettyPrintError,
    issue::{Issue, IssueExt, IssueSeverity, OptionStyledString, StyledString},
    source::Source,
    source_map::{GenerateSourceMap, OptionSourceMap, SourceMap},
    SOURCE_MAP_ROOT_NAME,
};
use turbopack_swc_utils::emitter::IssueEmitter;

use super::EcmascriptModuleAssetType;
use crate::{
    analyzer::graph::EvalContext,
    swc_comments::ImmutableComments,
    transform::{EcmascriptInputTransforms, TransformContext},
    EcmascriptInputTransform,
};

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
#[allow(clippy::large_enum_variant)]
pub enum ParseResult {
    Ok {
        #[turbo_tasks(trace_ignore)]
        program: Program,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        comments: Arc<ImmutableComments>,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        eval_context: EvalContext,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        globals: Arc<Globals>,
        #[turbo_tasks(debug_ignore, trace_ignore)]
        source_map: Arc<swc_core::common::SourceMap>,
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
    /// to source locations. It's a map of filesnames to file contents.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    files_map: Arc<swc_core::common::SourceMap>,

    /// The position mappings that can generate a real source map.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    mappings: Vec<(BytePos, LineCol)>,

    /// An input's original source map, if one exists. This will be used to
    /// trace locations back to the input's pre-transformed sources.
    original_source_map: Option<Vc<SourceMap>>,
}

impl PartialEq for ParseResultSourceMap {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.files_map, &other.files_map) && self.mappings == other.mappings
    }
}

impl ParseResultSourceMap {
    pub fn new(
        files_map: Arc<swc_core::common::SourceMap>,
        mappings: Vec<(BytePos, LineCol)>,
        original_source_map: Option<Vc<SourceMap>>,
    ) -> Self {
        ParseResultSourceMap {
            files_map,
            mappings,
            original_source_map,
        }
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for ParseResultSourceMap {
    #[turbo_tasks::function]
    async fn generate_source_map(&self) -> Result<Vc<OptionSourceMap>> {
        let original_src_map = if let Some(input) = self.original_source_map {
            Some(input.await?.to_source_map().await?)
        } else {
            None
        };
        let input_map = if let Some(map) = original_src_map.as_ref() {
            map.as_regular_source_map()
        } else {
            None
        };
        let map = self.files_map.build_source_map_with_config(
            &self.mappings,
            input_map.as_deref(),
            InlineSourcesContentConfig {},
        );
        Ok(Vc::cell(Some(SourceMap::new_regular(map).cell())))
    }
}

/// A config to generate a source map which includes the source content of every
/// source file. SWC doesn't inline sources content by default when generating a
/// sourcemap, so we need to provide a custom config to do it.
struct InlineSourcesContentConfig {}

impl SourceMapGenConfig for InlineSourcesContentConfig {
    fn file_name_to_source(&self, f: &FileName) -> String {
        match f {
            FileName::Custom(s) => {
                format!("/{SOURCE_MAP_ROOT_NAME}/{s}")
            }
            _ => f.to_string(),
        }
    }

    fn inline_sources_content(&self, _f: &FileName) -> bool {
        true
    }
}

#[turbo_tasks::function]
pub async fn parse(
    source: Vc<Box<dyn Source>>,
    ty: Value<EcmascriptModuleAssetType>,
    transforms: Vc<EcmascriptInputTransforms>,
) -> Result<Vc<ParseResult>> {
    let name = source.ident().to_string().await?;
    let span = tracing::info_span!("parse ecmascript", name = *name, ty = display(&*ty));
    match parse_internal(source, ty, transforms)
        .instrument(span)
        .await
    {
        Ok(result) => Ok(result),
        Err(error) => Err(error.context(format!(
            "failed to parse {}",
            source.ident().to_string().await?
        ))),
    }
}

async fn parse_internal(
    source: Vc<Box<dyn Source>>,
    ty: Value<EcmascriptModuleAssetType>,
    transforms: Vc<EcmascriptInputTransforms>,
) -> Result<Vc<ParseResult>> {
    let content = source.content();
    let fs_path_vc = source.ident().path();
    let fs_path = &*fs_path_vc.await?;
    let ident = &*source.ident().to_string().await?;
    let file_path_hash = hash_xxh3_hash64(&*source.ident().to_string().await?) as u128;
    let ty = ty.into_value();
    let content = match content.await {
        Ok(content) => content,
        Err(error) => {
            ReadSourceIssue {
                source,
                error: PrettyPrintError(&error).to_string(),
            }
            .cell()
            .emit();
            return Ok(ParseResult::Unparseable.cell());
        }
    };
    Ok(match &*content {
        AssetContent::File(file) => match &*file.await? {
            FileContent::NotFound => ParseResult::NotFound.cell(),
            FileContent::Content(file) => match file.content().to_str() {
                Ok(string) => {
                    let transforms = &*transforms.await?;
                    match parse_content(
                        string.into_owned(),
                        fs_path_vc,
                        fs_path,
                        ident,
                        file_path_hash,
                        source,
                        ty,
                        transforms,
                    )
                    .await
                    {
                        Ok(result) => result,
                        Err(e) => {
                            return Err(e).context(anyhow!(
                                "Transforming and/or parsing of {} failed",
                                source.ident().to_string().await?
                            ));
                        }
                    }
                }
                Err(error) => {
                    ReadSourceIssue {
                        source,
                        error: PrettyPrintError(&error).to_string(),
                    }
                    .cell()
                    .emit();
                    ParseResult::Unparseable.cell()
                }
            },
        },
        AssetContent::Redirect { .. } => ParseResult::Unparseable.cell(),
    })
}

async fn parse_content(
    string: String,
    fs_path_vc: Vc<FileSystemPath>,
    fs_path: &FileSystemPath,
    ident: &str,
    file_path_hash: u128,
    source: Vc<Box<dyn Source>>,
    ty: EcmascriptModuleAssetType,
    transforms: &[EcmascriptInputTransform],
) -> Result<Vc<ParseResult>> {
    let source_map: Arc<swc_core::common::SourceMap> = Default::default();
    let handler = Handler::with_emitter(
        true,
        false,
        Box::new(IssueEmitter {
            source,
            source_map: source_map.clone(),
            title: Some("Parsing ecmascript source code failed".to_string()),
        }),
    );
    let globals = Arc::new(Globals::new());
    let globals_ref = &globals;
    let helpers = GLOBALS.set(globals_ref, || Helpers::new(true));
    let mut result = WrapFuture::new(
        async {
            let file_name = FileName::Custom(ident.to_string());
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
                            import_attributes: true,
                            allow_super_outside_method: true,
                            allow_return_outside_function: true,
                            auto_accessors: true,
                            explicit_resource_management: true,
                        }),
                        EcmascriptModuleAssetType::Typescript { tsx, .. } => {
                            Syntax::Typescript(TsConfig {
                                decorators: true,
                                dts: false,
                                no_early_errors: true,
                                tsx,
                                disallow_ambiguous_jsx_like: false,
                            })
                        }
                        EcmascriptModuleAssetType::TypescriptDeclaration => {
                            Syntax::Typescript(TsConfig {
                                decorators: true,
                                dts: true,
                                no_early_errors: true,
                                tsx: false,
                                disallow_ambiguous_jsx_like: false,
                            })
                        }
                    },
                    EsVersion::latest(),
                    StringInput::from(&*fm),
                    Some(&comments),
                );

                let mut parser = Parser::new_from(lexer);
                let program_result = parser.parse_program();

                let mut has_errors = false;
                for e in parser.take_errors() {
                    e.into_diagnostic(&handler).emit();
                    has_errors = true
                }

                if has_errors {
                    return Ok(ParseResult::Unparseable);
                }

                match program_result {
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
                EcmascriptModuleAssetType::Typescript { .. }
                    | EcmascriptModuleAssetType::TypescriptDeclaration
            );
            parsed_program.visit_mut_with(&mut resolver(
                unresolved_mark,
                top_level_mark,
                is_typescript,
            ));

            let transform_context = TransformContext {
                comments: &comments,
                source_map: &source_map,
                top_level_mark,
                unresolved_mark,
                file_path_str: &fs_path.path,
                file_name_str: fs_path.file_name(),
                file_name_hash: file_path_hash,
                file_path: fs_path_vc,
            };
            for transform in transforms.iter() {
                transform
                    .apply(&mut parsed_program, &transform_context)
                    .await?;
            }

            parsed_program.visit_mut_with(
                &mut swc_core::ecma::transforms::base::helpers::inject_helpers(unresolved_mark),
            );

            let eval_context = EvalContext::new(&parsed_program, unresolved_mark, Some(source));

            Ok::<ParseResult, anyhow::Error>(ParseResult::Ok {
                program: parsed_program,
                comments: Arc::new(ImmutableComments::new(comments)),
                eval_context,
                // Temporary globals as the current one can't be moved yet, since they are
                // borrowed
                globals: Arc::new(Globals::new()),
                source_map,
            })
        },
        |f, cx| {
            GLOBALS.set(globals_ref, || {
                HANDLER.set(&handler, || HELPERS.set(&helpers, || f.poll(cx)))
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

#[turbo_tasks::value]
struct ReadSourceIssue {
    source: Vc<Box<dyn Source>>,
    error: String,
}

#[turbo_tasks::value_impl]
impl Issue for ReadSourceIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.ident().path()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Reading source code for parsing failed".to_string()).cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(format!(
                "An unexpected error happened while trying to read the source code to parse: {}",
                self.error
            ))
            .cell(),
        ))
    }

    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Error.cell()
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("parse".to_string())
    }
}
