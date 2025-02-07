pub mod amd;
pub mod async_module;
pub mod cjs;
pub mod constant_condition;
pub mod constant_value;
pub mod dynamic_expression;
pub mod esm;
pub mod external_module;
pub mod ident;
pub mod member;
pub mod node;
pub mod pattern_mapping;
pub mod raw;
pub mod require_context;
pub mod type_issue;
pub mod typescript;
pub mod unreachable;
pub mod util;
pub mod worker;

use std::{borrow::Cow, collections::BTreeMap, future::Future, mem::take, ops::Deref, sync::Arc};

use anyhow::{bail, Result};
use constant_condition::{ConstantConditionCodeGen, ConstantConditionValue};
use constant_value::ConstantValueCodeGen;
use lazy_static::lazy_static;
use num_traits::Zero;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use regex::Regex;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use swc_core::{
    atoms::JsWord,
    common::{
        comments::{CommentKind, Comments},
        errors::{DiagnosticId, Handler, HANDLER},
        pass::AstNodePath,
        source_map::SmallPos,
        Globals, Span, Spanned, GLOBALS,
    },
    ecma::{
        ast::*,
        visit::{
            fields::{AssignExprField, AssignTargetField, SimpleAssignTargetField},
            AstParentKind, AstParentNodeRef, VisitAstPath, VisitWithAstPath,
        },
    },
};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    trace::TraceRawVcs, FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TaskInput,
    TryJoinIterExt, Upcast, Value, ValueToString, Vc,
};
use turbo_tasks_fs::{rope::Rope, FileSystemPath};
use turbopack_core::{
    compile_time_info::{
        CompileTimeInfo, DefineableNameSegment, FreeVarReference, FreeVarReferences,
        FreeVarReferencesIndividual,
    },
    environment::Rendering,
    error::PrettyPrintError,
    issue::{analyze::AnalyzeIssue, IssueExt, IssueSeverity, IssueSource, StyledString},
    module::Module,
    reference::{ModuleReference, ModuleReferences, SourceMapReference},
    reference_type::{CommonJsReferenceSubType, ReferenceType},
    resolve::{
        find_context_file,
        origin::{PlainResolveOrigin, ResolveOrigin, ResolveOriginExt},
        parse::Request,
        pattern::Pattern,
        resolve, FindContextFileResult, ModulePart,
    },
    source::Source,
    source_map::{
        utils::resolve_source_map_sources, GenerateSourceMap, OptionStringifiedSourceMap,
    },
};
use turbopack_resolve::{
    ecmascript::{apply_cjs_specific_options, cjs_resolve_source},
    typescript::tsconfig,
};
use turbopack_swc_utils::emitter::IssueEmitter;
use unreachable::Unreachable;
use worker::WorkerAssetReference;

use self::{
    amd::{
        AmdDefineAssetReference, AmdDefineDependencyElement, AmdDefineFactoryType,
        AmdDefineWithDependenciesCodeGen,
    },
    cjs::CjsAssetReference,
    esm::{
        export::EsmExport, EsmAssetReference, EsmAsyncAssetReference, EsmExports, EsmModuleItem,
        ImportMetaBinding, ImportMetaRef, UrlAssetReference,
    },
    node::DirAssetReference,
    raw::FileSourceReference,
    typescript::{TsConfigReference, TsReferencePathAssetReference, TsReferenceTypeAssetReference},
};
use super::{
    analyzer::{
        builtin::replace_builtin,
        graph::{create_graph, Effect},
        linker::link,
        well_known::replace_well_known,
        ConstantValue as JsConstantValue, JsValue, ObjectPart, WellKnownFunctionKind,
        WellKnownObjectKind,
    },
    errors,
    parse::ParseResult,
    special_cases::special_cases,
    utils::js_value_to_pattern,
    webpack::{
        parse::{webpack_runtime, WebpackRuntime},
        WebpackChunkAssetReference, WebpackEntryAssetReference, WebpackRuntimeAssetReference,
    },
    EcmascriptModuleAssetType, ModuleTypeResult,
};
pub use crate::references::esm::export::{follow_reexports, FollowExportsResult};
use crate::{
    analyzer::{
        builtin::early_replace_builtin,
        graph::{ConditionalKind, EffectArg, EvalContext, VarGraph},
        imports::{ImportAnnotations, ImportAttributes, ImportedSymbol, Reexport},
        parse_require_context,
        top_level_await::has_top_level_await,
        ConstantNumber, ConstantString, JsValueUrlKind, RequireContextValue,
    },
    chunk::EcmascriptExports,
    code_gen::{CodeGen, CodeGens},
    magic_identifier,
    parse::parse,
    references::{
        async_module::{AsyncModule, OptionAsyncModule},
        cjs::{CjsRequireAssetReference, CjsRequireCacheAccess, CjsRequireResolveAssetReference},
        dynamic_expression::DynamicExpression,
        esm::{module_id::EsmModuleIdAssetReference, EsmBinding, UrlRewriteBehavior},
        ident::IdentReplacement,
        member::MemberReplacement,
        node::PackageJsonReference,
        require_context::{RequireContextAssetReference, RequireContextMap},
        type_issue::SpecifiedModuleTypeIssue,
    },
    runtime_functions::{
        TUBROPACK_RUNTIME_FUNCTION_SHORTCUTS, TURBOPACK_EXPORT_NAMESPACE, TURBOPACK_EXPORT_VALUE,
        TURBOPACK_REQUIRE_REAL, TURBOPACK_REQUIRE_STUB,
    },
    tree_shake::{find_turbopack_part_id_in_asserts, part_of_module, split},
    utils::{module_value_to_well_known_object, AstPathRange},
    EcmascriptInputTransforms, EcmascriptModuleAsset, EcmascriptParsable, SpecifiedModuleType,
    TreeShakingMode,
};

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub struct AnalyzeEcmascriptModuleResult {
    pub references: ResolvedVc<ModuleReferences>,
    pub local_references: ResolvedVc<ModuleReferences>,
    pub reexport_references: ResolvedVc<ModuleReferences>,
    pub evaluation_references: ResolvedVc<ModuleReferences>,
    pub code_generation: ResolvedVc<CodeGens>,
    pub exports: ResolvedVc<EcmascriptExports>,
    pub async_module: ResolvedVc<OptionAsyncModule>,
    /// `true` when the analysis was successful.
    pub successful: bool,
    pub source_map: ResolvedVc<OptionStringifiedSourceMap>,
}

/// A temporary analysis result builder to pass around, to be turned into an
/// `Vc<AnalyzeEcmascriptModuleResult>` eventually.
pub struct AnalyzeEcmascriptModuleResultBuilder {
    references: FxIndexSet<ResolvedVc<Box<dyn ModuleReference>>>,
    local_references: FxIndexSet<ResolvedVc<Box<dyn ModuleReference>>>,
    reexport_references: FxIndexSet<ResolvedVc<Box<dyn ModuleReference>>>,
    evaluation_references: FxIndexSet<ResolvedVc<Box<dyn ModuleReference>>>,
    code_gens: Vec<CodeGen>,
    exports: EcmascriptExports,
    async_module: ResolvedVc<OptionAsyncModule>,
    successful: bool,
    source_map: Option<ResolvedVc<OptionStringifiedSourceMap>>,
}

impl AnalyzeEcmascriptModuleResultBuilder {
    pub fn new() -> Self {
        Self {
            references: FxIndexSet::default(),
            local_references: FxIndexSet::default(),
            reexport_references: FxIndexSet::default(),
            evaluation_references: FxIndexSet::default(),
            code_gens: Vec::new(),
            exports: EcmascriptExports::None,
            async_module: ResolvedVc::cell(None),
            successful: false,
            source_map: None,
        }
    }

    /// Adds an asset reference to the analysis result.
    pub fn add_reference(&mut self, reference: ResolvedVc<impl Upcast<Box<dyn ModuleReference>>>) {
        let r = ResolvedVc::upcast(reference);
        self.references.insert(r);
        self.local_references.insert(r);
    }

    /// Adds an asset reference to the analysis result.
    pub fn add_import_reference(
        &mut self,
        reference: ResolvedVc<impl Upcast<Box<dyn ModuleReference>>>,
    ) {
        self.references.insert(ResolvedVc::upcast(reference));
    }

    /// Adds an reexport reference to the analysis result.
    pub fn add_local_reference(
        &mut self,
        reference: ResolvedVc<impl Upcast<Box<dyn ModuleReference>>>,
    ) {
        self.local_references.insert(ResolvedVc::upcast(reference));
    }

    /// Adds an reexport reference to the analysis result.
    pub fn add_reexport_reference(
        &mut self,
        reference: ResolvedVc<impl Upcast<Box<dyn ModuleReference>>>,
    ) {
        self.reexport_references
            .insert(ResolvedVc::upcast(reference));
    }

    /// Adds an evaluation reference to the analysis result.
    pub fn add_evaluation_reference(&mut self, reference: ResolvedVc<EsmAssetReference>) {
        self.evaluation_references
            .insert(ResolvedVc::upcast(reference));
    }

    /// Adds a codegen to the analysis result.
    pub fn add_code_gen<C>(&mut self, code_gen: C)
    where
        C: Into<CodeGen>,
    {
        self.code_gens.push(code_gen.into())
    }

    /// Sets the analysis result ES export.
    pub fn set_source_map(&mut self, source_map: ResolvedVc<OptionStringifiedSourceMap>) {
        self.source_map = Some(source_map);
    }

    /// Sets the analysis result ES export.
    pub fn set_exports(&mut self, exports: EcmascriptExports) {
        self.exports = exports;
    }

    /// Sets the analysis result ES export.
    pub fn set_async_module(&mut self, async_module: ResolvedVc<AsyncModule>) {
        self.async_module = ResolvedVc::cell(Some(async_module));
    }

    /// Sets whether the analysis was successful.
    pub fn set_successful(&mut self, successful: bool) {
        self.successful = successful;
    }

    /// Builds the final analysis result. Resolves internal Vcs.
    pub async fn build(
        mut self,
        track_reexport_references: bool,
    ) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
        let references = self.references.into_iter().collect();
        let local_references: Vec<_> = track_reexport_references
            .then(|| self.local_references.into_iter())
            .into_iter()
            .flatten()
            .collect();
        let reexport_references: Vec<_> = track_reexport_references
            .then(|| self.reexport_references.into_iter())
            .into_iter()
            .flatten()
            .collect();
        let evaluation_references: Vec<_> = track_reexport_references
            .then(|| self.evaluation_references.into_iter())
            .into_iter()
            .flatten()
            .collect();

        let source_map = if let Some(source_map) = self.source_map {
            source_map
        } else {
            OptionStringifiedSourceMap::none().to_resolved().await?
        };

        self.code_gens.shrink_to_fit();
        Ok(AnalyzeEcmascriptModuleResult::cell(
            AnalyzeEcmascriptModuleResult {
                references: ResolvedVc::cell(references),
                local_references: ResolvedVc::cell(local_references),
                reexport_references: ResolvedVc::cell(reexport_references),
                evaluation_references: ResolvedVc::cell(evaluation_references),
                code_generation: ResolvedVc::cell(self.code_gens),
                exports: self.exports.resolved_cell(),
                async_module: self.async_module,
                successful: self.successful,
                source_map,
            },
        ))
    }
}

impl Default for AnalyzeEcmascriptModuleResultBuilder {
    fn default() -> Self {
        Self::new()
    }
}

struct AnalysisState<'a> {
    handler: &'a Handler,
    source: ResolvedVc<Box<dyn Source>>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    compile_time_info: ResolvedVc<CompileTimeInfo>,
    var_graph: &'a VarGraph,
    /// This is the current state of known values of function
    /// arguments.
    fun_args_values: Mutex<FxHashMap<u32, Vec<JsValue>>>,
    var_cache: Mutex<FxHashMap<Id, JsValue>>,
    // There can be many references to import.meta, but only the first should hoist
    // the object allocation.
    first_import_meta: bool,
    tree_shaking_mode: Option<TreeShakingMode>,
    import_externals: bool,
    ignore_dynamic_requests: bool,
    url_rewrite_behavior: Option<UrlRewriteBehavior>,
    free_var_references: ReadRef<FreeVarReferencesIndividual>,
}

impl AnalysisState<'_> {
    /// Links a value to the graph, returning the linked value.
    async fn link_value(&self, value: JsValue, attributes: &ImportAttributes) -> Result<JsValue> {
        Ok(link(
            self.var_graph,
            value,
            &early_value_visitor,
            &|value| {
                value_visitor(
                    *self.origin,
                    value,
                    *self.compile_time_info,
                    &self.free_var_references,
                    self.var_graph,
                    attributes,
                )
            },
            &self.fun_args_values,
            &self.var_cache,
        )
        .await?
        .0)
    }
}

fn set_handler_and_globals<F, R>(handler: &Handler, globals: &Arc<Globals>, f: F) -> R
where
    F: FnOnce() -> R,
{
    HANDLER.set(handler, || GLOBALS.set(globals, f))
}

