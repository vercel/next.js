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
        source_map::{Files, SourceMapGenConfig, build_source_map},
    },
    ecma::{
        ast::{EsVersion, Id, ObjectPatProp, Pat, Program, VarDecl},
        lints::{self, config::LintConfig, rules::LintParams},
        parser::{EsSyntax, Parser, Syntax, TsSyntax, lexer::Lexer},
        transforms::{
            base::{
                helpers::{HELPERS, Helpers},
                resolver,
            },
            proposal::explicit_resource_management::explicit_resource_management,
        },
        visit::{Visit, VisitMutWith, VisitWith, noop_visit_type},
    },
};
use tracing::{Instrument, instrument};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc, util::WrapFuture};
use turbo_tasks_fs::{FileContent, FileSystemPath, rope::Rope};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    SOURCE_URL_PROTOCOL,
    asset::{Asset, AssetContent},
    error::PrettyPrintError,
    issue::{
        Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, OptionIssueSource,
        OptionStyledString, StyledString,
    },
    source::Source,
    source_map::utils::add_default_ignore_list,
};
use turbopack_swc_utils::emitter::IssueEmitter;

use super::EcmascriptModuleAssetType;
use crate::{
    EcmascriptInputTransform,
    analyzer::graph::EvalContext,
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
    Unparsable {
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

/// `original_source_maps_complete` indicates whether the `original_source_maps` cover the whole
/// map, i.e. whether every module that ended up in `mappings` had an original sourcemap.
#[instrument(level = "info", name = "generate source map", skip_all)]
pub fn generate_js_source_map<'a>(
    files_map: &impl Files,
    mappings: Vec<(BytePos, LineCol)>,
    original_source_maps: impl IntoIterator<Item = &'a Rope>,
    original_source_maps_complete: bool,
    inline_sources_content: bool,
) -> Result<Rope> {
    let original_source_maps = original_source_maps
        .into_iter()
        .map(|map| map.to_bytes())
        .collect::<Vec<_>>();
    let original_source_maps = original_source_maps
        .iter()
        .map(|map| Ok(swc_sourcemap::lazy::decode(map)?.into_source_map()?))
        .collect::<Result<Vec<_>>>()?;

    let fast_path_single_original_source_map =
        original_source_maps.len() == 1 && original_source_maps_complete;

    let mut new_mappings = build_source_map(
        files_map,
        &mappings,
        None,
        &InlineSourcesContentConfig {
            // If we are going to adjust the source map, we are going to throw the source contents
            // of this source map away regardless.
            //
            // In other words, we don't need the content of `B` in source map chain of A -> B -> C.
            // We only need the source content of `A`, and a way to map the content of `B` back to
            // `A`, while constructing the final source map, `C`.
            inline_sources_content: inline_sources_content && !fast_path_single_original_source_map,
        },
    );

    if original_source_maps.is_empty() {
        // We don't convert sourcemap::SourceMap into raw_sourcemap::SourceMap because we don't
        // need to adjust mappings

        add_default_ignore_list(&mut new_mappings);

        let mut result = vec![];
        new_mappings.to_writer(&mut result)?;
        Ok(Rope::from(result))
    } else if fast_path_single_original_source_map {
        let mut map = original_source_maps.into_iter().next().unwrap();
        // TODO: Make this more efficient
        map.adjust_mappings(new_mappings);

        // TODO: Enable this when we have a way to handle the ignore list
        // add_default_ignore_list(&mut map);
        let map = map.into_raw_sourcemap();
        let result = serde_json::to_vec(&map)?;
        Ok(Rope::from(result))
    } else {
        let mut map = new_mappings.adjust_mappings_from_multiple(original_source_maps);

        add_default_ignore_list(&mut map);

        let mut result = vec![];
        map.to_writer(&mut result)?;
        Ok(Rope::from(result))
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
    transforms: ResolvedVc<EcmascriptInputTransforms>,
    is_external_tracing: bool,
    inline_helpers: bool,
) -> Result<Vc<ParseResult>> {
    let span = tracing::info_span!(
        "parse ecmascript",
        name = display(source.ident().to_string().await?),
        ty = display(&ty)
    );

    match parse_internal(
        source,
        ty,
        transforms,
        is_external_tracing && matches!(ty, EcmascriptModuleAssetType::EcmascriptExtensionless),
        inline_helpers,
    )
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
    transforms: ResolvedVc<EcmascriptInputTransforms>,
    loose_errors: bool,
    inline_helpers: bool,
) -> Result<Vc<ParseResult>> {
    let content = source.content();
    let fs_path = source.ident().path().owned().await?;
    let ident = &*source.ident().to_string().await?;
    let file_path_hash = hash_xxh3_hash64(&*source.ident().to_string().await?) as u128;
    let content = match content.await {
        Ok(content) => content,
        Err(error) => {
            let error: RcStr = PrettyPrintError(&error).to_string().into();
            ReadSourceIssue {
                source: IssueSource::from_source_only(source),
                error: error.clone(),
                severity: if loose_errors {
                    IssueSeverity::Warning
                } else {
                    IssueSeverity::Error
                },
            }
            .resolved_cell()
            .emit();

            return Ok(ParseResult::Unparsable {
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
                            &fs_path,
                            ident,
                            source.ident().await?.query.clone(),
                            file_path_hash,
                            source,
                            ty,
                            transforms,
                            loose_errors,
                            inline_helpers,
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
                            // Technically we could supply byte offsets to the issue source, but
                            // that would cause another utf8 error to be produced when we
                            // attempt to infer line/column
                            // offsets
                            source: IssueSource::from_source_only(source),
                            error: error.clone(),
                            severity: if loose_errors {
                                IssueSeverity::Warning
                            } else {
                                IssueSeverity::Error
                            },
                        }
                        .resolved_cell()
                        .emit();
                        ParseResult::Unparsable {
                            messages: Some(vec![error]),
                        }
                        .cell()
                    }
                }
            }
        },
        AssetContent::Redirect { .. } => ParseResult::Unparsable { messages: None }.cell(),
    })
}

