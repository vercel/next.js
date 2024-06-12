pub mod amd;
pub mod async_module;
pub mod cjs;
pub mod constant_condition;
pub mod constant_value;
pub mod dynamic_expression;
pub mod esm;
pub mod external_module;
pub mod node;
pub mod pattern_mapping;
pub mod raw;
pub mod require_context;
pub mod type_issue;
pub mod typescript;
pub mod unreachable;
pub mod util;

use std::{
    borrow::Cow,
    collections::{BTreeMap, HashMap},
    future::Future,
    mem::take,
    pin::Pin,
    sync::Arc,
};

use anyhow::Result;
use constant_condition::{ConstantCondition, ConstantConditionValue};
use constant_value::ConstantValue;
use indexmap::IndexSet;
use lazy_static::lazy_static;
use num_traits::Zero;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use regex::Regex;
use sourcemap::decode_data_url;
use swc_core::{
    atoms::JsWord,
    common::{
        comments::{CommentKind, Comments},
        errors::{DiagnosticId, Handler, HANDLER},
        pass::AstNodePath,
        source_map::Pos,
        Globals, Span, Spanned, GLOBALS,
    },
    ecma::{
        ast::*,
        visit::{
            fields::{AssignExprField, AssignTargetField, SimpleAssignTargetField},
            AstParentKind, AstParentNodeRef, VisitAstPath, VisitWithPath,
        },
    },
};
use tracing::Instrument;
use turbo_tasks::{RcStr, TryJoinIterExt, Upcast, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    compile_time_info::{CompileTimeInfo, FreeVarReference},
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
    source_map::{GenerateSourceMap, OptionSourceMap, SourceMap},
};
use turbopack_resolve::{
    ecmascript::{apply_cjs_specific_options, cjs_resolve, try_to_severity},
    typescript::tsconfig,
};
use turbopack_swc_utils::emitter::IssueEmitter;
use unreachable::Unreachable;

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
    parse::{parse, ParseResult},
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
        imports::{ImportAnnotations, ImportedSymbol, Reexport},
        parse_require_context,
        top_level_await::has_top_level_await,
        ConstantNumber, ConstantString, ModuleValue, RequireContextValue,
    },
    chunk::EcmascriptExports,
    code_gen::{CodeGen, CodeGenerateable, CodeGenerateableWithAsyncModuleInfo, CodeGenerateables},
    magic_identifier,
    references::{
        async_module::{AsyncModule, OptionAsyncModule},
        cjs::{CjsRequireAssetReference, CjsRequireCacheAccess, CjsRequireResolveAssetReference},
        dynamic_expression::DynamicExpression,
        esm::{module_id::EsmModuleIdAssetReference, EsmBinding, UrlRewriteBehavior},
        node::PackageJsonReference,
        require_context::{RequireContextAssetReference, RequireContextMap},
        type_issue::SpecifiedModuleTypeIssue,
    },
    tree_shake::{find_turbopack_part_id_in_asserts, part_of_module, split},
    EcmascriptInputTransforms, EcmascriptModuleAsset, SpecifiedModuleType, TreeShakingMode,
};

#[derive(Clone)]
#[turbo_tasks::value(shared)]
pub struct AnalyzeEcmascriptModuleResult {
    pub references: Vc<ModuleReferences>,
    pub local_references: Vc<ModuleReferences>,
    pub reexport_references: Vc<ModuleReferences>,
    pub evaluation_references: Vc<ModuleReferences>,
    pub code_generation: Vc<CodeGenerateables>,
    pub exports: Vc<EcmascriptExports>,
    pub async_module: Vc<OptionAsyncModule>,
    /// `true` when the analysis was successful.
    pub successful: bool,
    pub source_map: Vc<OptionSourceMap>,
}

/// A temporary analysis result builder to pass around, to be turned into an
/// `Vc<AnalyzeEcmascriptModuleResult>` eventually.
pub struct AnalyzeEcmascriptModuleResultBuilder {
    references: IndexSet<Vc<Box<dyn ModuleReference>>>,
    local_references: IndexSet<Vc<Box<dyn ModuleReference>>>,
    reexport_references: IndexSet<Vc<Box<dyn ModuleReference>>>,
    evaluation_references: IndexSet<Vc<Box<dyn ModuleReference>>>,
    code_gens: Vec<CodeGen>,
    exports: EcmascriptExports,
    async_module: Vc<OptionAsyncModule>,
    successful: bool,
    source_map: Option<Vc<OptionSourceMap>>,
}

impl AnalyzeEcmascriptModuleResultBuilder {
    pub fn new() -> Self {
        Self {
            references: IndexSet::new(),
            local_references: IndexSet::new(),
            reexport_references: IndexSet::new(),
            evaluation_references: IndexSet::new(),
            code_gens: Vec::new(),
            exports: EcmascriptExports::None,
            async_module: Vc::cell(None),
            successful: false,
            source_map: None,
        }
    }

    /// Adds an asset reference to the analysis result.
    pub fn add_reference<R>(&mut self, reference: Vc<R>)
    where
        R: Upcast<Box<dyn ModuleReference>>,
    {
        let r = Vc::upcast(reference);
        self.references.insert(r);
        self.local_references.insert(Vc::upcast(reference));
    }

    /// Adds an asset reference to the analysis result.
    pub fn add_import_reference(&mut self, reference: Vc<EsmAssetReference>) {
        self.references.insert(Vc::upcast(reference));
    }

    /// Adds an reexport reference to the analysis result.
    pub fn add_local_reference<R>(&mut self, reference: Vc<R>)
    where
        R: Upcast<Box<dyn ModuleReference>>,
    {
        self.local_references.insert(Vc::upcast(reference));
    }

    /// Adds an reexport reference to the analysis result.
    pub fn add_reexport_reference<R>(&mut self, reference: Vc<R>)
    where
        R: Upcast<Box<dyn ModuleReference>>,
    {
        self.reexport_references.insert(Vc::upcast(reference));
    }

