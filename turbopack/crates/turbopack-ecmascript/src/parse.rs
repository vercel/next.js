use std::{future::Future, sync::Arc};

use anyhow::{Context, Result, anyhow};
use bytes_str::BytesStr;
use rustc_hash::FxHashSet;
use swc_core::{
    base::SwcComments,
    common::{
        BytePos, FileName, GLOBALS, Globals, LineCol, Mark, SyntaxContext,
        errors::{HANDLER, Handler},
        input::StringInput,
        source_map::SourceMapGenConfig,
        util::take::Take,
    },
    ecma::{
        ast::{EsVersion, Id, ObjectPatProp, Pat, Program, VarDecl},
        lints::{config::LintConfig, rules::LintParams},
        parser::{EsSyntax, Parser, Syntax, TsSyntax, lexer::Lexer},
        transforms::base::{
            helpers::{HELPERS, Helpers},
            resolver,
        },
        visit::{Visit, VisitMutWith, VisitWith, noop_visit_type},
    },
};
use tracing::{Instrument, Level, instrument};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc, util::WrapFuture};
use turbo_tasks_fs::{FileContent, FileSystemPath, rope::Rope};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    SOURCE_URL_PROTOCOL,
    asset::{Asset, AssetContent},
    error::PrettyPrintError,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    source::Source,
    source_map::utils::add_default_ignore_list,
};
use turbopack_swc_utils::emitter::IssueEmitter;