/// Analyse a provided [EcmascriptModuleAsset] and return a [AnalyzeEcmascriptModuleResult].
#[turbo_tasks::function]
pub(crate) async fn analyse_ecmascript_module(
    module: ResolvedVc<EcmascriptModuleAsset>,
    part: Option<ModulePart>,
) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
    let span = {
        let module = module.ident().to_string().await?.to_string();
        tracing::info_span!("analyse ecmascript module", module = module)
    };
    let result = analyse_ecmascript_module_internal(module, part)
        .instrument(span)
        .await;

    match result {
        Ok(result) => Ok(result),
        Err(err) => Err(err.context(format!(
            "failed to analyse ecmascript module '{}'",
            module.ident().to_string().await?
        ))),
    }
}

pub(crate) async fn analyse_ecmascript_module_internal(
    module: ResolvedVc<EcmascriptModuleAsset>,
    part: Option<ModulePart>,
) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
    let raw_module = module.await?;

    let source = raw_module.source;
    let ty = Value::new(raw_module.ty);
    let transforms = raw_module.transforms;
    let options = raw_module.options;
    let options = options.await?;
    let import_externals = options.import_externals;

    let origin = ResolvedVc::upcast::<Box<dyn ResolveOrigin>>(module);

    let mut analysis = AnalyzeEcmascriptModuleResultBuilder::new();
    let path = origin.origin_path();

    // Is this a typescript file that requires analzying type references?
    let analyze_types = match &*ty {
        EcmascriptModuleAssetType::Typescript { analyze_types, .. } => *analyze_types,
        EcmascriptModuleAssetType::TypescriptDeclaration => true,
        EcmascriptModuleAssetType::Ecmascript => false,
    };

    let parsed = if let Some(part) = part {
        let parsed = parse(*source, ty, *transforms);
        let split_data = split(source.ident(), *source, parsed);
        part_of_module(split_data, part.clone())
    } else {
        module.failsafe_parse()
    };

    let ModuleTypeResult {
        module_type: specified_type,
        referenced_package_json,
    } = *module.determine_module_type().await?;

    if let Some(package_json) = referenced_package_json {
        let span = tracing::info_span!("package.json reference");
        async {
            analysis.add_reference(
                PackageJsonReference::new(*package_json)
                    .to_resolved()
                    .await?,
            );
            anyhow::Ok(())
        }
        .instrument(span)
        .await?;
    }

    if analyze_types {
        let span = tracing::info_span!("tsconfig reference");
        async {
            match &*find_context_file(path.parent(), tsconfig()).await? {
                FindContextFileResult::Found(tsconfig, _) => {
                    analysis.add_reference(
                        TsConfigReference::new(*origin, **tsconfig)
                            .to_resolved()
                            .await?,
                    );
                }
                FindContextFileResult::NotFound(_) => {}
            };
            anyhow::Ok(())
        }
        .instrument(span)
        .await?;
    }

    special_cases(&path.await?.path, &mut analysis);

    let parsed = parsed.await?;

    let ParseResult::Ok {
        program,
        globals,
        eval_context,
        comments,
        source_map,
        ..
    } = &*parsed
    else {
        return analysis.build(false).await;
    };

    let compile_time_info = compile_time_info_for_module_type(
        *raw_module.compile_time_info,
        eval_context.is_esm(specified_type),
    )
    .to_resolved()
    .await?;

    let mut import_references = Vec::new();

    let pos = program.span().lo;
    if analyze_types {
        let span = tracing::info_span!("type references");
        async {
            if let Some(comments) = comments.get_leading(pos) {
                for comment in comments.iter() {
                    if let CommentKind::Line = comment.kind {
                        lazy_static! {
                            static ref REFERENCE_PATH: Regex =
                                Regex::new(r#"^/\s*<reference\s*path\s*=\s*["'](.+)["']\s*/>\s*$"#)
                                    .unwrap();
                            static ref REFERENCE_TYPES: Regex = Regex::new(
                                r#"^/\s*<reference\s*types\s*=\s*["'](.+)["']\s*/>\s*$"#
                            )
                            .unwrap();
                        }
                        let text = &comment.text;
                        if let Some(m) = REFERENCE_PATH.captures(text) {
                            let path = &m[1];
                            analysis.add_reference(
                                TsReferencePathAssetReference::new(*origin, path.into())
                                    .to_resolved()
                                    .await?,
                            );
                        } else if let Some(m) = REFERENCE_TYPES.captures(text) {
                            let types = &m[1];
                            analysis.add_reference(
                                TsReferenceTypeAssetReference::new(*origin, types.into())
                                    .to_resolved()
                                    .await?,
                            );
                        }
                    }
                }
            }
            anyhow::Ok(())
        }
        .instrument(span)
        .await?;
    }

    if options.extract_source_map {
        let span = tracing::info_span!("source map reference");
        async {
            // Only use the last sourceMappingURL comment by spec
            let mut paths_by_pos = Vec::new();
            for (pos, comments) in comments.trailing.iter() {
                for comment in comments.iter().rev() {
                    lazy_static! {
                        static ref SOURCE_MAP_FILE_REFERENCE: Regex =
                            Regex::new(r"# sourceMappingURL=(.*)$").unwrap();
                    }
                    if let Some(m) = SOURCE_MAP_FILE_REFERENCE.captures(&comment.text) {
                        let path = m.get(1).unwrap().as_str();
                        paths_by_pos.push((pos, path));
                        break;
                    }
                }
            }

            let mut source_map_from_comment = false;
            if let Some((_, path)) = paths_by_pos.into_iter().max_by_key(|&(pos, _)| pos) {
                let origin_path = origin.origin_path();
                if path.ends_with(".map") {
                    let source_map_origin = origin_path.parent().join(path.into());
                    let reference = SourceMapReference::new(origin_path, source_map_origin)
                        .to_resolved()
                        .await?;
                    analysis.add_reference(reference);
                    let source_map = reference.generate_source_map();
                    analysis.set_source_map(source_map.to_resolved().await?);
                    source_map_from_comment = true;
                } else if path.starts_with("data:application/json;base64,") {
                    let source_map = maybe_decode_data_url(path.into());
                    let source_map =
                        resolve_source_map_sources(source_map.as_ref(), origin_path).await?;
                    analysis.set_source_map(ResolvedVc::cell(source_map));
                    source_map_from_comment = true;
                }
            }
            if !source_map_from_comment {
                if let Some(generate_source_map) =
                    ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(source)
                {
                    analysis.set_source_map(
                        generate_source_map
                            .generate_source_map()
                            .to_resolved()
                            .await?,
                    );
                }
            }
            anyhow::Ok(())
        }
        .instrument(span)
        .await?;
    }

    let (emitter, collector) = IssueEmitter::new(source, source_map.clone(), None);
    let handler = Handler::with_emitter(true, false, Box::new(emitter));

    let mut var_graph = {
        let _span = tracing::info_span!("analyze variable values");
        set_handler_and_globals(&handler, globals, || create_graph(program, eval_context))
    };

    let mut evaluation_references = Vec::new();

    let span = tracing::info_span!("esm import references");
    async {
        for (i, r) in eval_context.imports.references().enumerate() {
            let r = EsmAssetReference::new(
                origin,
                Request::parse(Value::new(RcStr::from(&*r.module_path).into()))
                    .to_resolved()
                    .await?,
                r.issue_source
                    .clone()
                    .unwrap_or_else(|| IssueSource::from_source_only(source)),
                Value::new(r.annotations.clone()),
                match options.tree_shaking_mode {
                    Some(TreeShakingMode::ModuleFragments) => match &r.imported_symbol {
                        ImportedSymbol::ModuleEvaluation => {
                            evaluation_references.push(i);
                            Some(ModulePart::evaluation())
                        }
                        ImportedSymbol::Symbol(name) => Some(ModulePart::export((&**name).into())),
                        ImportedSymbol::PartEvaluation(part_id) => {
                            evaluation_references.push(i);
                            Some(ModulePart::internal_evaluation(*part_id))
                        }
                        ImportedSymbol::Part(part_id) => Some(ModulePart::internal(*part_id)),
                        ImportedSymbol::Exports => Some(ModulePart::exports()),
                    },
                    Some(TreeShakingMode::ReexportsOnly) => match &r.imported_symbol {
                        ImportedSymbol::ModuleEvaluation => {
                            evaluation_references.push(i);
                            Some(ModulePart::evaluation())
                        }
                        ImportedSymbol::Symbol(name) => Some(ModulePart::export((&**name).into())),
                        ImportedSymbol::PartEvaluation(_) | ImportedSymbol::Part(_) => {
                            bail!("Internal imports doesn't exist in reexports only mode")
                        }
                        ImportedSymbol::Exports => None,
                    },
                    None => {
                        evaluation_references.push(i);
                        None
                    }
                },
                import_externals,
            )
            .to_resolved()
            .await?;

            import_references.push(r);
        }
        for i in evaluation_references {
            let reference = import_references[i];
            analysis.add_evaluation_reference(reference);
            analysis.add_import_reference(reference);
        }

        anyhow::Ok(())
    }
    .instrument(span)
    .await?;

    let span = tracing::info_span!("exports");
    let (webpack_runtime, webpack_entry, webpack_chunks) = async {
        let (webpack_runtime, webpack_entry, webpack_chunks, esm_exports, esm_star_exports) =
            set_handler_and_globals(&handler, globals, || {
                // TODO migrate to effects
                let mut visitor =
                    ModuleReferencesVisitor::new(eval_context, &import_references, &mut analysis);

                for (i, reexport) in eval_context.imports.reexports() {
                    let import_ref = import_references[i];
                    match reexport {
                        Reexport::Star => {
                            visitor
                                .esm_star_exports
                                .push(ResolvedVc::upcast(import_ref));
                        }
                        Reexport::Namespace { exported: n } => {
                            visitor.esm_exports.insert(
                                n.as_str().into(),
                                EsmExport::ImportedNamespace(ResolvedVc::upcast(import_ref)),
                            );
                        }
                        Reexport::Named {
                            imported: i,
                            exported: e,
                        } => {
                            visitor.esm_exports.insert(
                                e.as_str().into(),
                                EsmExport::ImportedBinding(
                                    ResolvedVc::upcast(import_ref),
                                    i.to_string().into(),
                                    false,
                                ),
                            );
                        }
                    }
                }

                program.visit_with_ast_path(&mut visitor, &mut Default::default());

                (
                    visitor.webpack_runtime,
                    visitor.webpack_entry,
                    visitor.webpack_chunks,
                    visitor.esm_exports,
                    visitor.esm_star_exports,
                )
            });

        for export in esm_exports.values() {
            match *export {
                EsmExport::LocalBinding(..) => {}
                EsmExport::ImportedNamespace(reference) => {
                    analysis.add_reexport_reference(reference);
                    analysis.add_import_reference(reference);
                }
                EsmExport::ImportedBinding(reference, ..) => {
                    analysis.add_reexport_reference(reference);
                    analysis.add_import_reference(reference);
                }
                EsmExport::Error => {}
            }
        }
        for reference in &esm_star_exports {
            analysis.add_reexport_reference(*reference);
            analysis.add_import_reference(*reference);
        }
        let exports = if !esm_exports.is_empty() || !esm_star_exports.is_empty() {
            if specified_type == SpecifiedModuleType::CommonJs {
                SpecifiedModuleTypeIssue {
                    path: source.ident().path().to_resolved().await?,
                    specified_type,
                }
                .resolved_cell()
                .emit();
            }

            let esm_exports = EsmExports {
                exports: esm_exports,
                star_exports: esm_star_exports,
            }
            .cell();

            EcmascriptExports::EsmExports(esm_exports.to_resolved().await?)
        } else if specified_type == SpecifiedModuleType::EcmaScript {
            match detect_dynamic_export(program) {
                DetectedDynamicExportType::CommonJs => {
                    SpecifiedModuleTypeIssue {
                        path: source.ident().path().to_resolved().await?,
                        specified_type,
                    }
                    .resolved_cell()
                    .emit();

                    EcmascriptExports::EsmExports(
                        EsmExports {
                            exports: Default::default(),
                            star_exports: Default::default(),
                        }
                        .resolved_cell(),
                    )
                }
                DetectedDynamicExportType::Namespace => EcmascriptExports::DynamicNamespace,
                DetectedDynamicExportType::Value => EcmascriptExports::Value,
                DetectedDynamicExportType::UsingModuleDeclarations
                | DetectedDynamicExportType::None => EcmascriptExports::EsmExports(
                    EsmExports {
                        exports: Default::default(),
                        star_exports: Default::default(),
                    }
                    .resolved_cell(),
                ),
            }
        } else {
            match detect_dynamic_export(program) {
                DetectedDynamicExportType::CommonJs => EcmascriptExports::CommonJs,
                DetectedDynamicExportType::Namespace => EcmascriptExports::DynamicNamespace,
                DetectedDynamicExportType::Value => EcmascriptExports::Value,
                DetectedDynamicExportType::UsingModuleDeclarations => {
                    EcmascriptExports::EsmExports(
                        EsmExports {
                            exports: Default::default(),
                            star_exports: Default::default(),
                        }
                        .resolved_cell(),
                    )
                }
                DetectedDynamicExportType::None => EcmascriptExports::EmptyCommonJs,
            }
        };
        analysis.set_exports(exports);
        anyhow::Ok((webpack_runtime, webpack_entry, webpack_chunks))
    }
    .instrument(span)
    .await?;

    let mut ignore_effect_span = None;
    // Check if it was a webpack entry
    if let Some((request, webpack_runtime_span)) = webpack_runtime {
        let span = tracing::info_span!("webpack runtime reference");
        async {
            let request = Request::parse(Value::new(request.into()))
                .to_resolved()
                .await?;
            let runtime = resolve_as_webpack_runtime(*origin, *request, *transforms)
                .to_resolved()
                .await?;

            if let WebpackRuntime::Webpack5 { .. } = &*runtime.await? {
                ignore_effect_span = Some(webpack_runtime_span);
                analysis.add_reference(
                    WebpackRuntimeAssetReference {
                        origin,
                        request,
                        runtime,
                        transforms,
                    }
                    .resolved_cell(),
                );

                if webpack_entry {
                    analysis.add_reference(
                        WebpackEntryAssetReference {
                            source,
                            runtime,
                            transforms,
                        }
                        .resolved_cell(),
                    );
                }

                for chunk in webpack_chunks {
                    analysis.add_reference(
                        WebpackChunkAssetReference {
                            chunk_id: chunk,
                            runtime,
                            transforms,
                        }
                        .resolved_cell(),
                    );
                }
            }
            anyhow::Ok(())
        }
        .instrument(span)
        .await?;
    }
    let span = tracing::info_span!("async module handling");
    async {
        let top_level_await_span =
            set_handler_and_globals(&handler, globals, || has_top_level_await(program));
        let has_top_level_await = top_level_await_span.is_some();

        if eval_context.is_esm(specified_type) {
            let async_module = AsyncModule {
                has_top_level_await,
                import_externals,
            }
            .resolved_cell();
            analysis.set_async_module(async_module);
        } else if let Some(span) = top_level_await_span {
            AnalyzeIssue::new(
                IssueSeverity::Error.cell(),
                source.ident(),
                Vc::cell("unexpected top level await".into()),
                StyledString::Text("top level await is only supported in ESM modules.".into())
                    .cell(),
                None,
                Some(issue_source(source, span)),
            )
            .to_resolved()
            .await?
            .emit();
        }
        anyhow::Ok(())
    }
    .instrument(span)
    .await?;

    let span = tracing::info_span!("effects processing");
    async {
        let effects = take(&mut var_graph.effects);

        let mut analysis_state = AnalysisState {
            handler: &handler,
            source,
            origin,
            compile_time_info,
            var_graph: &var_graph,
            fun_args_values: Default::default(),
            var_cache: Default::default(),
            first_import_meta: true,
            tree_shaking_mode: options.tree_shaking_mode,
            import_externals: options.import_externals,
            ignore_dynamic_requests: options.ignore_dynamic_requests,
            url_rewrite_behavior: options.url_rewrite_behavior,
            free_var_references: compile_time_info
                .await?
                .free_var_references
                .individual()
                .await?,
        };

        enum Action {
            Effect(Effect),
            LeaveScope(u32),
        }

        // This is a stack of effects to process. We use a stack since during processing
        // of an effect we might want to add more effects into the middle of the
        // processing. Using a stack where effects are appended in reverse
        // order allows us to do that. It's recursion implemented as Stack.
        let mut queue_stack = Mutex::new(Vec::new());
        queue_stack
            .get_mut()
            .extend(effects.into_iter().map(Action::Effect).rev());

        while let Some(action) = queue_stack.get_mut().pop() {
            let effect = match action {
                Action::LeaveScope(func_ident) => {
                    analysis_state.fun_args_values.get_mut().remove(&func_ident);
                    continue;
                }
                Action::Effect(effect) => effect,
            };

            let add_effects = |effects: Vec<Effect>| {
                queue_stack
                    .lock()
                    .extend(effects.into_iter().map(Action::Effect).rev())
            };

            match effect {
                Effect::Unreachable { start_ast_path } => {
                    analysis.add_code_gen(Unreachable::new(AstPathRange::StartAfter(
                        start_ast_path.to_vec(),
                    )));
                }
                Effect::Conditional {
                    condition,
                    kind,
                    ast_path: condition_ast_path,
                    span: _,
                    in_try: _,
                } => {
                    // Don't replace condition with it's truth-y value, if it has side effects
                    // (e.g. function calls)
                    let condition_has_side_effects = condition.has_side_effects();

                    let condition = analysis_state
                        .link_value(*condition, ImportAttributes::empty_ref())
                        .await?;

                    macro_rules! inactive {
                        ($block:ident) => {
                            analysis.add_code_gen(Unreachable::new($block.range.clone()));
                        };
                    }
                    macro_rules! condition {
                        ($expr:expr) => {
                            if !condition_has_side_effects {
                                analysis.add_code_gen(ConstantConditionCodeGen::new(
                                    $expr,
                                    condition_ast_path.to_vec().into(),
                                ));
                            }
                        };
                    }
                    macro_rules! active {
                        ($block:ident) => {
                            queue_stack
                                .get_mut()
                                .extend($block.effects.into_iter().map(Action::Effect).rev())
                        };
                    }
                    match *kind {
                        ConditionalKind::If { then } => match condition.is_truthy() {
                            Some(true) => {
                                condition!(ConstantConditionValue::Truthy);
                                active!(then);
                            }
                            Some(false) => {
                                condition!(ConstantConditionValue::Falsy);
                                inactive!(then);
                            }
                            None => {
                                active!(then);
                            }
                        },
                        ConditionalKind::Else { r#else } => match condition.is_truthy() {
                            Some(true) => {
                                condition!(ConstantConditionValue::Truthy);
                                inactive!(r#else);
                            }
                            Some(false) => {
                                condition!(ConstantConditionValue::Falsy);
                                active!(r#else);
                            }
                            None => {
                                active!(r#else);
                            }
                        },
                        ConditionalKind::IfElse { then, r#else }
                        | ConditionalKind::Ternary { then, r#else } => {
                            match condition.is_truthy() {
                                Some(true) => {
                                    condition!(ConstantConditionValue::Truthy);
                                    active!(then);
                                    inactive!(r#else);
                                }
                                Some(false) => {
                                    condition!(ConstantConditionValue::Falsy);
                                    active!(r#else);
                                    inactive!(then);
                                }
                                None => {
                                    active!(then);
                                    active!(r#else);
                                }
                            }
                        }
                        ConditionalKind::IfElseMultiple { then, r#else } => {
                            match condition.is_truthy() {
                                Some(true) => {
                                    condition!(ConstantConditionValue::Truthy);
                                    for then in then {
                                        active!(then);
                                    }
                                    for r#else in r#else {
                                        inactive!(r#else);
                                    }
                                }
                                Some(false) => {
                                    condition!(ConstantConditionValue::Falsy);
                                    for then in then {
                                        inactive!(then);
                                    }
                                    for r#else in r#else {
                                        active!(r#else);
                                    }
                                }
                                None => {
                                    for then in then {
                                        active!(then);
                                    }
                                    for r#else in r#else {
                                        active!(r#else);
                                    }
                                }
                            }
                        }
                        ConditionalKind::And { expr } => match condition.is_truthy() {
                            Some(true) => {
                                condition!(ConstantConditionValue::Truthy);
                                active!(expr);
                            }
                            Some(false) => {
                                // The condition value needs to stay since it's used
                                inactive!(expr);
                            }
                            None => {
                                active!(expr);
                            }
                        },
                        ConditionalKind::Or { expr } => match condition.is_truthy() {
                            Some(true) => {
                                // The condition value needs to stay since it's used
                                inactive!(expr);
                            }
                            Some(false) => {
                                condition!(ConstantConditionValue::Falsy);
                                active!(expr);
                            }
                            None => {
                                active!(expr);
                            }
                        },
                        ConditionalKind::NullishCoalescing { expr } => {
                            match condition.is_nullish() {
                                Some(true) => {
                                    condition!(ConstantConditionValue::Nullish);
                                    active!(expr);
                                }
                                Some(false) => {
                                    inactive!(expr);
                                }
                                None => {
                                    active!(expr);
                                }
                            }
                        }
                    }
                }
                Effect::Call {
                    func,
                    args,
                    ast_path,
                    span,
                    in_try,
                    new,
                } => {
                    if let Some(ignored) = &ignore_effect_span {
                        if *ignored == span {
                            continue;
                        }
                    }

                    let func = analysis_state
                        .link_value(*func, eval_context.imports.get_attributes(span))
                        .await?;

                    handle_call(
                        &ast_path,
                        span,
                        func,
                        JsValue::unknown_empty(false, "no this provided"),
                        args,
                        &analysis_state,
                        &add_effects,
                        &mut analysis,
                        in_try,
                        new,
                    )
                    .await?;
                }
                Effect::MemberCall {
                    obj,
                    prop,
                    mut args,
                    ast_path,
                    span,
                    in_try,
                    new,
                } => {
                    if let Some(ignored) = &ignore_effect_span {
                        if *ignored == span {
                            continue;
                        }
                    }
                    let mut obj = analysis_state
                        .link_value(*obj, ImportAttributes::empty_ref())
                        .await?;
                    let prop = analysis_state
                        .link_value(*prop, ImportAttributes::empty_ref())
                        .await?;

                    if !new {
                        if let JsValue::Array {
                            items: ref mut values,
                            mutable,
                            ..
                        } = obj
                        {
                            if matches!(prop.as_str(), Some("map" | "forEach" | "filter")) {
                                if let [EffectArg::Closure(value, block)] = &mut args[..] {
                                    *value = analysis_state
                                        .link_value(take(value), ImportAttributes::empty_ref())
                                        .await?;
                                    if let JsValue::Function(_, func_ident, _) = value {
                                        let mut closure_arg = JsValue::alternatives(take(values));
                                        if mutable {
                                            closure_arg.add_unknown_mutations(true);
                                        }
                                        analysis_state
                                            .fun_args_values
                                            .get_mut()
                                            .insert(*func_ident, vec![closure_arg]);
                                        queue_stack.get_mut().push(Action::LeaveScope(*func_ident));
                                        queue_stack.get_mut().extend(
                                            take(&mut block.effects)
                                                .into_iter()
                                                .map(Action::Effect)
                                                .rev(),
                                        );
                                        continue;
                                    }
                                }
                            }
                        }
                    }

                    let func = analysis_state
                        .link_value(
                            JsValue::member(Box::new(obj.clone()), Box::new(prop)),
                            ImportAttributes::empty_ref(),
                        )
                        .await?;

                    handle_call(
                        &ast_path,
                        span,
                        func,
                        obj,
                        args,
                        &analysis_state,
                        &add_effects,
                        &mut analysis,
                        in_try,
                        new,
                    )
                    .await?;
                }
                Effect::FreeVar {
                    var,
                    ast_path,
                    span,
                    in_try: _,
                } => {
                    // FreeVar("require") might be turbopackIgnore-d
                    if !analysis_state
                        .link_value(*var.clone(), eval_context.imports.get_attributes(span))
                        .await?
                        .is_unknown()
                    {
                        handle_free_var(&ast_path, *var, span, &analysis_state, &mut analysis)
                            .await?;
                    }
                }
                Effect::Member {
                    obj,
                    prop,
                    ast_path,
                    span,
                    in_try: _,
                } => {
                    // Intentionally not awaited because `handle_member` reads this only when neeed.
                    let obj = analysis_state.link_value(*obj, ImportAttributes::empty_ref());

                    let prop = analysis_state
                        .link_value(*prop, ImportAttributes::empty_ref())
                        .await?;

                    handle_member(&ast_path, obj, prop, span, &analysis_state, &mut analysis)
                        .await?;
                }
                Effect::ImportedBinding {
                    esm_reference_index,
                    export,
                    ast_path,
                    span: _,
                    in_try: _,
                } => {
                    if let Some(&r) = import_references.get(esm_reference_index) {
                        if let Some("__turbopack_module_id__") = export.as_deref() {
                            analysis.add_reference(
                                EsmModuleIdAssetReference::new(*r, ast_path.into())
                                    .to_resolved()
                                    .await?,
                            )
                        } else {
                            let r = match options.tree_shaking_mode {
                                Some(TreeShakingMode::ReexportsOnly) => {
                                    let r_ref = r.await?;
                                    if r_ref.export_name.is_none() && export.is_some() {
                                        let export = export.clone().unwrap();
                                        EsmAssetReference::new(
                                            r_ref.origin,
                                            r_ref.request,
                                            r_ref.issue_source.clone(),
                                            Value::new(r_ref.annotations.clone()),
                                            Some(ModulePart::export(export)),
                                            r_ref.import_externals,
                                        )
                                        .to_resolved()
                                        .await?
                                    } else {
                                        r
                                    }
                                }
                                _ => r,
                            };

                            analysis.add_local_reference(r);
                            analysis.add_import_reference(r);
                            analysis.add_code_gen(EsmBinding::new(r, export, ast_path.into()));
                        }
                    }
                }
                Effect::TypeOf {
                    arg,
                    ast_path,
                    span,
                } => {
                    let arg = analysis_state
                        .link_value(*arg, ImportAttributes::empty_ref())
                        .await?;
                    handle_typeof(&ast_path, arg, span, &analysis_state, &mut analysis).await?;
                }
                Effect::ImportMeta {
                    ast_path,
                    span: _,
                    in_try: _,
                } => {
                    if analysis_state.first_import_meta {
                        analysis_state.first_import_meta = false;
                        analysis.add_code_gen(ImportMetaBinding::new(
                            source.ident().path().to_resolved().await?,
                        ));
                    }

                    analysis.add_code_gen(ImportMetaRef::new(ast_path.into()));
                }
            }
        }
        anyhow::Ok(())
    }
    .instrument(span)
    .await?;

    analysis.set_successful(true);

    collector.emit().await?;

    analysis
        .build(matches!(
            options.tree_shaking_mode,
            Some(TreeShakingMode::ReexportsOnly)
        ))
        .await
}

#[turbo_tasks::function]
async fn compile_time_info_for_module_type(
    compile_time_info: Vc<CompileTimeInfo>,
    is_esm: bool,
) -> Result<Vc<CompileTimeInfo>> {
    let compile_time_info = compile_time_info.await?;
    let free_var_references = compile_time_info.free_var_references;

    let mut free_var_references = free_var_references.owned().await?;
    let (typeof_exports, typeof_module, require) = if is_esm {
        ("undefined", "undefined", TURBOPACK_REQUIRE_STUB)
    } else {
        ("object", "object", TURBOPACK_REQUIRE_REAL)
    };
    free_var_references
        .entry(vec![
            DefineableNameSegment::Name("import".into()),
            DefineableNameSegment::Name("meta".into()),
            DefineableNameSegment::TypeOf,
        ])
        .or_insert("object".into());
    free_var_references
        .entry(vec![
            DefineableNameSegment::Name("exports".into()),
            DefineableNameSegment::TypeOf,
        ])
        .or_insert(typeof_exports.into());
    free_var_references
        .entry(vec![
            DefineableNameSegment::Name("module".into()),
            DefineableNameSegment::TypeOf,
        ])
        .or_insert(typeof_module.into());
    free_var_references
        .entry(vec![
            DefineableNameSegment::Name("require".into()),
            DefineableNameSegment::TypeOf,
        ])
        .or_insert("function".into());
    free_var_references
        .entry(vec![DefineableNameSegment::Name("require".into())])
        .or_insert(require.into());

    free_var_references.extend(TUBROPACK_RUNTIME_FUNCTION_SHORTCUTS.into_iter().map(
        |(name, shortcut)| {
            (
                vec![DefineableNameSegment::Name(name.into())],
                shortcut.into(),
            )
        },
    ));

    Ok(CompileTimeInfo {
        environment: compile_time_info.environment,
        defines: compile_time_info.defines,
        free_var_references: FreeVarReferences(free_var_references).resolved_cell(),
    }
    .cell())
}

async fn handle_call<G: Fn(Vec<Effect>) + Send + Sync>(
    ast_path: &[AstParentKind],
    span: Span,
    func: JsValue,
    this: JsValue,
    args: Vec<EffectArg>,
    state: &AnalysisState<'_>,
    add_effects: &G,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
    in_try: bool,
    new: bool,
) -> Result<()> {
    let &AnalysisState {
        handler,
        origin,
        source,
        compile_time_info,
        ignore_dynamic_requests,
        url_rewrite_behavior,
        ..
    } = state;
    fn explain_args(args: &[JsValue]) -> (String, String) {
        JsValue::explain_args(args, 10, 2)
    }
    let linked_args = |args: Vec<EffectArg>| async move {
        args.into_iter()
            .map(|arg| {
                let add_effects = &add_effects;
                async move {
                    let value = match arg {
                        EffectArg::Value(value) => value,
                        EffectArg::Closure(value, block) => {
                            add_effects(block.effects);
                            value
                        }
                        EffectArg::Spread => {
                            JsValue::unknown_empty(true, "spread is not supported yet")
                        }
                    };
                    state.link_value(value, ImportAttributes::empty_ref()).await
                }
            })
            .try_join()
            .await
    };

    if new {
        match func {
            JsValue::WellKnownFunction(WellKnownFunctionKind::URLConstructor) => {
                let args = linked_args(args).await?;
                if let [url, JsValue::Member(
                    _,
                    box JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta),
                    box JsValue::Constant(super::analyzer::ConstantValue::Str(meta_prop)),
                )] = &args[..]
                {
                    if meta_prop.as_str() == "url" {
                        let pat = js_value_to_pattern(url);
                        if !pat.has_constant_parts() {
                            let (args, hints) = explain_args(&args);
                            handler.span_warn_with_code(
                                span,
                                &format!("new URL({args}) is very dynamic{hints}",),
                                DiagnosticId::Lint(
                                    errors::failed_to_analyse::ecmascript::NEW_URL_IMPORT_META
                                        .to_string(),
                                ),
                            );
                            if ignore_dynamic_requests {
                                return Ok(());
                            }
                        }
                        analysis.add_reference(
                            UrlAssetReference::new(
                                *origin,
                                Request::parse(Value::new(pat)),
                                compile_time_info.environment().rendering(),
                                ast_path.to_vec().into(),
                                issue_source(source, span),
                                in_try,
                                url_rewrite_behavior.unwrap_or(UrlRewriteBehavior::Relative),
                            )
                            .to_resolved()
                            .await?,
                        );
                    }
                }
                return Ok(());
            }
            JsValue::WellKnownFunction(WellKnownFunctionKind::WorkerConstructor) => {
                let args = linked_args(args).await?;
                if let Some(url @ JsValue::Url(_, JsValueUrlKind::Relative)) = args.first() {
                    let pat = js_value_to_pattern(url);
                    if !pat.has_constant_parts() {
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!("new Worker({args}) is very dynamic{hints}",),
                            DiagnosticId::Lint(
                                errors::failed_to_analyse::ecmascript::NEW_WORKER.to_string(),
                            ),
                        );
                        if ignore_dynamic_requests {
                            return Ok(());
                        }
                    }

                    if *compile_time_info.environment().rendering().await? == Rendering::Client {
                        analysis.add_reference(
                            WorkerAssetReference::new(
                                *origin,
                                Request::parse(Value::new(pat)),
                                ast_path.to_vec().into(),
                                issue_source(source, span),
                                in_try,
                            )
                            .to_resolved()
                            .await?,
                        );
                    }

                    return Ok(());
                }
                let (args, hints) = explain_args(&args);
                handler.span_warn_with_code(
                    span,
                    &format!("new Worker({args}) is not statically analyse-able{hints}",),
                    DiagnosticId::Error(
                        errors::failed_to_analyse::ecmascript::DYNAMIC_IMPORT.to_string(),
                    ),
                );
                return Ok(());
            }
            _ => {}
        }

        for arg in args {
            if let EffectArg::Closure(_, block) = arg {
                add_effects(block.effects);
            }
        }
        return Ok(());
    }

    match func {
        JsValue::Alternatives {
            total_nodes: _,
            values,
            logical_property: _,
        } => {
            for alt in values {
                Box::pin(handle_call(
                    ast_path,
                    span,
                    alt,
                    this.clone(),
                    args.clone(),
                    state,
                    add_effects,
                    analysis,
                    in_try,
                    new,
                ))
                .await?;
            }
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::Import) => {
            let args = linked_args(args).await?;
            if args.len() == 1 || args.len() == 2 {
                let pat = js_value_to_pattern(&args[0]);
                let options = args.get(1);
                let import_annotations = options
                    .and_then(|options| {
                        if let JsValue::Object { parts, .. } = options {
                            parts.iter().find_map(|part| {
                                if let ObjectPart::KeyValue(
                                    JsValue::Constant(super::analyzer::ConstantValue::Str(key)),
                                    value,
                                ) = part
                                {
                                    if key.as_str() == "with" {
                                        return Some(value);
                                    }
                                }
                                None
                            })
                        } else {
                            None
                        }
                    })
                    .and_then(ImportAnnotations::parse_dynamic)
                    .unwrap_or_default();
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(&args);
                    handler.span_warn_with_code(
                        span,
                        &format!("import({args}) is very dynamic{hints}",),
                        DiagnosticId::Lint(
                            errors::failed_to_analyse::ecmascript::DYNAMIC_IMPORT.to_string(),
                        ),
                    );
                    if ignore_dynamic_requests {
                        analysis
                            .add_code_gen(DynamicExpression::new_promise(ast_path.to_vec().into()));
                        return Ok(());
                    }
                }
                analysis.add_reference(
                    EsmAsyncAssetReference::new(
                        *origin,
                        Request::parse(Value::new(pat)),
                        ast_path.to_vec().into(),
                        issue_source(source, span),
                        Value::new(import_annotations),
                        in_try,
                        state.import_externals,
                    )
                    .to_resolved()
                    .await?,
                );
                return Ok(());
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!("import({args}) is not statically analyse-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyse::ecmascript::DYNAMIC_IMPORT.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::Require) => {
            let args = linked_args(args).await?;
            if args.len() == 1 {
                let pat = js_value_to_pattern(&args[0]);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(&args);
                    handler.span_warn_with_code(
                        span,
                        &format!("require({args}) is very dynamic{hints}",),
                        DiagnosticId::Lint(
                            errors::failed_to_analyse::ecmascript::REQUIRE.to_string(),
                        ),
                    );
                    if ignore_dynamic_requests {
                        analysis.add_code_gen(DynamicExpression::new(ast_path.to_vec().into()));
                        return Ok(());
                    }
                }
                analysis.add_reference(
                    CjsRequireAssetReference::new(
                        *origin,
                        Request::parse(Value::new(pat)),
                        ast_path.to_vec().into(),
                        issue_source(source, span),
                        in_try,
                    )
                    .to_resolved()
                    .await?,
                );
                return Ok(());
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!("require({args}) is not statically analyse-able{hints}",),
                DiagnosticId::Error(errors::failed_to_analyse::ecmascript::REQUIRE.to_string()),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::Define) => {
            analyze_amd_define(
                source,
                analysis,
                origin,
                handler,
                span,
                ast_path,
                linked_args(args).await?,
                in_try,
            )
            .await?;
        }

        JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve) => {
            let args = linked_args(args).await?;
            if args.len() == 1 || args.len() == 2 {
                // TODO error TP1003 require.resolve(???*0*, {"paths": [???*1*]}) is not statically
                // analyse-able with ignore_dynamic_requests = true
                let pat = js_value_to_pattern(&args[0]);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(&args);
                    handler.span_warn_with_code(
                        span,
                        &format!("require.resolve({args}) is very dynamic{hints}",),
                        DiagnosticId::Lint(
                            errors::failed_to_analyse::ecmascript::REQUIRE_RESOLVE.to_string(),
                        ),
                    );
                    if ignore_dynamic_requests {
                        analysis.add_code_gen(DynamicExpression::new(ast_path.to_vec().into()));
                        return Ok(());
                    }
                }
                analysis.add_reference(
                    CjsRequireResolveAssetReference::new(
                        *origin,
                        Request::parse(Value::new(pat)),
                        ast_path.to_vec().into(),
                        issue_source(source, span),
                        in_try,
                    )
                    .to_resolved()
                    .await?,
                );
                return Ok(());
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!("require.resolve({args}) is not statically analyse-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyse::ecmascript::REQUIRE_RESOLVE.to_string(),
                ),
            )
        }

        JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContext) => {
            let args = linked_args(args).await?;
            let options = match parse_require_context(&args) {
                Ok(options) => options,
                Err(err) => {
                    let (args, hints) = explain_args(&args);
                    handler.span_err_with_code(
                        span,
                        &format!(
                            "require.context({args}) is not statically analyze-able: {}{hints}",
                            PrettyPrintError(&err)
                        ),
                        DiagnosticId::Error(
                            errors::failed_to_analyse::ecmascript::REQUIRE_CONTEXT.to_string(),
                        ),
                    );
                    return Ok(());
                }
            };

            analysis.add_reference(
                RequireContextAssetReference::new(
                    *source,
                    *origin,
                    options.dir,
                    options.include_subdirs,
                    Vc::cell(options.filter),
                    ast_path.to_vec().into(),
                    Some(issue_source(source, span)),
                    in_try,
                )
                .to_resolved()
                .await?,
            );
        }

        JsValue::WellKnownFunction(WellKnownFunctionKind::FsReadMethod(name)) => {
            let args = linked_args(args).await?;
            if !args.is_empty() {
                let pat = js_value_to_pattern(&args[0]);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(&args);
                    handler.span_warn_with_code(
                        span,
                        &format!("fs.{name}({args}) is very dynamic{hints}",),
                        DiagnosticId::Lint(
                            errors::failed_to_analyse::ecmascript::FS_METHOD.to_string(),
                        ),
                    );
                    if ignore_dynamic_requests {
                        return Ok(());
                    }
                }
                analysis.add_reference(
                    FileSourceReference::new(*source, Pattern::new(pat))
                        .to_resolved()
                        .await?,
                );
                return Ok(());
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!("fs.{name}({args}) is not statically analyse-able{hints}",),
                DiagnosticId::Error(errors::failed_to_analyse::ecmascript::FS_METHOD.to_string()),
            )
        }

        JsValue::WellKnownFunction(WellKnownFunctionKind::PathResolve(..)) => {
            let parent_path = origin.origin_path().parent().await?;
            let args = linked_args(args).await?;

            let linked_func_call = state
                .link_value(
                    JsValue::call(
                        Box::new(JsValue::WellKnownFunction(
                            WellKnownFunctionKind::PathResolve(Box::new(
                                parent_path.path.as_str().into(),
                            )),
                        )),
                        args.clone(),
                    ),
                    ImportAttributes::empty_ref(),
                )
                .await?;

            let pat = js_value_to_pattern(&linked_func_call);
            if !pat.has_constant_parts() {
                let (args, hints) = explain_args(&args);
                handler.span_warn_with_code(
                    span,
                    &format!("path.resolve({args}) is very dynamic{hints}",),
                    DiagnosticId::Lint(
                        errors::failed_to_analyse::ecmascript::PATH_METHOD.to_string(),
                    ),
                );
                if ignore_dynamic_requests {
                    return Ok(());
                }
            }
            analysis.add_reference(
                FileSourceReference::new(*source, Pattern::new(pat))
                    .to_resolved()
                    .await?,
            );
            return Ok(());
        }

        JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin) => {
            let context_path = source.ident().path().await?;
            // ignore path.join in `node-gyp`, it will includes too many files
            if context_path.path.contains("node_modules/node-gyp") {
                return Ok(());
            }
            let args = linked_args(args).await?;
            let linked_func_call = state
                .link_value(
                    JsValue::call(
                        Box::new(JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin)),
                        args.clone(),
                    ),
                    ImportAttributes::empty_ref(),
                )
                .await?;
            let pat = js_value_to_pattern(&linked_func_call);
            if !pat.has_constant_parts() {
                let (args, hints) = explain_args(&args);
                handler.span_warn_with_code(
                    span,
                    &format!("path.join({args}) is very dynamic{hints}",),
                    DiagnosticId::Lint(
                        errors::failed_to_analyse::ecmascript::PATH_METHOD.to_string(),
                    ),
                );
                if ignore_dynamic_requests {
                    return Ok(());
                }
            }
            analysis.add_reference(
                DirAssetReference::new(*source, Pattern::new(pat))
                    .to_resolved()
                    .await?,
            );
            return Ok(());
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::ChildProcessSpawnMethod(name)) => {
            let args = linked_args(args).await?;

            // Is this specifically `spawn(process.argv[0], ['-e', ...])`?
            if is_invoking_node_process_eval(&args) {
                return Ok(());
            }

            if !args.is_empty() {
                let mut show_dynamic_warning = false;
                let pat = js_value_to_pattern(&args[0]);
                if pat.is_match_ignore_dynamic("node") && args.len() >= 2 {
                    let first_arg =
                        JsValue::member(Box::new(args[1].clone()), Box::new(0_f64.into()));
                    let first_arg = state
                        .link_value(first_arg, ImportAttributes::empty_ref())
                        .await?;
                    let pat = js_value_to_pattern(&first_arg);
                    let dynamic = !pat.has_constant_parts();
                    if dynamic {
                        show_dynamic_warning = true;
                    }
                    if !dynamic || !ignore_dynamic_requests {
                        analysis.add_reference(
                            CjsAssetReference::new(
                                *origin,
                                Request::parse(Value::new(pat)),
                                issue_source(source, span),
                                in_try,
                            )
                            .to_resolved()
                            .await?,
                        );
                    }
                }
                let dynamic = !pat.has_constant_parts();
                if dynamic {
                    show_dynamic_warning = true;
                }
                if !dynamic || !ignore_dynamic_requests {
                    analysis.add_reference(
                        FileSourceReference::new(*source, Pattern::new(pat))
                            .to_resolved()
                            .await?,
                    );
                }
                if show_dynamic_warning {
                    let (args, hints) = explain_args(&args);
                    handler.span_warn_with_code(
                        span,
                        &format!("child_process.{name}({args}) is very dynamic{hints}",),
                        DiagnosticId::Lint(
                            errors::failed_to_analyse::ecmascript::CHILD_PROCESS_SPAWN.to_string(),
                        ),
                    );
                }
                return Ok(());
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!("child_process.{name}({args}) is not statically analyse-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyse::ecmascript::CHILD_PROCESS_SPAWN.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::ChildProcessFork) => {
            let args = linked_args(args).await?;
            if !args.is_empty() {
                let first_arg = &args[0];
                let pat = js_value_to_pattern(first_arg);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(&args);
                    handler.span_warn_with_code(
                        span,
                        &format!("child_process.fork({args}) is very dynamic{hints}",),
                        DiagnosticId::Lint(
                            errors::failed_to_analyse::ecmascript::CHILD_PROCESS_SPAWN.to_string(),
                        ),
                    );
                    if ignore_dynamic_requests {
                        return Ok(());
                    }
                }
                analysis.add_reference(
                    CjsAssetReference::new(
                        *origin,
                        Request::parse(Value::new(pat)),
                        issue_source(source, span),
                        in_try,
                    )
                    .to_resolved()
                    .await?,
                );
                return Ok(());
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!("child_process.fork({args}) is not statically analyse-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyse::ecmascript::CHILD_PROCESS_SPAWN.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::NodePreGypFind) => {
            use turbopack_resolve::node_native_binding::NodePreGypConfigReference;

            let args = linked_args(args).await?;
            if args.len() == 1 {
                let first_arg = &args[0];
                let pat = js_value_to_pattern(first_arg);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(&args);
                    handler.span_warn_with_code(
                        span,
                        &format!("node-pre-gyp.find({args}) is very dynamic{hints}",),
                        DiagnosticId::Lint(
                            errors::failed_to_analyse::ecmascript::NODE_PRE_GYP_FIND.to_string(),
                        ),
                    );
                    // Always ignore this dynamic request
                    return Ok(());
                }
                analysis.add_reference(
                    NodePreGypConfigReference::new(
                        origin.origin_path().parent(),
                        Pattern::new(pat),
                        compile_time_info.environment().compile_target(),
                    )
                    .to_resolved()
                    .await?,
                );
                return Ok(());
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!(
                    "require('@mapbox/node-pre-gyp').find({args}) is not statically \
                     analyse-able{hints}",
                ),
                DiagnosticId::Error(
                    errors::failed_to_analyse::ecmascript::NODE_PRE_GYP_FIND.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeGypBuild) => {
            use turbopack_resolve::node_native_binding::NodeGypBuildReference;

            let args = linked_args(args).await?;
            if args.len() == 1 {
                let first_arg = state
                    .link_value(args[0].clone(), ImportAttributes::empty_ref())
                    .await?;
                if let Some(s) = first_arg.as_str() {
                    // TODO this resolving should happen within Vc<NodeGypBuildReference>
                    let current_context = origin
                        .origin_path()
                        .root()
                        .join(s.trim_start_matches("/ROOT/").into());
                    analysis.add_reference(
                        NodeGypBuildReference::new(
                            current_context,
                            compile_time_info.environment().compile_target(),
                        )
                        .to_resolved()
                        .await?,
                    );
                    return Ok(());
                }
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!(
                    "require('node-gyp-build')({args}) is not statically analyse-able{hints}",
                ),
                DiagnosticId::Error(
                    errors::failed_to_analyse::ecmascript::NODE_GYP_BUILD.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeBindings) => {
            use turbopack_resolve::node_native_binding::NodeBindingsReference;

            let args = linked_args(args).await?;
            if args.len() == 1 {
                let first_arg = state
                    .link_value(args[0].clone(), ImportAttributes::empty_ref())
                    .await?;
                if let Some(s) = first_arg.as_str() {
                    analysis.add_reference(
                        NodeBindingsReference::new(origin.origin_path(), s.into())
                            .to_resolved()
                            .await?,
                    );
                    return Ok(());
                }
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!("require('bindings')({args}) is not statically analyse-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyse::ecmascript::NODE_BINDINGS.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeExpressSet) => {
            let args = linked_args(args).await?;
            if args.len() == 2 {
                if let Some(s) = args.first().and_then(|arg| arg.as_str()) {
                    let pkg_or_dir = args.get(1).unwrap();
                    let pat = js_value_to_pattern(pkg_or_dir);
                    if !pat.has_constant_parts() {
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!("require('express')().set({args}) is very dynamic{hints}",),
                            DiagnosticId::Lint(
                                errors::failed_to_analyse::ecmascript::NODE_EXPRESS.to_string(),
                            ),
                        );
                        // Always ignore this dynamic request
                        return Ok(());
                    }
                    match s {
                        "views" => {
                            if let Pattern::Constant(p) = &pat {
                                let abs_pattern = if p.starts_with("/ROOT/") {
                                    pat
                                } else {
                                    let linked_func_call = state
                                        .link_value(
                                            JsValue::call(
                                                Box::new(JsValue::WellKnownFunction(
                                                    WellKnownFunctionKind::PathJoin,
                                                )),
                                                vec![
                                                    JsValue::FreeVar("__dirname".into()),
                                                    pkg_or_dir.clone(),
                                                ],
                                            ),
                                            ImportAttributes::empty_ref(),
                                        )
                                        .await?;
                                    js_value_to_pattern(&linked_func_call)
                                };
                                analysis.add_reference(
                                    DirAssetReference::new(*source, Pattern::new(abs_pattern))
                                        .to_resolved()
                                        .await?,
                                );
                                return Ok(());
                            }
                        }
                        "view engine" => {
                            if let Some(pkg) = pkg_or_dir.as_str() {
                                if pkg != "html" {
                                    let pat = js_value_to_pattern(pkg_or_dir);
                                    analysis.add_reference(
                                        CjsAssetReference::new(
                                            *origin,
                                            Request::parse(Value::new(pat)),
                                            issue_source(source, span),
                                            in_try,
                                        )
                                        .to_resolved()
                                        .await?,
                                    );
                                }
                                return Ok(());
                            }
                        }
                        _ => {}
                    }
                }
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!("require('express')().set({args}) is not statically analyse-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyse::ecmascript::NODE_EXPRESS.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeStrongGlobalizeSetRootDir) => {
            let args = linked_args(args).await?;
            if let Some(p) = args.first().and_then(|arg| arg.as_str()) {
                let abs_pattern = if p.starts_with("/ROOT/") {
                    Pattern::Constant(format!("{p}/intl").into())
                } else {
                    let linked_func_call = state
                        .link_value(
                            JsValue::call(
                                Box::new(JsValue::WellKnownFunction(
                                    WellKnownFunctionKind::PathJoin,
                                )),
                                vec![
                                    JsValue::FreeVar("__dirname".into()),
                                    p.into(),
                                    "intl".into(),
                                ],
                            ),
                            ImportAttributes::empty_ref(),
                        )
                        .await?;
                    js_value_to_pattern(&linked_func_call)
                };
                analysis.add_reference(
                    DirAssetReference::new(*source, Pattern::new(abs_pattern))
                        .to_resolved()
                        .await?,
                );
                return Ok(());
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!(
                    "require('strong-globalize').SetRootDir({args}) is not statically \
                     analyse-able{hints}",
                ),
                DiagnosticId::Error(
                    errors::failed_to_analyse::ecmascript::NODE_GYP_BUILD.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeResolveFrom) => {
            let args = linked_args(args).await?;
            if args.len() == 2 && args.get(1).and_then(|arg| arg.as_str()).is_some() {
                analysis.add_reference(
                    CjsAssetReference::new(
                        *origin,
                        Request::parse(Value::new(js_value_to_pattern(&args[1]))),
                        issue_source(source, span),
                        in_try,
                    )
                    .to_resolved()
                    .await?,
                );
                return Ok(());
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!("require('resolve-from')({args}) is not statically analyse-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyse::ecmascript::NODE_RESOLVE_FROM.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeProtobufLoad) => {
            let args = linked_args(args).await?;
            if args.len() == 2 {
                if let Some(JsValue::Object { parts, .. }) = args.get(1) {
                    let resolved_dirs = parts
                        .iter()
                        .filter_map(|object_part| match object_part {
                            ObjectPart::KeyValue(
                                JsValue::Constant(key),
                                JsValue::Array { items: dirs, .. },
                            ) if key.as_str() == Some("includeDirs") => {
                                Some(dirs.iter().filter_map(|dir| dir.as_str()))
                            }
                            _ => None,
                        })
                        .flatten()
                        .map(|dir| {
                            DirAssetReference::new(
                                *source,
                                Pattern::new(Pattern::Constant(dir.into())),
                            )
                            .to_resolved()
                        })
                        .try_join()
                        .await?;

                    for resolved_dir_ref in resolved_dirs {
                        analysis.add_reference(resolved_dir_ref);
                    }

                    return Ok(());
                }
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!(
                    "require('@grpc/proto-loader').load({args}) is not statically \
                     analyse-able{hints}",
                ),
                DiagnosticId::Error(
                    errors::failed_to_analyse::ecmascript::NODE_PROTOBUF_LOADER.to_string(),
                ),
            )
        }
        _ => {
            for arg in args {
                if let EffectArg::Closure(_, block) = arg {
                    add_effects(block.effects);
                }
            }
        }
    }
    Ok(())
}

async fn handle_member(
    ast_path: &[AstParentKind],
    link_obj: impl Future<Output = Result<JsValue>> + Send + Sync,
    prop: JsValue,
    span: Span,
    state: &AnalysisState<'_>,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
) -> Result<()> {
    if let Some(prop) = prop.as_str() {
        let prop_seg = DefineableNameSegment::Name(prop.into());

        let references = state.free_var_references.get(&prop_seg);
        let is_prop_cache = prop == "cache";

        // This isn't pretty, but we cannot await the future twice in the two branches below.
        let obj = if references.is_some() || is_prop_cache {
            Some(link_obj.await?)
        } else {
            None
        };

        if let Some(references) = references {
            let obj = obj.as_ref().unwrap();
            if let Some(def_name_len) = obj.get_defineable_name_len() {
                for (name, value) in references {
                    if name.len() != def_name_len {
                        continue;
                    }

                    let it = name.iter().map(Cow::Borrowed).rev();
                    if it.eq(obj.iter_defineable_name_rev())
                        && handle_free_var_reference(
                            ast_path,
                            &*value.await?,
                            span,
                            state,
                            analysis,
                        )
                        .await?
                    {
                        return Ok(());
                    }
                }
            }
        }

        if is_prop_cache {
            if let JsValue::WellKnownFunction(WellKnownFunctionKind::Require { .. }) =
                obj.as_ref().unwrap()
            {
                analysis.add_code_gen(CjsRequireCacheAccess::new(ast_path.to_vec().into()));
            }
        }
    }

    Ok(())
}

async fn handle_typeof(
    ast_path: &[AstParentKind],
    arg: JsValue,
    span: Span,
    state: &AnalysisState<'_>,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
) -> Result<()> {
    if let Some(value) = arg.match_free_var_reference(
        Some(state.var_graph),
        &*state
            .compile_time_info
            .await?
            .free_var_references
            .individual()
            .await?,
        &DefineableNameSegment::TypeOf,
    ) {
        handle_free_var_reference(ast_path, &*value.await?, span, state, analysis).await?;
    }

    Ok(())
}

async fn handle_free_var(
    ast_path: &[AstParentKind],
    var: JsValue,
    span: Span,
    state: &AnalysisState<'_>,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
) -> Result<()> {
    if let Some(def_name_len) = var.get_defineable_name_len() {
        let first = var.iter_defineable_name_rev().next().unwrap();
        if let Some(references) = state.free_var_references.get(&*first) {
            for (name, value) in references {
                if name.len() + 1 != def_name_len {
                    continue;
                }

                let it = name.iter().map(Cow::Borrowed).rev();
                if it.eq(var.iter_defineable_name_rev().skip(1)) {
                    handle_free_var_reference(ast_path, &*value.await?, span, state, analysis)
                        .await?;
                    return Ok(());
                }
            }
        }
    }

    Ok(())
}

async fn handle_free_var_reference(
    ast_path: &[AstParentKind],
    value: &FreeVarReference,
    span: Span,
    state: &AnalysisState<'_>,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
) -> Result<bool> {
    // We don't want to replace assignments as this would lead to invalid code.
    if matches!(
        ast_path,
        [
            ..,
            AstParentKind::AssignExpr(AssignExprField::Left),
            AstParentKind::AssignTarget(AssignTargetField::Simple),
            AstParentKind::SimpleAssignTarget(SimpleAssignTargetField::Member),
        ]
    ) {
        return Ok(false);
    }

    match value {
        FreeVarReference::Error(error_message) => state.handler.span_err_with_code(
            span,
            error_message,
            DiagnosticId::Error(
                errors::failed_to_analyse::ecmascript::FREE_VAR_REFERENCE.to_string(),
            ),
        ),

        FreeVarReference::Value(value) => {
            analysis.add_code_gen(ConstantValueCodeGen::new(
                Value::new(value.clone()),
                ast_path.to_vec().into(),
            ));
        }
        FreeVarReference::Ident(value) => {
            analysis.add_code_gen(IdentReplacement::new(
                value.clone(),
                ast_path.to_vec().into(),
            ));
        }
        FreeVarReference::Member(key, value) => {
            analysis.add_code_gen(MemberReplacement::new(
                key.clone(),
                value.clone(),
                ast_path.to_vec().into(),
            ));
        }
        FreeVarReference::EcmaScriptModule {
            request,
            lookup_path,
            export,
        } => {
            let esm_reference = EsmAssetReference::new(
                if let Some(lookup_path) = lookup_path {
                    ResolvedVc::upcast(
                        PlainResolveOrigin::new(state.origin.asset_context(), **lookup_path)
                            .to_resolved()
                            .await?,
                    )
                } else {
                    state.origin
                },
                Request::parse(Value::new(request.clone().into()))
                    .to_resolved()
                    .await?,
                IssueSource::from_swc_offsets(state.source, span.lo.to_u32(), span.hi.to_u32()),
                Default::default(),
                match state.tree_shaking_mode {
                    Some(TreeShakingMode::ModuleFragments)
                    | Some(TreeShakingMode::ReexportsOnly) => {
                        export.clone().map(ModulePart::export)
                    }
                    None => None,
                },
                state.import_externals,
            )
            .to_resolved()
            .await?;
            analysis.add_reference(esm_reference);
            analysis.add_code_gen(EsmBinding::new(
                esm_reference,
                export.clone(),
                ast_path.to_vec().into(),
            ));
        }
    }
    Ok(true)
}

fn issue_source(source: ResolvedVc<Box<dyn Source>>, span: Span) -> IssueSource {
    IssueSource::from_swc_offsets(source, span.lo.to_u32(), span.hi.to_u32())
}

async fn analyze_amd_define(
    source: ResolvedVc<Box<dyn Source>>,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    handler: &Handler,
    span: Span,
    ast_path: &[AstParentKind],
    args: Vec<JsValue>,
    in_try: bool,
) -> Result<()> {
    match &args[..] {
        [JsValue::Constant(id), JsValue::Array { items: deps, .. }, _] if id.as_str().is_some() => {
            analyze_amd_define_with_deps(
                source,
                analysis,
                origin,
                handler,
                span,
                ast_path,
                id.as_str(),
                deps,
                in_try,
            )
            .await?;
        }
        [JsValue::Array { items: deps, .. }, _] => {
            analyze_amd_define_with_deps(
                source, analysis, origin, handler, span, ast_path, None, deps, in_try,
            )
            .await?;
        }
        [JsValue::Constant(id), JsValue::Function(..)] if id.as_str().is_some() => {
            analysis.add_code_gen(AmdDefineWithDependenciesCodeGen::new(
                vec![
                    AmdDefineDependencyElement::Require,
                    AmdDefineDependencyElement::Exports,
                    AmdDefineDependencyElement::Module,
                ],
                origin,
                ast_path.to_vec().into(),
                AmdDefineFactoryType::Function,
                issue_source(source, span),
                in_try,
            ));
        }
        [JsValue::Constant(id), _] if id.as_str().is_some() => {
            analysis.add_code_gen(AmdDefineWithDependenciesCodeGen::new(
                vec![
                    AmdDefineDependencyElement::Require,
                    AmdDefineDependencyElement::Exports,
                    AmdDefineDependencyElement::Module,
                ],
                origin,
                ast_path.to_vec().into(),
                AmdDefineFactoryType::Unknown,
                issue_source(source, span),
                in_try,
            ));
        }
        [JsValue::Function(..)] => {
            analysis.add_code_gen(AmdDefineWithDependenciesCodeGen::new(
                vec![
                    AmdDefineDependencyElement::Require,
                    AmdDefineDependencyElement::Exports,
                    AmdDefineDependencyElement::Module,
                ],
                origin,
                ast_path.to_vec().into(),
                AmdDefineFactoryType::Function,
                issue_source(source, span),
                in_try,
            ));
        }
        [JsValue::Object { .. }] => {
            analysis.add_code_gen(AmdDefineWithDependenciesCodeGen::new(
                vec![],
                origin,
                ast_path.to_vec().into(),
                AmdDefineFactoryType::Value,
                issue_source(source, span),
                in_try,
            ));
        }
        [_] => {
            analysis.add_code_gen(AmdDefineWithDependenciesCodeGen::new(
                vec![
                    AmdDefineDependencyElement::Require,
                    AmdDefineDependencyElement::Exports,
                    AmdDefineDependencyElement::Module,
                ],
                origin,
                ast_path.to_vec().into(),
                AmdDefineFactoryType::Unknown,
                issue_source(source, span),
                in_try,
            ));
        }
        _ => {
            handler.span_err_with_code(
                span,
                "unsupported AMD define() form",
                DiagnosticId::Error(errors::failed_to_analyse::ecmascript::AMD_DEFINE.to_string()),
            );
        }
    }

    Ok(())
}

async fn analyze_amd_define_with_deps(
    source: ResolvedVc<Box<dyn Source>>,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    handler: &Handler,
    span: Span,
    ast_path: &[AstParentKind],
    id: Option<&str>,
    deps: &[JsValue],
    in_try: bool,
) -> Result<()> {
    let mut requests = Vec::new();
    for dep in deps {
        if let Some(dep) = dep.as_str() {
            match dep {
                "exports" => {
                    requests.push(AmdDefineDependencyElement::Exports);
                }
                "require" => {
                    handler.span_warn_with_code(
                        span,
                        "using \"require\" as dependency in an AMD define() is not yet supported",
                        DiagnosticId::Error(
                            errors::failed_to_analyse::ecmascript::AMD_DEFINE.to_string(),
                        ),
                    );
                    requests.push(AmdDefineDependencyElement::Require);
                }
                "module" => {
                    requests.push(AmdDefineDependencyElement::Module);
                }
                _ => {
                    let request = Request::parse_string(dep.into()).to_resolved().await?;
                    let reference = AmdDefineAssetReference::new(
                        *origin,
                        *request,
                        issue_source(source, span),
                        in_try,
                    )
                    .to_resolved()
                    .await?;
                    requests.push(AmdDefineDependencyElement::Request {
                        request,
                        request_str: dep.to_string(),
                    });
                    analysis.add_reference(reference);
                }
            }
        } else {
            handler.span_err_with_code(
                // TODO(alexkirsz) It'd be best to highlight the argument's span, but
                // `JsValue`s do not keep a hold of their original span.
                span,
                "unsupported AMD define() dependency element form",
                DiagnosticId::Error(errors::failed_to_analyse::ecmascript::AMD_DEFINE.to_string()),
            );
        }
    }

    if id.is_some() {
        handler.span_warn_with_code(
            span,
            "passing an ID to AMD define() is not yet fully supported",
            DiagnosticId::Lint(errors::failed_to_analyse::ecmascript::AMD_DEFINE.to_string()),
        );
    }

    analysis.add_code_gen(AmdDefineWithDependenciesCodeGen::new(
        requests,
        origin,
        ast_path.to_vec().into(),
        AmdDefineFactoryType::Function,
        issue_source(source, span),
        in_try,
    ));

    Ok(())
}

/// Used to generate the "root" path to a __filename/__dirname/import.meta.url
/// reference.
pub async fn as_abs_path(path: Vc<FileSystemPath>) -> Result<JsValue> {
    // TODO: This should be updated to generate a real system path on the fly
    // during runtime, so that the generated code is constant between systems
    // but the runtime evaluation can take into account the project's
    // actual root directory.
    require_resolve(path).await
}

/// Generates an absolute path usable for `require.resolve()` calls.
async fn require_resolve(path: Vc<FileSystemPath>) -> Result<JsValue> {
    Ok(format!("/ROOT/{}", path.await?.path.as_str()).into())
}

async fn early_value_visitor(mut v: JsValue) -> Result<(JsValue, bool)> {
    let modified = early_replace_builtin(&mut v);
    Ok((v, modified))
}

async fn value_visitor(
    origin: Vc<Box<dyn ResolveOrigin>>,
    v: JsValue,
    compile_time_info: Vc<CompileTimeInfo>,
    free_var_references: &FxIndexMap<
        DefineableNameSegment,
        FxIndexMap<Vec<DefineableNameSegment>, ResolvedVc<FreeVarReference>>,
    >,
    var_graph: &VarGraph,
    attributes: &ImportAttributes,
) -> Result<(JsValue, bool)> {
    let (mut v, modified) = value_visitor_inner(
        origin,
        v,
        compile_time_info,
        free_var_references,
        var_graph,
        attributes,
    )
    .await?;
    v.normalize_shallow();
    Ok((v, modified))
}

async fn value_visitor_inner(
    origin: Vc<Box<dyn ResolveOrigin>>,
    v: JsValue,
    compile_time_info: Vc<CompileTimeInfo>,
    free_var_references: &FxIndexMap<
        DefineableNameSegment,
        FxIndexMap<Vec<DefineableNameSegment>, ResolvedVc<FreeVarReference>>,
    >,
    var_graph: &VarGraph,
    attributes: &ImportAttributes,
) -> Result<(JsValue, bool)> {
    let ImportAttributes { ignore, .. } = *attributes;
    // This check is just an optimization
    if v.get_defineable_name_len().is_some() {
        let compile_time_info = compile_time_info.await?;
        if let JsValue::TypeOf(_, arg) = &v {
            if let Some(value) = arg.match_free_var_reference(
                Some(var_graph),
                free_var_references,
                &DefineableNameSegment::TypeOf,
            ) {
                return Ok(((&*value.await?).into(), true));
            }
        }

        if let Some(value) = v.match_define(&*compile_time_info.defines.individual().await?) {
            return Ok(((&*value.await?).into(), true));
        }
    }
    let value = match v {
        JsValue::Call(
            _,
            box JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve),
            args,
        ) => require_resolve_visitor(origin, args).await?,
        JsValue::Call(
            _,
            box JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContext),
            args,
        ) => require_context_visitor(origin, args).await?,
        JsValue::Call(
            _,
            box JsValue::WellKnownFunction(
                WellKnownFunctionKind::RequireContextRequire(..)
                | WellKnownFunctionKind::RequireContextRequireKeys(..)
                | WellKnownFunctionKind::RequireContextRequireResolve(..),
            ),
            _,
        ) => {
            // TODO: figure out how to do static analysis without invalidating the while
            // analysis when a new file gets added
            v.into_unknown(
                true,
                "require.context() static analysis is currently limited",
            )
        }
        JsValue::New(
            _,
            box JsValue::WellKnownFunction(WellKnownFunctionKind::URLConstructor),
            ref args,
        ) => {
            if let [JsValue::Constant(super::analyzer::ConstantValue::Str(url)), JsValue::Member(
                _,
                box JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta),
                box JsValue::Constant(super::analyzer::ConstantValue::Str(prop)),
            )] = &args[..]
            {
                if prop.as_str() == "url" {
                    // TODO avoid clone
                    JsValue::Url(url.clone(), JsValueUrlKind::Relative)
                } else {
                    v.into_unknown(true, "new non constant")
                }
            } else {
                v.into_unknown(true, "new non constant")
            }
        }
        JsValue::FreeVar(ref kind) => match &**kind {
            "__dirname" => as_abs_path(origin.origin_path().parent()).await?,
            "__filename" => as_abs_path(origin.origin_path()).await?,

            "require" => JsValue::unknown_if(
                ignore,
                JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                true,
                "ignored require",
            ),
            "import" => JsValue::unknown_if(
                ignore,
                JsValue::WellKnownFunction(WellKnownFunctionKind::Import),
                true,
                "ignored import",
            ),
            "Worker" => JsValue::unknown_if(
                ignore,
                JsValue::WellKnownFunction(WellKnownFunctionKind::WorkerConstructor),
                true,
                "ignored Worker constructor",
            ),
            "define" => JsValue::WellKnownFunction(WellKnownFunctionKind::Define),
            "URL" => JsValue::WellKnownFunction(WellKnownFunctionKind::URLConstructor),
            "process" => JsValue::WellKnownObject(WellKnownObjectKind::NodeProcess),
            "Object" => JsValue::WellKnownObject(WellKnownObjectKind::GlobalObject),
            "Buffer" => JsValue::WellKnownObject(WellKnownObjectKind::NodeBuffer),
            _ => return Ok((v, false)),
        },
        JsValue::Module(ref mv) => compile_time_info
            .environment()
            .node_externals()
            .await?
            // TODO check externals
            .then(|| module_value_to_well_known_object(mv))
            .flatten()
            .unwrap_or_else(|| v.into_unknown(true, "cross module analyzing is not yet supported")),
        JsValue::Argument(..) => {
            v.into_unknown(true, "cross function analyzing is not yet supported")
        }
        _ => {
            let (mut v, mut modified) = replace_well_known(v, compile_time_info).await?;
            modified = replace_builtin(&mut v) || modified;
            modified = modified || v.make_nested_operations_unknown();
            return Ok((v, modified));
        }
    };
    Ok((value, true))
}

async fn require_resolve_visitor(
    origin: Vc<Box<dyn ResolveOrigin>>,
    args: Vec<JsValue>,
) -> Result<JsValue> {
    Ok(if args.len() == 1 {
        let pat = js_value_to_pattern(&args[0]);
        let request = Request::parse(Value::new(pat.clone()));
        let resolved = cjs_resolve_source(origin, request, None, true)
            .resolve()
            .await?;
        let mut values = resolved
            .primary_sources()
            .await?
            .iter()
            .map(|&source| async move { require_resolve(source.ident().path()).await })
            .try_join()
            .await?;

        match values.len() {
            0 => JsValue::unknown(
                JsValue::call(
                    Box::new(JsValue::WellKnownFunction(
                        WellKnownFunctionKind::RequireResolve,
                    )),
                    args,
                ),
                false,
                "unresolvable request",
            ),
            1 => values.pop().unwrap(),
            _ => JsValue::alternatives(values),
        }
    } else {
        JsValue::unknown(
            JsValue::call(
                Box::new(JsValue::WellKnownFunction(
                    WellKnownFunctionKind::RequireResolve,
                )),
                args,
            ),
            true,
            "only a single argument is supported",
        )
    })
}

async fn require_context_visitor(
    origin: Vc<Box<dyn ResolveOrigin>>,
    args: Vec<JsValue>,
) -> Result<JsValue> {
    let options = match parse_require_context(&args) {
        Ok(options) => options,
        Err(err) => {
            return Ok(JsValue::unknown(
                JsValue::call(
                    Box::new(JsValue::WellKnownFunction(
                        WellKnownFunctionKind::RequireContext,
                    )),
                    args,
                ),
                true,
                PrettyPrintError(&err).to_string(),
            ))
        }
    };

    let dir = origin.origin_path().parent().join(options.dir.clone());

    let map = RequireContextMap::generate(
        origin,
        dir,
        options.include_subdirs,
        Vc::cell(options.filter),
        None,
        true,
    );

    Ok(JsValue::WellKnownFunction(
        WellKnownFunctionKind::RequireContextRequire(
            RequireContextValue::from_context_map(map).await?,
        ),
    ))
}

#[derive(Debug)]
enum StaticExpr {
    String(String),
    FreeVar(Vec<String>),
    ImportedVar(String, Vec<String>),
    Unknown,
}

// TODO get rid of that
#[derive(Default)]
struct StaticAnalyser {
    imports: FxHashMap<String, (String, Vec<String>)>,
}

impl StaticAnalyser {
    fn prop_to_name(&self, prop: &MemberProp) -> Option<String> {
        match prop {
            MemberProp::Ident(ident) => Some(ident.sym.to_string()),
            MemberProp::PrivateName(_) => None,
            MemberProp::Computed(ComputedPropName { expr, .. }) => match self.evaluate_expr(expr) {
                StaticExpr::String(str) => Some(str),
                _ => None,
            },
        }
    }

    fn evaluate_expr(&self, expr: &Expr) -> StaticExpr {
        match expr {
            Expr::Lit(Lit::Str(str)) => StaticExpr::String(str.value.to_string()),
            Expr::Ident(ident) => {
                let str = ident.sym.to_string();
                match self.imports.get(&str) {
                    Some((module, import)) => {
                        StaticExpr::ImportedVar(module.clone(), import.clone())
                    }
                    None => StaticExpr::FreeVar(vec![str]),
                }
            }
            Expr::Member(member) => match self.evaluate_expr(&member.obj) {
                StaticExpr::FreeVar(mut vec) => match self.prop_to_name(&member.prop) {
                    Some(name) => {
                        vec.push(name);
                        StaticExpr::FreeVar(vec)
                    }
                    None => StaticExpr::Unknown,
                },
                StaticExpr::ImportedVar(module, mut vec) => match self.prop_to_name(&member.prop) {
                    Some(name) => {
                        vec.push(name);
                        StaticExpr::ImportedVar(module, vec)
                    }
                    None => StaticExpr::Unknown,
                },
                _ => StaticExpr::Unknown,
            },
            _ => StaticExpr::Unknown,
        }
    }
}

/// A visitor that walks the AST and collects information about the various
/// references a module makes to other parts of the code.
struct ModuleReferencesVisitor<'a> {
    eval_context: &'a EvalContext,
    old_analyser: StaticAnalyser,
    import_references: &'a [ResolvedVc<EsmAssetReference>],
    analysis: &'a mut AnalyzeEcmascriptModuleResultBuilder,
    esm_exports: BTreeMap<RcStr, EsmExport>,
    esm_star_exports: Vec<ResolvedVc<Box<dyn ModuleReference>>>,
    webpack_runtime: Option<(RcStr, Span)>,
    webpack_entry: bool,
    webpack_chunks: Vec<Lit>,
}

impl<'a> ModuleReferencesVisitor<'a> {
    fn new(
        eval_context: &'a EvalContext,
        import_references: &'a [ResolvedVc<EsmAssetReference>],
        analysis: &'a mut AnalyzeEcmascriptModuleResultBuilder,
    ) -> Self {
        Self {
            eval_context,
            old_analyser: StaticAnalyser::default(),
            import_references,
            analysis,
            esm_exports: BTreeMap::new(),
            esm_star_exports: Vec::new(),
            webpack_runtime: None,
            webpack_entry: false,
            webpack_chunks: Vec::new(),
        }
    }
}

fn as_parent_path(ast_path: &AstNodePath<AstParentNodeRef<'_>>) -> Vec<AstParentKind> {
    ast_path.iter().map(|n| n.kind()).collect()
}

fn for_each_ident_in_decl(decl: &Decl, f: &mut impl FnMut(RcStr)) {
    match decl {
        Decl::Class(ClassDecl { ident, .. }) | Decl::Fn(FnDecl { ident, .. }) => {
            f(ident.sym.as_str().into());
        }
        Decl::Var(var_decl) => {
            let decls = &*var_decl.decls;
            decls
                .iter()
                .for_each(|VarDeclarator { name, .. }| for_each_ident_in_pat(name, f));
        }
        Decl::Using(using_decl) => {
            let decls = &*using_decl.decls;
            decls
                .iter()
                .for_each(|VarDeclarator { name, .. }| for_each_ident_in_pat(name, f));
        }
        Decl::TsInterface(_) | Decl::TsTypeAlias(_) | Decl::TsEnum(_) | Decl::TsModule(_) => {
            // ignore typescript for code generation
        }
    }
}
fn for_each_ident_in_pat(pat: &Pat, f: &mut impl FnMut(RcStr)) {
    match pat {
        Pat::Ident(BindingIdent { id, .. }) => {
            f(id.sym.as_str().into());
        }
        Pat::Array(ArrayPat { elems, .. }) => elems.iter().for_each(|e| {
            if let Some(e) = e {
                for_each_ident_in_pat(e, f);
            }
        }),
        Pat::Rest(RestPat { arg, .. }) => {
            for_each_ident_in_pat(arg, f);
        }
        Pat::Object(ObjectPat { props, .. }) => {
            props.iter().for_each(|p| match p {
                ObjectPatProp::KeyValue(KeyValuePatProp { value, .. }) => {
                    for_each_ident_in_pat(value, f);
                }
                ObjectPatProp::Assign(AssignPatProp { key, .. }) => {
                    f(key.sym.as_str().into());
                }
                ObjectPatProp::Rest(RestPat { arg, .. }) => {
                    for_each_ident_in_pat(arg, f);
                }
            });
        }
        Pat::Assign(AssignPat { left, .. }) => {
            for_each_ident_in_pat(left, f);
        }
        Pat::Invalid(_) | Pat::Expr(_) => {
            panic!("Unexpected pattern while enumerating idents");
        }
    }
}

impl VisitAstPath for ModuleReferencesVisitor<'_> {
    fn visit_export_all<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportAll,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.analysis
            .add_code_gen(EsmModuleItem::new(as_parent_path(ast_path).into()));
        export.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_named_export<'ast: 'r, 'r>(
        &mut self,
        export: &'ast NamedExport,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        // We create mutable exports for fake ESMs generated by module splitting
        let is_fake_esm = export
            .with
            .as_deref()
            .map(find_turbopack_part_id_in_asserts)
            .is_some();

        if export.src.is_none() {
            for spec in export.specifiers.iter() {
                fn to_string(name: &ModuleExportName) -> &JsWord {
                    name.atom()
                }
                match spec {
                    ExportSpecifier::Namespace(_) => {
                        panic!(
                            "ExportNamespaceSpecifier will not happen in combination with src == \
                             None"
                        );
                    }
                    ExportSpecifier::Default(_) => {
                        panic!(
                            "ExportDefaultSpecifier will not happen in combination with src == \
                             None"
                        );
                    }
                    ExportSpecifier::Named(ExportNamedSpecifier { orig, exported, .. }) => {
                        let key = to_string(exported.as_ref().unwrap_or(orig)).as_str().into();
                        let binding_name = to_string(orig).as_str().into();
                        let export = {
                            let imported_binding = if let ModuleExportName::Ident(ident) = orig {
                                self.eval_context.imports.get_binding(&ident.to_id())
                            } else {
                                None
                            };
                            if let Some((index, export)) = imported_binding {
                                let esm_ref = self.import_references[index];
                                if let Some(export) = export {
                                    EsmExport::ImportedBinding(
                                        ResolvedVc::upcast(esm_ref),
                                        export,
                                        is_fake_esm,
                                    )
                                } else {
                                    EsmExport::ImportedNamespace(ResolvedVc::upcast(esm_ref))
                                }
                            } else {
                                EsmExport::LocalBinding(binding_name, is_fake_esm)
                            }
                        };
                        self.esm_exports.insert(key, export);
                    }
                }
            }
        }

        self.analysis
            .add_code_gen(EsmModuleItem::new(as_parent_path(ast_path).into()));
        export.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_export_decl<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        for_each_ident_in_decl(&export.decl, &mut |name| {
            self.esm_exports
                .insert(name.clone(), EsmExport::LocalBinding(name, false));
        });
        self.analysis
            .add_code_gen(EsmModuleItem::new(as_parent_path(ast_path).into()));
        export.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_export_default_expr<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportDefaultExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.esm_exports.insert(
            "default".into(),
            EsmExport::LocalBinding(magic_identifier::mangle("default export").into(), false),
        );
        self.analysis
            .add_code_gen(EsmModuleItem::new(as_parent_path(ast_path).into()));
        export.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_export_default_decl<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportDefaultDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        match &export.decl {
            DefaultDecl::Class(ClassExpr { ident, .. }) | DefaultDecl::Fn(FnExpr { ident, .. }) => {
                self.esm_exports.insert(
                    "default".into(),
                    EsmExport::LocalBinding(
                        ident
                            .as_ref()
                            .map(|i| i.sym.as_str().into())
                            .unwrap_or_else(|| magic_identifier::mangle("default export").into()),
                        false,
                    ),
                );
            }
            DefaultDecl::TsInterfaceDecl(..) => {
                // ignore
            }
        }
        self.analysis
            .add_code_gen(EsmModuleItem::new(as_parent_path(ast_path).into()));
        export.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_import_decl<'ast: 'r, 'r>(
        &mut self,
        import: &'ast ImportDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let path = as_parent_path(ast_path).into();
        let src = import.src.value.to_string();
        import.visit_children_with_ast_path(self, ast_path);
        if import.type_only {
            return;
        }
        for specifier in &import.specifiers {
            match specifier {
                ImportSpecifier::Named(named) => {
                    if !named.is_type_only {
                        self.old_analyser.imports.insert(
                            named.local.sym.to_string(),
                            (
                                src.clone(),
                                vec![match &named.imported {
                                    Some(ModuleExportName::Ident(ident)) => ident.sym.to_string(),
                                    Some(ModuleExportName::Str(str)) => str.value.to_string(),
                                    None => named.local.sym.to_string(),
                                }],
                            ),
                        );
                    }
                }
                ImportSpecifier::Default(default_import) => {
                    self.old_analyser.imports.insert(
                        default_import.local.sym.to_string(),
                        (src.clone(), vec!["default".to_string()]),
                    );
                }
                ImportSpecifier::Namespace(namespace) => {
                    self.old_analyser
                        .imports
                        .insert(namespace.local.sym.to_string(), (src.clone(), Vec::new()));
                }
            }
        }
        self.analysis.add_code_gen(EsmModuleItem::new(path));
    }

    fn visit_var_declarator<'ast: 'r, 'r>(
        &mut self,
        decl: &'ast VarDeclarator,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if let Some(ident) = decl.name.as_ident() {
            if &*ident.id.sym == "__webpack_require__" {
                if let Some(init) = &decl.init {
                    if let Some(call) = init.as_call() {
                        if let Some(expr) = call.callee.as_expr() {
                            if let Some(ident) = expr.as_ident() {
                                if &*ident.sym == "require" {
                                    if let [ExprOrSpread { spread: None, expr }] = &call.args[..] {
                                        if let Some(Lit::Str(str)) = expr.as_lit() {
                                            self.webpack_runtime =
                                                Some((str.value.as_str().into(), call.span));
                                            return;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        decl.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_call_expr<'ast: 'r, 'r>(
        &mut self,
        call: &'ast CallExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if let Callee::Expr(expr) = &call.callee {
            if let StaticExpr::FreeVar(var) = self.old_analyser.evaluate_expr(expr) {
                match &var[..] {
                    [webpack_require, property]
                        if webpack_require == "__webpack_require__" && property == "C" =>
                    {
                        self.webpack_entry = true;
                    }
                    [webpack_require, property]
                        if webpack_require == "__webpack_require__" && property == "X" =>
                    {
                        if let [_, ExprOrSpread {
                            spread: None,
                            expr: chunk_ids,
                        }, _] = &call.args[..]
                        {
                            if let Some(array) = chunk_ids.as_array() {
                                for elem in array.elems.iter().flatten() {
                                    if let ExprOrSpread { spread: None, expr } = elem {
                                        if let Some(lit) = expr.as_lit() {
                                            self.webpack_chunks.push(lit.clone());
                                        }
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        call.visit_children_with_ast_path(self, ast_path);
    }
}

#[turbo_tasks::function]
async fn resolve_as_webpack_runtime(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    transforms: Vc<EcmascriptInputTransforms>,
) -> Result<Vc<WebpackRuntime>> {
    let ty = Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined));
    let options = origin.resolve_options(ty.clone());

    let options = apply_cjs_specific_options(options);

    let resolved = resolve(
        origin.origin_path().parent().resolve().await?,
        Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined)),
        request,
        options,
    );

    if let Some(source) = *resolved.first_source().await? {
        Ok(webpack_runtime(*source, transforms))
    } else {
        Ok(WebpackRuntime::None.into())
    }
}

#[derive(Hash, Debug, Clone, Eq, Serialize, Deserialize, PartialEq, TraceRawVcs)]
pub struct AstPath(#[turbo_tasks(trace_ignore)] Vec<AstParentKind>);

impl TaskInput for AstPath {
    fn is_transient(&self) -> bool {
        false
    }
}
unsafe impl NonLocalValue for AstPath {}

impl Deref for AstPath {
    type Target = [AstParentKind];

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl From<Vec<AstParentKind>> for AstPath {
    fn from(v: Vec<AstParentKind>) -> Self {
        Self(v)
    }
}

pub static TURBOPACK_HELPER: Lazy<JsWord> = Lazy::new(|| "__turbopack-helper__".into());

pub fn is_turbopack_helper_import(import: &ImportDecl) -> bool {
    let annotations = ImportAnnotations::parse(import.with.as_deref());

    annotations.get(&TURBOPACK_HELPER).is_some()
}

pub fn is_swc_helper_import(import: &ImportDecl) -> bool {
    import.src.value.starts_with("@swc/helpers/")
}

#[derive(Debug)]
enum DetectedDynamicExportType {
    CommonJs,
    Namespace,
    Value,
    None,
    UsingModuleDeclarations,
}

fn detect_dynamic_export(p: &Program) -> DetectedDynamicExportType {
    use swc_core::ecma::visit::{visit_obj_and_computed, Visit, VisitWith};

    if let Program::Module(m) = p {
        // Check for imports/exports
        if m.body.iter().any(|item| {
            item.as_module_decl().is_some_and(|module_decl| {
                module_decl.as_import().is_none_or(|import| {
                    !is_turbopack_helper_import(import) && !is_swc_helper_import(import)
                })
            })
        }) {
            return DetectedDynamicExportType::UsingModuleDeclarations;
        }
    }

    struct Visitor {
        cjs: bool,
        value: bool,
        namespace: bool,
        found: bool,
    }

    impl Visit for Visitor {
        visit_obj_and_computed!();

        fn visit_ident(&mut self, i: &Ident) {
            // The detection is not perfect, it might have some false positives, e. g. in
            // cases where `module` is used in some other way. e. g. `const module = 42;`.
            // But a false positive doesn't break anything, it only opts out of some
            // optimizations, which is acceptable.
            if &*i.sym == "module" || &*i.sym == "exports" {
                self.cjs = true;
                self.found = true;
            }
            if &*i.sym == "__turbopack_export_value__" {
                self.value = true;
                self.found = true;
            }
            if &*i.sym == "__turbopack_export_namespace__" {
                self.namespace = true;
                self.found = true;
            }
        }

        fn visit_expr(&mut self, n: &Expr) {
            if self.found {
                return;
            }

            if let Expr::Member(member) = n {
                if member.obj.is_ident_ref_to("__turbopack_context__") {
                    if let MemberProp::Ident(prop) = &member.prop {
                        const TURBOPACK_EXPORT_VALUE_SHORTCUT: &str =
                            TURBOPACK_EXPORT_VALUE.shortcut;
                        const TURBOPACK_EXPORT_NAMESPACE_SHORTCUT: &str =
                            TURBOPACK_EXPORT_NAMESPACE.shortcut;
                        match &*prop.sym {
                            TURBOPACK_EXPORT_VALUE_SHORTCUT => {
                                self.value = true;
                                self.found = true;
                            }
                            TURBOPACK_EXPORT_NAMESPACE_SHORTCUT => {
                                self.namespace = true;
                                self.found = true;
                            }
                            _ => {}
                        }
                    }
                }
            }

            n.visit_children_with(self);
        }

        fn visit_stmt(&mut self, n: &Stmt) {
            if self.found {
                return;
            }
            n.visit_children_with(self);
        }
    }

    let mut v = Visitor {
        cjs: false,
        value: false,
        namespace: false,
        found: false,
    };
    p.visit_with(&mut v);
    if v.cjs {
        DetectedDynamicExportType::CommonJs
    } else if v.value {
        DetectedDynamicExportType::Value
    } else if v.namespace {
        DetectedDynamicExportType::Namespace
    } else {
        DetectedDynamicExportType::None
    }
}

/// Detects whether a list of arguments is specifically
/// `(process.argv[0], ['-e', ...])`. This is useful for detecting if a node
/// process is being spawned to interpret a string of JavaScript code, and does
/// not require static analysis.
fn is_invoking_node_process_eval(args: &[JsValue]) -> bool {
    if args.len() < 2 {
        return false;
    }

    if let JsValue::Member(_, obj, constant) = &args[0] {
        // Is the first argument to spawn `process.argv[]`?
        if let (
            box JsValue::WellKnownObject(WellKnownObjectKind::NodeProcessArgv),
            box JsValue::Constant(JsConstantValue::Num(ConstantNumber(num))),
        ) = (obj, constant)
        {
            // Is it specifically `process.argv[0]`?
            if num.is_zero() {
                if let JsValue::Array {
                    total_nodes: _,
                    items,
                    mutable: _,
                } = &args[1]
                {
                    // Is `-e` one of the arguments passed to the program?
                    if items.iter().any(|e| {
                        if let JsValue::Constant(JsConstantValue::Str(ConstantString::Atom(arg))) =
                            e
                        {
                            arg == "-e"
                        } else {
                            false
                        }
                    }) {
                        // If so, this is likely spawning node to evaluate a string, and
                        // does not need to be statically analyzed.
                        return true;
                    }
                }
            }
        }
    }

    false
}

fn maybe_decode_data_url(url: RcStr) -> Option<Rope> {
    const DATA_PREAMBLE: &str = "data:application/json;base64,";

    if !url.starts_with(DATA_PREAMBLE) {
        return None;
    }
    let data_b64 = &url[DATA_PREAMBLE.len()..];
    data_encoding::BASE64
        .decode(data_b64.as_bytes())
        .ok()
        .map(Rope::from)
}