    /// Adds an evaluation reference to the analysis result.
    pub fn add_evaluation_reference(&mut self, reference: Vc<EsmAssetReference>) {
        self.evaluation_references.insert(Vc::upcast(reference));
    }

    /// Adds a codegen to the analysis result.
    pub fn add_code_gen<C>(&mut self, code_gen: Vc<C>)
    where
        C: Upcast<Box<dyn CodeGenerateable>>,
    {
        self.code_gens
            .push(CodeGen::CodeGenerateable(Vc::upcast(code_gen)));
    }

    /// Adds a codegen to the analysis result.
    #[allow(dead_code)]
    pub fn add_code_gen_with_availability_info<C>(&mut self, code_gen: Vc<C>)
    where
        C: Upcast<Box<dyn CodeGenerateableWithAsyncModuleInfo>>,
    {
        self.code_gens
            .push(CodeGen::CodeGenerateableWithAsyncModuleInfo(Vc::upcast(
                code_gen,
            )));
    }

    /// Sets the analysis result ES export.
    pub fn set_source_map(&mut self, source_map: Vc<OptionSourceMap>) {
        self.source_map = Some(source_map);
    }

    /// Sets the analysis result ES export.
    pub fn set_exports(&mut self, exports: EcmascriptExports) {
        self.exports = exports;
    }

    /// Sets the analysis result ES export.
    pub fn set_async_module(&mut self, async_module: Vc<AsyncModule>) {
        self.async_module = Vc::cell(Some(async_module));
    }

    /// Sets whether the analysis was successful.
    pub fn set_successful(&mut self, successful: bool) {
        self.successful = successful;
    }