use super::EcmascriptModuleAssetType;
use crate::{
    EcmascriptInputTransform,
    analyzer::{ImportMap, graph::EvalContext},
    swc_comments::ImmutableComments,
    transform::{EcmascriptInputTransforms, TransformContext},
};

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
#[allow(clippy::large_enum_variant)]
pub enum ParseResult {
    // Note: Ok must not contain any Vc as it's snapshot by failsafe_parse
    Ok {
        #[turbo_tasks(debug_ignore, trace_ignore)]
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
    Unparseable {
        messages: Option<Vec<RcStr>>,
    },
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

#[turbo_tasks::value_impl]
impl ParseResult {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<ParseResult> {
        let globals = Globals::new();
        let eval_context = GLOBALS.set(&globals, || EvalContext {
            unresolved_mark: Mark::new(),
            top_level_mark: Mark::new(),
            imports: ImportMap::default(),
            force_free_values: Default::default(),
        });
        ParseResult::Ok {
            program: Program::Module(swc_core::ecma::ast::Module::dummy()),
            comments: Default::default(),
            eval_context,
            globals: Arc::new(globals),
            source_map: Default::default(),
        }
        .cell()
    }
}

#[instrument(level = Level::INFO, skip_all)]
pub fn generate_js_source_map(
    files_map: Arc<swc_core::common::SourceMap>,
    mappings: Vec<(BytePos, LineCol)>,
    original_source_map: Option<&Rope>,
    inline_sources_content: bool,
) -> Result<Rope> {
    let original_source_map = original_source_map.map(|x| x.to_bytes());
    let input_map = if let Some(original_source_map) = &original_source_map {
        Some(swc_sourcemap::lazy::decode(original_source_map)?.into_source_map()?)
    } else {
        None
    };

    let new_mappings = files_map.build_source_map(
        &mappings,
        None,
        InlineSourcesContentConfig {
            // If we are going to adjust the source map, we are going to throw the source contents
            // of this source map away regardless.
            //
            // In other words, we don't need the content of `B` in source map chain of A -> B -> C.
            // We only need the source content of `A`, and a way to map the content of `B` back to
            // `A`, while constructing the final source map, `C`.
            inline_sources_content: inline_sources_content && input_map.is_none(),
        },
    );

    match input_map {
        Some(mut map) => {
            // TODO: Make this more efficient
            map.adjust_mappings(new_mappings);

            // TODO: Enable this when we have a way to handle the ignore list
            // add_default_ignore_list(&mut map);
            let map = map.into_raw_sourcemap();
            let result = serde_json::to_vec(&map)?;
            Ok(Rope::from(result))
        }
        None => {
            // We don't convert sourcemap::SourceMap into raw_sourcemap::SourceMap because we don't
            // need to adjust mappings
            let mut map = new_mappings;

            add_default_ignore_list(&mut map);

            let mut result = vec![];
            map.to_writer(&mut result)?;
            Ok(Rope::from(result))
        }
    }
}

/// A config to generate a source map which includes the source content of every
/// source file. SWC doesn't inline sources content by default when generating a
/// sourcemap, so we need to provide a custom config to do it.
pub struct InlineSourcesContentConfig {
    inline_sources_content: bool,
}

impl SourceMapGenConfig for InlineSourcesContentConfig {
    fn file_name_to_source(&self, f: &FileName) -> String {
        match f {
            FileName::Custom(s) => {
                format!("{SOURCE_URL_PROTOCOL}///{s}")
            }
            _ => f.to_string(),
        }
    }

    fn inline_sources_content(&self, _f: &FileName) -> bool {
        self.inline_sources_content
    }
}

#[turbo_tasks::function]
pub async fn parse(
    source: ResolvedVc<Box<dyn Source>>,
    ty: EcmascriptModuleAssetType,
    transforms: Vc<EcmascriptInputTransforms>,
) -> Result<Vc<ParseResult>> {
    let name = source.ident().to_string().await?.to_string();
    let span = tracing::info_span!("parse ecmascript", name = name, ty = display(&ty));

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
    source: ResolvedVc<Box<dyn Source>>,
    ty: EcmascriptModuleAssetType,
    transforms: Vc<EcmascriptInputTransforms>,
) -> Result<Vc<ParseResult>> {
    let content = source.content();
    let fs_path_vc = source.ident().path();
    let fs_path = &*fs_path_vc.await?;
    let ident = &*source.ident().to_string().await?;
    let file_path_hash = hash_xxh3_hash64(&*source.ident().to_string().await?) as u128;
    let content = match content.await {
        Ok(content) => content,
        Err(error) => {
            let error: RcStr = PrettyPrintError(&error).to_string().into();
            ReadSourceIssue {
                source,
                error: error.clone(),
            }
            .resolved_cell()
            .emit();

            return Ok(ParseResult::Unparseable {
                messages: Some(vec![error]),
            }
            .cell());
        }
    };
    Ok(match &*content {
        AssetContent::File(file) => match &*file.await? {
            FileContent::NotFound => ParseResult::NotFound.cell(),
            FileContent::Content(file) => {
                match BytesStr::from_utf8(file.content().clone().into_bytes()) {
                    Ok(string) => {
                        let transforms = &*transforms.await?;
                        match parse_file_content(
                            string,
                            fs_path_vc,
                            fs_path,
                            ident,
                            source.ident().await?.query.clone(),
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
                        let error: RcStr = PrettyPrintError(
                            &anyhow::anyhow!(error).context("failed to convert rope into string"),
                        )
                        .to_string()
                        .into();
                        ReadSourceIssue {
                            source,
                            error: error.clone(),
                        }
                        .resolved_cell()
                        .emit();
                        ParseResult::Unparseable {
                            messages: Some(vec![error]),
                        }
                        .cell()
                    }
                }
            }
        },
        AssetContent::Redirect { .. } => ParseResult::Unparseable { messages: None }.cell(),
    })
}

async fn parse_file_content(
    string: BytesStr,
    fs_path_vc: Vc<FileSystemPath>,
    fs_path: &FileSystemPath,
    ident: &str,
    query: RcStr,
    file_path_hash: u128,
    source: ResolvedVc<Box<dyn Source>>,
    ty: EcmascriptModuleAssetType,
    transforms: &[EcmascriptInputTransform],
) -> Result<Vc<ParseResult>> {
    let source_map: Arc<swc_core::common::SourceMap> = Default::default();
    let (emitter, collector) = IssueEmitter::new(
        source,
        source_map.clone(),
        Some("Ecmascript file had an error".into()),
    );
    let handler = Handler::with_emitter(true, false, Box::new(emitter));

    let (emitter, collector_parse) = IssueEmitter::new(
        source,
        source_map.clone(),
        Some("Parsing ecmascript source code failed".into()),
    );
    let parser_handler = Handler::with_emitter(true, false, Box::new(emitter));
    let globals = Arc::new(Globals::new());
    let globals_ref = &globals;

    let mut result = WrapFuture::new(
        async {
            let file_name = FileName::Custom(ident.to_string());
            let fm = source_map.new_source_file(file_name.clone().into(), string);

            let comments = SwcComments::default();

            let mut parsed_program = {
                let lexer = Lexer::new(
                    match ty {
                        EcmascriptModuleAssetType::Ecmascript => Syntax::Es(EsSyntax {
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
                            Syntax::Typescript(TsSyntax {
                                decorators: true,
                                dts: false,
                                no_early_errors: true,
                                tsx,
                                disallow_ambiguous_jsx_like: false,
                            })
                        }
                        EcmascriptModuleAssetType::TypescriptDeclaration => {
                            Syntax::Typescript(TsSyntax {
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
                let span = tracing::trace_span!("swc_parse").entered();
                let program_result = parser.parse_program();
                drop(span);

                let mut has_errors = vec![];
                for e in parser.take_errors() {
                    let mut e = e.into_diagnostic(&parser_handler);
                    has_errors.extend(e.message.iter().map(|m| m.0.as_str().into()));
                    e.emit();
                }

                if !has_errors.is_empty() {
                    return Ok(ParseResult::Unparseable {
                        messages: Some(has_errors),
                    });
                }

                match program_result {
                    Ok(parsed_program) => parsed_program,
                    Err(e) => {
                        let mut e = e.into_diagnostic(&parser_handler);
                        let messages = e.message.iter().map(|m| m.0.as_str().into()).collect();

                        e.emit();

                        return Ok(ParseResult::Unparseable {
                            messages: Some(messages),
                        });
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
            let span = tracing::trace_span!("swc_resolver").entered();

            parsed_program.visit_mut_with(&mut resolver(
                unresolved_mark,
                top_level_mark,
                is_typescript,
            ));
            drop(span);

            let span = tracing::trace_span!("swc_lint").entered();

            let lint_config = LintConfig::default();
            let rules = swc_core::ecma::lints::rules::all(LintParams {
                program: &parsed_program,
                lint_config: &lint_config,
                unresolved_ctxt: SyntaxContext::empty().apply_mark(unresolved_mark),
                top_level_ctxt: SyntaxContext::empty().apply_mark(top_level_mark),
                es_version: EsVersion::latest(),
                source_map: source_map.clone(),
            });

            parsed_program.mutate(swc_core::ecma::lints::rules::lint_pass(rules));
            drop(span);

            parsed_program.mutate(swc_core::ecma::transforms::proposal::explicit_resource_management::explicit_resource_management());

            let var_with_ts_declare = if is_typescript {
                VarDeclWithTsDeclareCollector::collect(&parsed_program)
            } else {
                FxHashSet::default()
            };

            let transform_context = TransformContext {
                comments: &comments,
                source_map: &source_map,
                top_level_mark,
                unresolved_mark,
                file_path_str: &fs_path.path,
                file_name_str: fs_path.file_name(),
                file_name_hash: file_path_hash,
                query_str: query,
                file_path: fs_path_vc.to_resolved().await?,
            };
            let span = tracing::trace_span!("transforms");
            async {
                for transform in transforms.iter() {
                    transform
                        .apply(&mut parsed_program, &transform_context)
                        .await?;
                }
                anyhow::Ok(())
            }
                .instrument(span)
                .await?;

            if parser_handler.has_errors() {
                let messages = if let Some(error) = collector_parse.last_emitted_issue() {
                    // The emitter created in here only uses StyledString::Text
                    if let StyledString::Text(xx) = &*error.await?.message.await? {
                        Some(vec![xx.clone()])
                    } else {
                        None
                    }
                } else {
                    None
                };
                let messages =
                    Some(messages.unwrap_or_else(|| vec![fm.src.clone().into()]));
                return Ok(ParseResult::Unparseable { messages });
            }

            parsed_program.visit_mut_with(
                &mut swc_core::ecma::transforms::base::helpers::inject_helpers(unresolved_mark),
            );

            let eval_context = EvalContext::new(
                &parsed_program,
                unresolved_mark,
                top_level_mark,
                Arc::new(var_with_ts_declare),
                Some(&comments),
                Some(source),
            );

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
                HANDLER.set(&handler, || HELPERS.set(&Helpers::new(true), || f.poll(cx)))
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
    collector.emit().await?;
    collector_parse.emit().await?;
    Ok(result.cell())
}

#[turbo_tasks::value]
struct ReadSourceIssue {
    source: ResolvedVc<Box<dyn Source>>,
    error: RcStr,
}

#[turbo_tasks::value_impl]
impl Issue for ReadSourceIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.ident().path()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Reading source code for parsing failed".into()).cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(
                format!(
                    "An unexpected error happened while trying to read the source code to parse: \
                     {}",
                    self.error
                )
                .into(),
            )
            .resolved_cell(),
        ))
    }

    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Error.cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Load.cell()
    }
}

struct VarDeclWithTsDeclareCollector {
    id_with_no_ts_declare: FxHashSet<Id>,
    id_with_ts_declare: FxHashSet<Id>,
}

impl VarDeclWithTsDeclareCollector {
    fn collect<N: VisitWith<VarDeclWithTsDeclareCollector>>(n: &N) -> FxHashSet<Id> {
        let mut collector = VarDeclWithTsDeclareCollector {
            id_with_no_ts_declare: Default::default(),
            id_with_ts_declare: Default::default(),
        };
        n.visit_with(&mut collector);
        collector
            .id_with_ts_declare
            .retain(|id| !collector.id_with_no_ts_declare.contains(id));
        collector.id_with_ts_declare
    }

    fn handle_pat(&mut self, pat: &Pat, declare: bool) {
        match pat {
            Pat::Ident(binding_ident) => {
                if declare {
                    self.id_with_ts_declare.insert(binding_ident.to_id());
                } else {
                    self.id_with_no_ts_declare.insert(binding_ident.to_id());
                }
            }
            Pat::Array(array_pat) => {
                for pat in array_pat.elems.iter().flatten() {
                    self.handle_pat(pat, declare);
                }
            }
            Pat::Object(object_pat) => {
                for prop in object_pat.props.iter() {
                    match prop {
                        ObjectPatProp::KeyValue(key_value_pat_prop) => {
                            self.handle_pat(&key_value_pat_prop.value, declare);
                        }
                        ObjectPatProp::Assign(assign_pat_prop) => {
                            if declare {
                                self.id_with_ts_declare.insert(assign_pat_prop.key.to_id());
                            } else {
                                self.id_with_no_ts_declare
                                    .insert(assign_pat_prop.key.to_id());
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
}

impl Visit for VarDeclWithTsDeclareCollector {
    noop_visit_type!();

    fn visit_var_decl(&mut self, node: &VarDecl) {
        for decl in node.decls.iter() {
            self.handle_pat(&decl.name, node.declare);
        }
    }
}