async fn parse_file_content(
    string: BytesStr,
    fs_path: &FileSystemPath,
    ident: &str,
    query: RcStr,
    file_path_hash: u128,
    source: ResolvedVc<Box<dyn Source>>,
    ty: EcmascriptModuleAssetType,
    transforms: &[EcmascriptInputTransform],
    loose_errors: bool,
    inline_helpers: bool,
) -> Result<Vc<ParseResult>> {
    let source_map: Arc<swc_core::common::SourceMap> = Default::default();
    let (emitter, collector) = IssueEmitter::new(
        source,
        source_map.clone(),
        Some(rcstr!("Ecmascript file had an error")),
    );
    let handler = Handler::with_emitter(true, false, Box::new(emitter));

    let (emitter, collector_parse) = IssueEmitter::new(
        source,
        source_map.clone(),
        Some(rcstr!("Parsing ecmascript source code failed")),
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
                        EcmascriptModuleAssetType::Ecmascript
                        | EcmascriptModuleAssetType::EcmascriptExtensionless => {
                            Syntax::Es(EsSyntax {
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
                            })
                        }
                        EcmascriptModuleAssetType::Typescript { tsx, .. } => {
                            Syntax::Typescript(TsSyntax {
                                decorators: true,
                                dts: false,
                                tsx,
                                ..Default::default()
                            })
                        }
                        EcmascriptModuleAssetType::TypescriptDeclaration => {
                            Syntax::Typescript(TsSyntax {
                                decorators: true,
                                dts: true,
                                tsx: false,
                                ..Default::default()
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
                    return Ok(ParseResult::Unparsable {
                        messages: Some(has_errors),
                    });
                }

                match program_result {
                    Ok(parsed_program) => parsed_program,
                    Err(e) => {
                        let mut e = e.into_diagnostic(&parser_handler);
                        let messages = e.message.iter().map(|m| m.0.as_str().into()).collect();

                        e.emit();

                        return Ok(ParseResult::Unparsable {
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

            let helpers = Helpers::new(!inline_helpers);
            let span = tracing::trace_span!("swc_resolver").entered();

            parsed_program.visit_mut_with(&mut resolver(
                unresolved_mark,
                top_level_mark,
                is_typescript,
            ));
            drop(span);

            let span = tracing::trace_span!("swc_lint").entered();

            let lint_config = LintConfig::default();
            let rules = lints::rules::all(LintParams {
                program: &parsed_program,
                lint_config: &lint_config,
                unresolved_ctxt: SyntaxContext::empty().apply_mark(unresolved_mark),
                top_level_ctxt: SyntaxContext::empty().apply_mark(top_level_mark),
                es_version: EsVersion::latest(),
                source_map: source_map.clone(),
            });

            parsed_program.mutate(lints::rules::lint_pass(rules));
            drop(span);

            HELPERS.set(&helpers, || {
                parsed_program.mutate(explicit_resource_management());
            });

            let var_with_ts_declare = if is_typescript {
                VarDeclWithTsDeclareCollector::collect(&parsed_program)
            } else {
                FxHashSet::default()
            };

            let mut helpers = helpers.data();
            let transform_context = TransformContext {
                comments: &comments,
                source_map: &source_map,
                top_level_mark,
                unresolved_mark,
                file_path_str: &fs_path.path,
                file_name_str: fs_path.file_name(),
                file_name_hash: file_path_hash,
                query_str: query,
                file_path: fs_path.clone(),
                source,
            };
            let span = tracing::trace_span!("transforms");
            async {
                for transform in transforms.iter() {
                    helpers = transform
                        .apply(&mut parsed_program, &transform_context, helpers)
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
                let messages = Some(messages.unwrap_or_else(|| vec![fm.src.clone().into()]));
                return Ok(ParseResult::Unparsable { messages });
            }

            let helpers = Helpers::from_data(helpers);
            HELPERS.set(&helpers, || {
                parsed_program.mutate(swc_core::ecma::transforms::base::helpers::inject_helpers(
                    unresolved_mark,
                ));
            });

            let eval_context = EvalContext::new(
                Some(&parsed_program),
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
        |f, cx| GLOBALS.set(globals_ref, || HANDLER.set(&handler, || f.poll(cx))),
    )
    .await?;
    if let ParseResult::Ok {
        globals: ref mut g, ..
    } = result
    {
        // Assign the correct globals
        *g = globals;
    }
    collector.emit(loose_errors).await?;
    collector_parse.emit(loose_errors).await?;
    Ok(result.cell())
}

#[turbo_tasks::value]
struct ReadSourceIssue {
    source: IssueSource,
    error: RcStr,
    severity: IssueSeverity,
}

#[turbo_tasks::value_impl]
impl Issue for ReadSourceIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.file_path()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!("Reading source code for parsing failed")).cell()
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

    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Load.cell()
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(Some(self.source))
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