    /// Builds the final analysis result. Resolves internal Vcs for performance
    /// in using them.
    pub async fn build(
        mut self,
        track_reexport_references: bool,
    ) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
        let mut references: Vec<_> = self.references.into_iter().collect();
        for r in references.iter_mut() {
            *r = r.resolve().await?;
        }
        let mut local_references: Vec<_> = track_reexport_references
            .then(|| self.local_references.into_iter())
            .into_iter()
            .flatten()
            .collect();
        for r in local_references.iter_mut() {
            *r = r.resolve().await?;
        }
        let mut reexport_references: Vec<_> = track_reexport_references
            .then(|| self.reexport_references.into_iter())
            .into_iter()
            .flatten()
            .collect();
        for r in reexport_references.iter_mut() {
            *r = r.resolve().await?;
        }
        let mut evaluation_references: Vec<_> = track_reexport_references
            .then(|| self.evaluation_references.into_iter())
            .into_iter()
            .flatten()
            .collect();
        for r in evaluation_references.iter_mut() {
            *r = r.resolve().await?;
        }
        for c in self.code_gens.iter_mut() {
            match c {
                CodeGen::CodeGenerateable(c) => {
                    *c = c.resolve().await?;
                }
                CodeGen::CodeGenerateableWithAsyncModuleInfo(c) => {
                    *c = c.resolve().await?;
                }
            }
        }
        let source_map = if let Some(source_map) = self.source_map {
            source_map
        } else {
            OptionSourceMap::none()
        };
        Ok(AnalyzeEcmascriptModuleResult::cell(
            AnalyzeEcmascriptModuleResult {
                references: Vc::cell(references),
                local_references: Vc::cell(local_references),
                reexport_references: Vc::cell(reexport_references),
                evaluation_references: Vc::cell(evaluation_references),
                code_generation: Vc::cell(self.code_gens),
                exports: self.exports.into(),
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
    source: Vc<Box<dyn Source>>,
    origin: Vc<Box<dyn ResolveOrigin>>,
    compile_time_info: Vc<CompileTimeInfo>,
    var_graph: &'a VarGraph,
    /// This is the current state of known values of function
    /// arguments.
    fun_args_values: Mutex<HashMap<u32, Vec<JsValue>>>,
    // There can be many references to import.meta, but only the first should hoist
    // the object allocation.
    first_import_meta: bool,
    tree_shaking_mode: Option<TreeShakingMode>,
    import_externals: bool,
    ignore_dynamic_requests: bool,
}

impl<'a> AnalysisState<'a> {
    async fn link_value(&self, value: JsValue, in_try: bool) -> Result<JsValue> {
        let fun_args_values = self.fun_args_values.lock().clone();
        link(
            self.var_graph,
            value,
            &early_value_visitor,
            &|value| value_visitor(self.origin, value, self.compile_time_info, in_try),
            fun_args_values,
        )
        .await
    }
}

fn set_handler_and_globals<F, R>(handler: &Handler, globals: &Arc<Globals>, f: F) -> R
where
    F: FnOnce() -> R,
{
    HANDLER.set(handler, || GLOBALS.set(globals, f))
}

#[turbo_tasks::function]
pub(crate) async fn analyse_ecmascript_module(
    module: Vc<EcmascriptModuleAsset>,
    part: Option<Vc<ModulePart>>,
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
    module: Vc<EcmascriptModuleAsset>,
    part: Option<Vc<ModulePart>>,
) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
    let raw_module = module.await?;

    let source = raw_module.source;
    let ty = Value::new(raw_module.ty);
    let transforms = raw_module.transforms;
    let options = raw_module.options;
    let compile_time_info = raw_module.compile_time_info;
    let options = options.await?;
    let import_externals = options.import_externals;

    let origin = Vc::upcast::<Box<dyn ResolveOrigin>>(module);

    let mut analysis = AnalyzeEcmascriptModuleResultBuilder::new();
    let path = origin.origin_path();

    // Is this a typescript file that requires analzying type references?
    let analyze_types = match &*ty {
        EcmascriptModuleAssetType::Typescript { analyze_types, .. } => *analyze_types,
        EcmascriptModuleAssetType::TypescriptDeclaration => true,
        EcmascriptModuleAssetType::Ecmascript => false,
    };

    let parsed = if let Some(part) = part {
        let parsed = parse(source, ty, transforms);
        let split_data = split(source.ident(), source, parsed);
        part_of_module(split_data, part)
    } else {
        parse(source, ty, transforms)
    };

    let ModuleTypeResult {
        module_type: specified_type,
        referenced_package_json,
    } = *module.determine_module_type().await?;

    if let Some(package_json) = referenced_package_json {
        analysis.add_reference(PackageJsonReference::new(package_json));
    }

    if analyze_types {
        match &*find_context_file(path.parent(), tsconfig()).await? {
            FindContextFileResult::Found(tsconfig, _) => {
                analysis.add_reference(TsConfigReference::new(origin, *tsconfig));
            }
            FindContextFileResult::NotFound(_) => {}
        };
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

    let mut import_references = Vec::new();

    let pos = program.span().lo;
    if analyze_types {
        if let Some(comments) = comments.get_leading(pos) {
            for comment in comments.iter() {
                if let CommentKind::Line = comment.kind {
                    lazy_static! {
                        static ref REFERENCE_PATH: Regex =
                            Regex::new(r#"^/\s*<reference\s*path\s*=\s*["'](.+)["']\s*/>\s*$"#)
                                .unwrap();
                        static ref REFERENCE_TYPES: Regex =
                            Regex::new(r#"^/\s*<reference\s*types\s*=\s*["'](.+)["']\s*/>\s*$"#)
                                .unwrap();
                    }
                    let text = &comment.text;
                    if let Some(m) = REFERENCE_PATH.captures(text) {
                        let path = &m[1];
                        analysis
                            .add_reference(TsReferencePathAssetReference::new(origin, path.into()));
                    } else if let Some(m) = REFERENCE_TYPES.captures(text) {
                        let types = &m[1];
                        analysis.add_reference(TsReferenceTypeAssetReference::new(
                            origin,
                            types.into(),
                        ));
                    }
                }
            }
        }
    }

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
            let reference = SourceMapReference::new(origin_path, source_map_origin);
            analysis.add_reference(reference);
            let source_map = reference.generate_source_map();
            analysis.set_source_map(convert_to_turbopack_source_map(
                source_map,
                source_map_origin,
            ));
            source_map_from_comment = true;
        } else if path.starts_with("data:application/json;base64,") {
            let source_map_origin = origin_path;
            let source_map = maybe_decode_data_url(path.into());
            analysis.set_source_map(convert_to_turbopack_source_map(
                source_map,
                source_map_origin,
            ));
            source_map_from_comment = true;
        }
    }
    if !source_map_from_comment {
        if let Some(generate_source_map) =
            Vc::try_resolve_sidecast::<Box<dyn GenerateSourceMap>>(source).await?
        {
            let source_map_origin = source.ident().path();
            analysis.set_source_map(convert_to_turbopack_source_map(
                generate_source_map.generate_source_map(),
                source_map_origin,
            ));
        }
    }

    let handler = Handler::with_emitter(
        true,
        false,
        Box::new(IssueEmitter::new(source, source_map.clone(), None)),
    );

    let mut var_graph =
        set_handler_and_globals(&handler, globals, || create_graph(program, eval_context));

    let mut evaluation_references = Vec::new();

    for (i, r) in eval_context.imports.references().enumerate() {
        let r = EsmAssetReference::new(
            origin,
            Request::parse(Value::new(RcStr::from(&*r.module_path).into())),
            r.issue_source,
            Value::new(r.annotations.clone()),
            match options.tree_shaking_mode {
                Some(TreeShakingMode::ModuleFragments) => match &r.imported_symbol {
                    ImportedSymbol::ModuleEvaluation => {
                        evaluation_references.push(i);
                        Some(ModulePart::evaluation())
                    }
                    ImportedSymbol::Symbol(name) => Some(ModulePart::export((&**name).into())),
                    ImportedSymbol::Part(part_id) => Some(ModulePart::internal(*part_id)),
                    ImportedSymbol::Exports => Some(ModulePart::exports()),
                    ImportedSymbol::Namespace => None,
                },
                Some(TreeShakingMode::ReexportsOnly) => match &r.imported_symbol {
                    ImportedSymbol::ModuleEvaluation => {
                        evaluation_references.push(i);
                        Some(ModulePart::evaluation())
                    }
                    ImportedSymbol::Symbol(name) => Some(ModulePart::export((&**name).into())),
                    ImportedSymbol::Part(part_id) => Some(ModulePart::internal(*part_id)),
                    ImportedSymbol::Exports => None,
                    ImportedSymbol::Namespace => None,
                },
                None => None,
            },
            import_externals,
        );
        import_references.push(r);
    }

    for r in import_references.iter_mut() {
        // Resolving these references here avoids many resolve wrapper tasks when
        // passing that to other turbo tasks functions later.
        *r = r.resolve().await?;
    }

    for r in import_references.iter() {
        // `add_import_reference` will avoid adding duplicate references
        analysis.add_import_reference(*r);
    }
    for i in evaluation_references {
        analysis.add_evaluation_reference(import_references[i]);
    }

    let (webpack_runtime, webpack_entry, webpack_chunks, esm_exports, esm_star_exports) =
        set_handler_and_globals(&handler, globals, || {
            // TODO migrate to effects
            let mut visitor =
                ModuleReferencesVisitor::new(eval_context, &import_references, &mut analysis);

            for (i, reexport) in eval_context.imports.reexports() {
                let import_ref = import_references[i];
                match reexport {
                    Reexport::Star => {
                        visitor.esm_star_exports.push(Vc::upcast(import_ref));
                    }
                    Reexport::Namespace { exported: n } => {
                        visitor.esm_exports.insert(
                            n.as_str().into(),
                            EsmExport::ImportedNamespace(Vc::upcast(import_ref)),
                        );
                    }
                    Reexport::Named {
                        imported: i,
                        exported: e,
                    } => {
                        visitor.esm_exports.insert(
                            e.as_str().into(),
                            EsmExport::ImportedBinding(
                                Vc::upcast(import_ref),
                                i.to_string().into(),
                                false,
                            ),
                        );
                    }
                }
            }

            program.visit_with_path(&mut visitor, &mut Default::default());

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
            }
            EsmExport::ImportedBinding(reference, ..) => {
                analysis.add_reexport_reference(reference);
            }
            EsmExport::Error => {}
        }
    }
    for &export in esm_star_exports.iter() {
        analysis.add_reexport_reference(export);
    }

    let mut ignore_effect_span = None;
    // Check if it was a webpack entry
    if let Some((request, span)) = webpack_runtime {
        let request = Request::parse(Value::new(request.into()));
        let runtime = resolve_as_webpack_runtime(origin, request, transforms);

        if let WebpackRuntime::Webpack5 { .. } = &*runtime.await? {
            ignore_effect_span = Some(span);
            analysis.add_reference(
                WebpackRuntimeAssetReference {
                    origin,
                    request,
                    runtime,
                    transforms,
                }
                .cell(),
            );

            if webpack_entry {
                analysis.add_reference(
                    WebpackEntryAssetReference {
                        source,
                        runtime,
                        transforms,
                    }
                    .cell(),
                );
            }

            for chunk in webpack_chunks {
                analysis.add_reference(
                    WebpackChunkAssetReference {
                        chunk_id: chunk,
                        runtime,
                        transforms,
                    }
                    .cell(),
                );
            }
        }
    }

    let exports = if !esm_exports.is_empty() || !esm_star_exports.is_empty() {
        if specified_type == SpecifiedModuleType::CommonJs {
            SpecifiedModuleTypeIssue {
                path: source.ident().path(),
                specified_type,
            }
            .cell()
            .emit();
        }

        let esm_exports = EsmExports {
            exports: esm_exports,
            star_exports: esm_star_exports,
        }
        .cell();

        EcmascriptExports::EsmExports(esm_exports)
    } else if specified_type == SpecifiedModuleType::EcmaScript {
        match detect_dynamic_export(program) {
            DetectedDynamicExportType::CommonJs => {
                SpecifiedModuleTypeIssue {
                    path: source.ident().path(),
                    specified_type,
                }
                .cell()
                .emit();

                EcmascriptExports::EsmExports(
                    EsmExports {
                        exports: Default::default(),
                        star_exports: Default::default(),
                    }
                    .cell(),
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
                .cell(),
            ),
        }
    } else {
        match detect_dynamic_export(program) {
            DetectedDynamicExportType::CommonJs => EcmascriptExports::CommonJs,
            DetectedDynamicExportType::Namespace => EcmascriptExports::DynamicNamespace,
            DetectedDynamicExportType::Value => EcmascriptExports::Value,
            DetectedDynamicExportType::UsingModuleDeclarations => EcmascriptExports::EsmExports(
                EsmExports {
                    exports: Default::default(),
                    star_exports: Default::default(),
                }
                .cell(),
            ),
            DetectedDynamicExportType::None => EcmascriptExports::None,
        }
    };

    let top_level_await_span =
        set_handler_and_globals(&handler, globals, || has_top_level_await(program));
    let has_top_level_await = top_level_await_span.is_some();

    if eval_context.is_esm() || specified_type == SpecifiedModuleType::EcmaScript {
        let async_module = AsyncModule {
            has_top_level_await,
            import_externals,
        }
        .cell();
        analysis.set_async_module(async_module);
    } else if let Some(span) = top_level_await_span {
        AnalyzeIssue {
            code: None,
            message: StyledString::Text("top level await is only supported in ESM modules.".into())
                .cell(),
            source_ident: source.ident(),
            severity: IssueSeverity::Error.into(),
            source: Some(issue_source(source, span)),
            title: Vc::cell("unexpected top level await".into()),
        }
        .cell()
        .emit();
    }

    analysis.set_exports(exports);

    let effects = take(&mut var_graph.effects);

    let mut analysis_state = AnalysisState {
        handler: &handler,
        source,
        origin,
        compile_time_info,
        var_graph: &var_graph,
        fun_args_values: Mutex::new(HashMap::<u32, Vec<JsValue>>::new()),
        first_import_meta: true,
        tree_shaking_mode: options.tree_shaking_mode,
        import_externals: options.import_externals,
        ignore_dynamic_requests: options.ignore_dynamic_requests,
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
            Effect::Conditional {
                condition,
                kind,
                ast_path: condition_ast_path,
                span: _,
                in_try,
            } => {
                let condition = analysis_state.link_value(condition, in_try).await?;

                macro_rules! inactive {
                    ($block:ident) => {
                        analysis.add_code_gen(Unreachable::new(Vc::cell($block.ast_path.to_vec())));
                    };
                }
                macro_rules! condition {
                    ($expr:expr) => {
                        analysis.add_code_gen(ConstantCondition::new(
                            Value::new($expr),
                            Vc::cell(condition_ast_path.to_vec()),
                        ));
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
                    ConditionalKind::IfElse { then, r#else }
                    | ConditionalKind::Ternary { then, r#else } => match condition.is_truthy() {
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
                    },
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
                    ConditionalKind::NullishCoalescing { expr } => match condition.is_nullish() {
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
                    },
                }
            }
            Effect::Call {
                func,
                args,
                ast_path,
                span,
                in_try,
            } => {
                if let Some(ignored) = &ignore_effect_span {
                    if *ignored == span {
                        continue;
                    }
                }
                let func = analysis_state.link_value(func, in_try).await?;

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
            } => {
                if let Some(ignored) = &ignore_effect_span {
                    if *ignored == span {
                        continue;
                    }
                }
                let mut obj = analysis_state.link_value(obj, in_try).await?;
                let prop = analysis_state.link_value(prop, in_try).await?;

                if let JsValue::Array {
                    items: ref mut values,
                    mutable,
                    ..
                } = obj
                {
                    if matches!(prop.as_str(), Some("map" | "forEach" | "filter")) {
                        if let [EffectArg::Closure(value, block)] = &mut args[..] {
                            *value = analysis_state.link_value(take(value), in_try).await?;
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

                let func = analysis_state
                    .link_value(
                        JsValue::member(Box::new(obj.clone()), Box::new(prop)),
                        in_try,
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
                )
                .await?;
            }
            Effect::FreeVar {
                var,
                ast_path,
                span,
                in_try: _,
            } => {
                handle_free_var(&ast_path, var, span, &analysis_state, &mut analysis).await?;
            }
            Effect::Member {
                obj,
                prop,
                ast_path,
                span,
                in_try,
            } => {
                let obj = analysis_state.link_value(obj, in_try).await?;
                let prop = analysis_state.link_value(prop, in_try).await?;

                handle_member(&ast_path, obj, prop, span, &analysis_state, &mut analysis).await?;
            }
            Effect::ImportedBinding {
                esm_reference_index,
                export,
                ast_path,
                span: _,
                in_try: _,
            } => {
                if let Some(r) = import_references.get(esm_reference_index) {
                    if let Some("__turbopack_module_id__") = export.as_deref() {
                        analysis
                            .add_reference(EsmModuleIdAssetReference::new(*r, Vc::cell(ast_path)))
                    } else {
                        analysis.add_local_reference(*r);
                        analysis.add_code_gen(EsmBinding::new(*r, export, Vc::cell(ast_path)));
                    }
                }
            }
            Effect::ImportMeta {
                ast_path,
                span: _,
                in_try: _,
            } => {
                if analysis_state.first_import_meta {
                    analysis_state.first_import_meta = false;
                    analysis.add_code_gen(ImportMetaBinding::new(source.ident().path()));
                }

                analysis.add_code_gen(ImportMetaRef::new(Vc::cell(ast_path)));
            }
            Effect::Url {
                input,
                ast_path,
                span,
                in_try,
            } => {
                let pat = js_value_to_pattern(&input);
                if !pat.has_constant_parts() {
                    handler.span_warn_with_code(
                        span,
                        &format!("new URL({input}, import.meta.url) is very dynamic"),
                        DiagnosticId::Lint(
                            errors::failed_to_analyse::ecmascript::NEW_URL_IMPORT_META.to_string(),
                        ),
                    );
                    if options.ignore_dynamic_requests {
                        continue;
                    }
                }
                analysis.add_reference(UrlAssetReference::new(
                    origin,
                    Request::parse(Value::new(pat)),
                    compile_time_info.environment().rendering(),
                    Vc::cell(ast_path),
                    IssueSource::from_swc_offsets(source, span.lo.to_usize(), span.hi.to_usize()),
                    in_try,
                    options
                        .url_rewrite_behavior
                        .unwrap_or(UrlRewriteBehavior::Relative)
                        .cell(),
                ));
            }
        }
    }

    analysis.set_successful(true);

    analysis
        .build(matches!(
            options.tree_shaking_mode,
            Some(TreeShakingMode::ReexportsOnly)
        ))
        .await
}

fn handle_call_boxed<'a, G: Fn(Vec<Effect>) + Send + Sync + 'a>(
    ast_path: &'a [AstParentKind],
    span: Span,
    func: JsValue,
    this: JsValue,
    args: Vec<EffectArg>,
    state: &'a AnalysisState<'a>,
    add_effects: &'a G,
    analysis: &'a mut AnalyzeEcmascriptModuleResultBuilder,
    in_try: bool,
) -> Pin<Box<dyn Future<Output = Result<()>> + Send + 'a>> {
    Box::pin(handle_call(
        ast_path,
        span,
        func,
        this,
        args,
        state,
        add_effects,
        analysis,
        in_try,
    ))
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
) -> Result<()> {
    let &AnalysisState {
        handler,
        origin,
        source,
        compile_time_info,
        ignore_dynamic_requests,
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
                    state.link_value(value, in_try).await
                }
            })
            .try_join()
            .await
    };
    match func {
        JsValue::Alternatives(_, alts) => {
            for alt in alts {
                handle_call_boxed(
                    ast_path,
                    span,
                    alt,
                    this.clone(),
                    args.clone(),
                    state,
                    add_effects,
                    analysis,
                    in_try,
                )
                .await?;
            }
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::Import) => {
            let args = linked_args(args).await?;
            if args.len() == 1 {
                let pat = js_value_to_pattern(&args[0]);
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
                        analysis.add_code_gen(DynamicExpression::new_promise(Vc::cell(
                            ast_path.to_vec(),
                        )));
                        return Ok(());
                    }
                }
                analysis.add_reference(EsmAsyncAssetReference::new(
                    origin,
                    Request::parse(Value::new(pat)),
                    Vc::cell(ast_path.to_vec()),
                    issue_source(source, span),
                    in_try,
                    state.import_externals,
                ));
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
                        analysis.add_code_gen(DynamicExpression::new(Vc::cell(ast_path.to_vec())));
                        return Ok(());
                    }
                }
                analysis.add_reference(CjsRequireAssetReference::new(
                    origin,
                    Request::parse(Value::new(pat)),
                    Vc::cell(ast_path.to_vec()),
                    issue_source(source, span),
                    in_try,
                ));
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
            );
        }

        JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve) => {
            let args = linked_args(args).await?;
            if args.len() == 1 {
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
                        analysis.add_code_gen(DynamicExpression::new(Vc::cell(ast_path.to_vec())));
                        return Ok(());
                    }
                }
                analysis.add_reference(CjsRequireResolveAssetReference::new(
                    origin,
                    Request::parse(Value::new(pat)),
                    Vc::cell(ast_path.to_vec()),
                    issue_source(source, span),
                    in_try,
                ));
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

            analysis.add_reference(RequireContextAssetReference::new(
                source,
                origin,
                options.dir,
                options.include_subdirs,
                Vc::cell(options.filter),
                Vc::cell(ast_path.to_vec()),
                Some(issue_source(source, span)),
                in_try,
            ));
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
                analysis.add_reference(FileSourceReference::new(source, Pattern::new(pat)));
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
                    in_try,
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
            analysis.add_reference(FileSourceReference::new(source, Pattern::new(pat)));
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
                    in_try,
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
            analysis.add_reference(DirAssetReference::new(source, Pattern::new(pat)));
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
                    let first_arg = state.link_value(first_arg, in_try).await?;
                    let pat = js_value_to_pattern(&first_arg);
                    let dynamic = !pat.has_constant_parts();
                    if dynamic {
                        show_dynamic_warning = true;
                    }
                    if !dynamic || !ignore_dynamic_requests {
                        analysis.add_reference(CjsAssetReference::new(
                            origin,
                            Request::parse(Value::new(pat)),
                            issue_source(source, span),
                            in_try,
                        ));
                    }
                }
                let dynamic = !pat.has_constant_parts();
                if dynamic {
                    show_dynamic_warning = true;
                }
                if !dynamic || !ignore_dynamic_requests {
                    analysis.add_reference(FileSourceReference::new(source, Pattern::new(pat)));
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
                analysis.add_reference(CjsAssetReference::new(
                    origin,
                    Request::parse(Value::new(pat)),
                    issue_source(source, span),
                    in_try,
                ));
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
                analysis.add_reference(NodePreGypConfigReference::new(
                    origin.origin_path().parent(),
                    Pattern::new(pat),
                    compile_time_info.environment().compile_target(),
                ));
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
                let first_arg = state.link_value(args[0].clone(), in_try).await?;
                if let Some(s) = first_arg.as_str() {
                    // TODO this resolving should happen within Vc<NodeGypBuildReference>
                    let current_context = origin
                        .origin_path()
                        .root()
                        .join(s.trim_start_matches("/ROOT/").into());
                    analysis.add_reference(NodeGypBuildReference::new(
                        current_context,
                        compile_time_info.environment().compile_target(),
                    ));
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
                let first_arg = state.link_value(args[0].clone(), in_try).await?;
                if let Some(s) = first_arg.as_str() {
                    analysis
                        .add_reference(NodeBindingsReference::new(origin.origin_path(), s.into()));
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
                                            in_try,
                                        )
                                        .await?;
                                    js_value_to_pattern(&linked_func_call)
                                };
                                analysis.add_reference(DirAssetReference::new(
                                    source,
                                    Pattern::new(abs_pattern),
                                ));
                                return Ok(());
                            }
                        }
                        "view engine" => {
                            if let Some(pkg) = pkg_or_dir.as_str() {
                                if pkg != "html" {
                                    let pat = js_value_to_pattern(pkg_or_dir);
                                    analysis.add_reference(CjsAssetReference::new(
                                        origin,
                                        Request::parse(Value::new(pat)),
                                        issue_source(source, span),
                                        in_try,
                                    ));
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
                            in_try,
                        )
                        .await?;
                    js_value_to_pattern(&linked_func_call)
                };
                analysis.add_reference(DirAssetReference::new(source, Pattern::new(abs_pattern)));
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
                analysis.add_reference(CjsAssetReference::new(
                    origin,
                    Request::parse(Value::new(js_value_to_pattern(&args[1]))),
                    issue_source(source, span),
                    in_try,
                ));
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
                    for dir in
                        parts
                            .iter()
                            .filter_map(|object_part| {
                                if let ObjectPart::KeyValue(
                                    JsValue::Constant(key),
                                    JsValue::Array { items: dirs, .. },
                                ) = object_part
                                {
                                    if key.as_str() == Some("includeDirs") {
                                        return Some(dirs.iter().filter_map(|dir| {
                                            dir.as_str().map(ToString::to_string)
                                        }));
                                    }
                                }
                                None
                            })
                            .flatten()
                    {
                        analysis.add_reference(DirAssetReference::new(
                            source,
                            Pattern::new(Pattern::Constant(dir.into())),
                        ));
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
    obj: JsValue,
    prop: JsValue,
    span: Span,
    state: &AnalysisState<'_>,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
) -> Result<()> {
    if let Some(prop) = prop.as_str() {
        if let Some(def_name_len) = obj.get_defineable_name_len() {
            let compile_time_info = state.compile_time_info.await?;
            let free_var_references = compile_time_info.free_var_references.await?;
            for (name, value) in free_var_references.iter() {
                if name.len() != def_name_len + 1 {
                    continue;
                }
                let mut it = name.iter().map(|v| Cow::Borrowed(&**v)).rev();
                if it.next().unwrap() != Cow::Borrowed(prop) {
                    continue;
                }
                if it.eq(obj.iter_defineable_name_rev())
                    && handle_free_var_reference(ast_path, value, span, state, analysis).await?
                {
                    return Ok(());
                }
            }
        }
    }
    match (obj, prop) {
        (JsValue::WellKnownFunction(WellKnownFunctionKind::Require), JsValue::Constant(s))
            if s.as_str() == Some("cache") =>
        {
            analysis.add_code_gen(
                CjsRequireCacheAccess {
                    path: Vc::cell(ast_path.to_vec()),
                }
                .cell(),
            );
        }
        _ => {}
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
        let compile_time_info = state.compile_time_info.await?;
        let free_var_references = compile_time_info.free_var_references.await?;
        for (name, value) in free_var_references.iter() {
            if name.len() != def_name_len {
                continue;
            }

            if var
                .iter_defineable_name_rev()
                .eq(name.iter().map(|v| Cow::Borrowed(&**v)).rev())
                && handle_free_var_reference(ast_path, value, span, state, analysis).await?
            {
                return Ok(());
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
            analysis.add_code_gen(ConstantValue::new(
                Value::new(value.clone()),
                Vc::cell(ast_path.to_vec()),
            ));
        }
        FreeVarReference::EcmaScriptModule {
            request,
            lookup_path,
            export,
        } => {
            let esm_reference = EsmAssetReference::new(
                lookup_path.map_or(state.origin, |lookup_path| {
                    Vc::upcast(PlainResolveOrigin::new(
                        state.origin.asset_context(),
                        lookup_path,
                    ))
                }),
                Request::parse(Value::new(request.clone().into())),
                Some(IssueSource::from_swc_offsets(
                    state.source,
                    span.lo.to_usize(),
                    span.hi.to_usize(),
                )),
                Default::default(),
                match state.tree_shaking_mode {
                    Some(TreeShakingMode::ModuleFragments)
                    | Some(TreeShakingMode::ReexportsOnly) => export
                        .as_ref()
                        .map(|export| ModulePart::export(export.clone())),
                    None => None,
                },
                state.import_externals,
            )
            .resolve()
            .await?;
            analysis.add_reference(esm_reference);
            analysis.add_code_gen(EsmBinding::new(
                esm_reference,
                export.clone(),
                Vc::cell(ast_path.to_vec()),
            ));
        }
    }
    Ok(true)
}

fn issue_source(source: Vc<Box<dyn Source>>, span: Span) -> Vc<IssueSource> {
    IssueSource::from_swc_offsets(source, span.lo.to_usize(), span.hi.to_usize())
}

fn analyze_amd_define(
    source: Vc<Box<dyn Source>>,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
    origin: Vc<Box<dyn ResolveOrigin>>,
    handler: &Handler,
    span: Span,
    ast_path: &[AstParentKind],
    args: Vec<JsValue>,
    in_try: bool,
) {
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
            );
        }
        [JsValue::Array { items: deps, .. }, _] => {
            analyze_amd_define_with_deps(
                source, analysis, origin, handler, span, ast_path, None, deps, in_try,
            );
        }
        [JsValue::Constant(id), JsValue::Function(..)] if id.as_str().is_some() => {
            analysis.add_code_gen(AmdDefineWithDependenciesCodeGen::new(
                vec![
                    AmdDefineDependencyElement::Require,
                    AmdDefineDependencyElement::Exports,
                    AmdDefineDependencyElement::Module,
                ],
                origin,
                Vc::cell(ast_path.to_vec()),
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
                Vc::cell(ast_path.to_vec()),
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
                Vc::cell(ast_path.to_vec()),
                AmdDefineFactoryType::Function,
                issue_source(source, span),
                in_try,
            ));
        }
        [JsValue::Object { .. }] => {
            analysis.add_code_gen(AmdDefineWithDependenciesCodeGen::new(
                vec![],
                origin,
                Vc::cell(ast_path.to_vec()),
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
                Vc::cell(ast_path.to_vec()),
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
}

fn analyze_amd_define_with_deps(
    source: Vc<Box<dyn Source>>,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
    origin: Vc<Box<dyn ResolveOrigin>>,
    handler: &Handler,
    span: Span,
    ast_path: &[AstParentKind],
    id: Option<&str>,
    deps: &[JsValue],
    in_try: bool,
) {
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
                    let request = Request::parse_string(dep.into());
                    let reference = AmdDefineAssetReference::new(
                        origin,
                        request,
                        issue_source(source, span),
                        in_try,
                    );
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
        Vc::cell(ast_path.to_vec()),
        AmdDefineFactoryType::Function,
        issue_source(source, span),
        in_try,
    ));
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
    in_try: bool,
) -> Result<(JsValue, bool)> {
    let (mut v, modified) = value_visitor_inner(origin, v, compile_time_info, in_try).await?;
    v.normalize_shallow();
    Ok((v, modified))
}

async fn value_visitor_inner(
    origin: Vc<Box<dyn ResolveOrigin>>,
    v: JsValue,
    compile_time_info: Vc<CompileTimeInfo>,
    in_try: bool,
) -> Result<(JsValue, bool)> {
    if let Some(def_name_len) = v.get_defineable_name_len() {
        let compile_time_info = compile_time_info.await?;
        let defines = compile_time_info.defines.await?;
        for (name, value) in defines.iter() {
            if name.len() != def_name_len {
                continue;
            }
            if v.iter_defineable_name_rev()
                .eq(name.iter().map(|v| Cow::Borrowed(&**v)).rev())
            {
                return Ok((value.into(), true));
            }
        }
    }
    let value = match v {
        JsValue::Call(
            _,
            box JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve),
            args,
        ) => require_resolve_visitor(origin, args, in_try).await?,
        JsValue::Call(
            _,
            box JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContext),
            args,
        ) => require_context_visitor(origin, args, in_try).await?,
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
        JsValue::FreeVar(ref kind) => match &**kind {
            "__dirname" => as_abs_path(origin.origin_path().parent()).await?,
            "__filename" => as_abs_path(origin.origin_path()).await?,

            "require" => JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
            "define" => JsValue::WellKnownFunction(WellKnownFunctionKind::Define),
            "import" => JsValue::WellKnownFunction(WellKnownFunctionKind::Import),
            "process" => JsValue::WellKnownObject(WellKnownObjectKind::NodeProcess),
            "Object" => JsValue::WellKnownObject(WellKnownObjectKind::GlobalObject),
            "Buffer" => JsValue::WellKnownObject(WellKnownObjectKind::NodeBuffer),
            _ => return Ok((v, false)),
        },
        JsValue::Module(ModuleValue {
            module: ref name, ..
        }) => {
            if *compile_time_info.environment().node_externals().await? {
                // TODO check externals
                match &**name {
                    "node:path" | "path" => {
                        JsValue::WellKnownObject(WellKnownObjectKind::PathModule)
                    }
                    "node:fs/promises" | "fs/promises" => {
                        JsValue::WellKnownObject(WellKnownObjectKind::FsModule)
                    }
                    "node:fs" | "fs" => JsValue::WellKnownObject(WellKnownObjectKind::FsModule),
                    "node:child_process" | "child_process" => {
                        JsValue::WellKnownObject(WellKnownObjectKind::ChildProcess)
                    }
                    "node:os" | "os" => JsValue::WellKnownObject(WellKnownObjectKind::OsModule),
                    "node:process" | "process" => {
                        JsValue::WellKnownObject(WellKnownObjectKind::NodeProcess)
                    }
                    "@mapbox/node-pre-gyp" => {
                        JsValue::WellKnownObject(WellKnownObjectKind::NodePreGyp)
                    }
                    "node-gyp-build" => {
                        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeGypBuild)
                    }
                    "node:bindings" | "bindings" => {
                        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeBindings)
                    }
                    "express" => JsValue::WellKnownFunction(WellKnownFunctionKind::NodeExpress),
                    "strong-globalize" => {
                        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeStrongGlobalize)
                    }
                    "resolve-from" => {
                        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeResolveFrom)
                    }
                    "@grpc/proto-loader" => {
                        JsValue::WellKnownObject(WellKnownObjectKind::NodeProtobufLoader)
                    }
                    _ => v.into_unknown(true, "cross module analyzing is not yet supported"),
                }
            } else {
                v.into_unknown(true, "cross module analyzing is not yet supported")
            }
        }
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
    in_try: bool,
) -> Result<JsValue> {
    Ok(if args.len() == 1 {
        let pat = js_value_to_pattern(&args[0]);
        let request = Request::parse(Value::new(pat.clone()));
        let resolved = cjs_resolve(origin, request, None, try_to_severity(in_try))
            .resolve()
            .await?;
        let mut values = resolved
            .primary_modules()
            .await?
            .iter()
            .map(|&module| async move { require_resolve(module.ident().path()).await })
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
                "unresolveable request",
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
    in_try: bool,
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
        try_to_severity(in_try),
    );

    Ok(JsValue::WellKnownFunction(
        WellKnownFunctionKind::RequireContextRequire(RequireContextValue::from_context_map(map)),
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
    imports: HashMap<String, (String, Vec<String>)>,
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

struct ModuleReferencesVisitor<'a> {
    eval_context: &'a EvalContext,
    old_analyser: StaticAnalyser,
    import_references: &'a [Vc<EsmAssetReference>],
    analysis: &'a mut AnalyzeEcmascriptModuleResultBuilder,
    esm_exports: BTreeMap<RcStr, EsmExport>,
    esm_star_exports: Vec<Vc<Box<dyn ModuleReference>>>,
    webpack_runtime: Option<(RcStr, Span)>,
    webpack_entry: bool,
    webpack_chunks: Vec<Lit>,
}

impl<'a> ModuleReferencesVisitor<'a> {
    fn new(
        eval_context: &'a EvalContext,
        import_references: &'a [Vc<EsmAssetReference>],
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

impl<'a> VisitAstPath for ModuleReferencesVisitor<'a> {
    fn visit_export_all<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportAll,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let path = Vc::cell(as_parent_path(ast_path));
        self.analysis.add_code_gen(EsmModuleItem::new(path));
        export.visit_children_with_path(self, ast_path);
    }

    fn visit_named_export<'ast: 'r, 'r>(
        &mut self,
        export: &'ast NamedExport,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let path = Vc::cell(as_parent_path(ast_path));
        // We create mutable exports for fake ESMs generated by module splitting
        let is_fake_esm = export
            .with
            .as_deref()
            .map(find_turbopack_part_id_in_asserts)
            .is_some();

        if export.src.is_none() {
            for spec in export.specifiers.iter() {
                fn to_string(name: &ModuleExportName) -> &JsWord {
                    match name {
                        ModuleExportName::Ident(ident) => &ident.sym,
                        ModuleExportName::Str(str) => &str.value,
                    }
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
                                        Vc::upcast(esm_ref),
                                        export,
                                        is_fake_esm,
                                    )
                                } else {
                                    EsmExport::ImportedNamespace(Vc::upcast(esm_ref))
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

        self.analysis.add_code_gen(EsmModuleItem::new(path));
        export.visit_children_with_path(self, ast_path);
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
            .add_code_gen(EsmModuleItem::new(Vc::cell(as_parent_path(ast_path))));
        export.visit_children_with_path(self, ast_path);
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
            .add_code_gen(EsmModuleItem::new(Vc::cell(as_parent_path(ast_path))));
        export.visit_children_with_path(self, ast_path);
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
            .add_code_gen(EsmModuleItem::new(Vc::cell(as_parent_path(ast_path))));
        export.visit_children_with_path(self, ast_path);
    }

    fn visit_import_decl<'ast: 'r, 'r>(
        &mut self,
        import: &'ast ImportDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        let path = Vc::cell(as_parent_path(ast_path));
        let src = import.src.value.to_string();
        import.visit_children_with_path(self, ast_path);
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
        decl.visit_children_with_path(self, ast_path);
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
        call.visit_children_with_path(self, ast_path);
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
        Ok(webpack_runtime(source, transforms))
    } else {
        Ok(WebpackRuntime::None.into())
    }
}

// TODO enable serialization
#[turbo_tasks::value(transparent, serialization = "none")]
pub struct AstPath(#[turbo_tasks(trace_ignore)] Vec<AstParentKind>);

pub static TURBOPACK_HELPER: Lazy<JsWord> = Lazy::new(|| "__turbopack-helper__".into());

pub fn is_turbopack_helper_import(import: &ImportDecl) -> bool {
    let annotations = ImportAnnotations::parse(import.with.as_deref());

    annotations.get(&TURBOPACK_HELPER).is_some()
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
            item.as_module_decl().map_or(false, |module_decl| {
                module_decl
                    .as_import()
                    .map_or(true, |import| !is_turbopack_helper_import(import))
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
                        if let JsValue::Constant(JsConstantValue::Str(ConstantString::Word(arg))) =
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

#[turbo_tasks::function]
fn maybe_decode_data_url(url: RcStr) -> Vc<OptionSourceMap> {
    if let Ok(map) = decode_data_url(&url) {
        Vc::cell(Some(SourceMap::new_decoded(map).cell()))
    } else {
        Vc::cell(None)
    }
}

#[turbo_tasks::function]
async fn convert_to_turbopack_source_map(
    source_map: Vc<OptionSourceMap>,
    origin: Vc<FileSystemPath>,
) -> Result<Vc<OptionSourceMap>> {
    let Some(source_map) = *source_map.await? else {
        return Ok(Vc::cell(None));
    };
    Ok(Vc::cell(Some(source_map.with_resolved_sources(origin))))
}
