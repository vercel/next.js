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

use std::{
    borrow::Cow,
    collections::BTreeMap,
    future::Future,
    mem::take,
    ops::Deref,
    sync::{Arc, LazyLock},
};

use anyhow::{Result, bail};
use constant_condition::{ConstantConditionCodeGen, ConstantConditionValue};
use constant_value::ConstantValueCodeGen;
use either::Either;
use indexmap::map::Entry;
use num_traits::Zero;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use regex::Regex;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use swc_core::{
    atoms::{Atom, atom},
    common::{
        GLOBALS, Globals, Span, Spanned,
        comments::{CommentKind, Comments},
        errors::{DiagnosticId, HANDLER, Handler},
        pass::AstNodePath,
        source_map::SmallPos,
    },
    ecma::{
        ast::*,
        utils::IsDirective,
        visit::{
            AstParentKind, AstParentNodeRef, VisitAstPath, VisitWithAstPath,
            fields::{
                AssignExprField, AssignTargetField, BindingIdentField, SimpleAssignTargetField,
            },
        },
    },
};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TaskInput, TryJoinIterExt, Upcast,
    ValueToString, Vc, trace::TraceRawVcs,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    compile_time_info::{
        CompileTimeDefineValue, CompileTimeDefines, CompileTimeInfo, DefinableNameSegment,
        FreeVarReference, FreeVarReferences, FreeVarReferencesIndividual, InputRelativeConstant,
    },
    environment::Rendering,
    error::PrettyPrintError,
    issue::{IssueExt, IssueSeverity, IssueSource, StyledString, analyze::AnalyzeIssue},
    module::Module,
    reference::{ModuleReference, ModuleReferences},
    reference_type::{CommonJsReferenceSubType, ReferenceType},
    resolve::{
        FindContextFileResult, ModulePart, find_context_file,
        origin::{PlainResolveOrigin, ResolveOrigin, ResolveOriginExt},
        parse::Request,
        pattern::Pattern,
        resolve,
    },
    source::Source,
    source_map::GenerateSourceMap,
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
        EsmAssetReference, EsmAsyncAssetReference, EsmExports, EsmModuleItem, ImportMetaBinding,
        ImportMetaRef, UrlAssetReference, export::EsmExport,
    },
    raw::{DirAssetReference, FileSourceReference},
    typescript::{TsConfigReference, TsReferencePathAssetReference, TsReferenceTypeAssetReference},
};
use super::{
    EcmascriptModuleAssetType, ModuleTypeResult,
    analyzer::{
        ConstantValue as JsConstantValue, JsValue, ObjectPart, WellKnownFunctionKind,
        WellKnownObjectKind,
        builtin::replace_builtin,
        graph::{Effect, create_graph},
        linker::link,
        well_known::replace_well_known,
    },
    errors,
    parse::ParseResult,
    utils::js_value_to_pattern,
    webpack::{
        WebpackChunkAssetReference, WebpackEntryAssetReference, WebpackRuntimeAssetReference,
        parse::{WebpackRuntime, webpack_runtime},
    },
};
pub use crate::references::esm::export::{FollowExportsResult, follow_reexports};
use crate::{
    AnalyzeMode, EcmascriptInputTransforms, EcmascriptModuleAsset, EcmascriptParsable,
    SpecifiedModuleType, TreeShakingMode, TypeofWindow,
    analyzer::{
        ConstantNumber, ConstantString, JsValueUrlKind, RequireContextValue,
        builtin::early_replace_builtin,
        graph::{ConditionalKind, EffectArg, EvalContext, VarGraph},
        imports::{ImportAnnotations, ImportAttributes, ImportedSymbol, Reexport},
        parse_require_context,
        top_level_await::has_top_level_await,
    },
    chunk::EcmascriptExports,
    code_gen::{CodeGen, CodeGens, IntoCodeGenReference},
    export::Liveness,
    magic_identifier,
    references::{
        async_module::{AsyncModule, OptionAsyncModule},
        cjs::{CjsRequireAssetReference, CjsRequireCacheAccess, CjsRequireResolveAssetReference},
        dynamic_expression::DynamicExpression,
        esm::{
            EsmBinding, UrlRewriteBehavior, base::EsmAssetReferences,
            module_id::EsmModuleIdAssetReference,
        },
        ident::IdentReplacement,
        member::MemberReplacement,
        node::PackageJsonReference,
        require_context::{RequireContextAssetReference, RequireContextMap},
        type_issue::SpecifiedModuleTypeIssue,
    },
    runtime_functions::{
        TURBOPACK_EXPORT_NAMESPACE, TURBOPACK_EXPORT_VALUE, TURBOPACK_EXPORTS, TURBOPACK_GLOBAL,
        TURBOPACK_REQUIRE_REAL, TURBOPACK_REQUIRE_STUB, TURBOPACK_RUNTIME_FUNCTION_SHORTCUTS,
    },
    source_map::parse_source_map_comment,
    tree_shake::{find_turbopack_part_id_in_asserts, part_of_module, split_module},
    utils::{AstPathRange, module_value_to_well_known_object},
};

#[turbo_tasks::value(shared)]
pub struct AnalyzeEcmascriptModuleResult {
    references: Vec<ResolvedVc<Box<dyn ModuleReference>>>,

    pub esm_references: ResolvedVc<EsmAssetReferences>,
    pub esm_local_references: ResolvedVc<EsmAssetReferences>,
    pub esm_reexport_references: ResolvedVc<EsmAssetReferences>,

    pub code_generation: ResolvedVc<CodeGens>,
    pub exports: ResolvedVc<EcmascriptExports>,
    pub async_module: ResolvedVc<OptionAsyncModule>,
    pub has_side_effect_free_directive: bool,
    /// `true` when the analysis was successful.
    pub successful: bool,
    pub source_map: Option<ResolvedVc<Box<dyn GenerateSourceMap>>>,
}

#[turbo_tasks::value_impl]
impl AnalyzeEcmascriptModuleResult {
    #[turbo_tasks::function]
    pub async fn references(&self) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(
            self.esm_references
                .await?
                .iter()
                .map(|r| ResolvedVc::upcast(*r))
                .chain(self.references.iter().copied())
                .collect(),
        ))
    }

    #[turbo_tasks::function]
    pub async fn local_references(&self) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(
            self.esm_local_references
                .await?
                .iter()
                .map(|r| ResolvedVc::upcast(*r))
                .chain(self.references.iter().copied())
                .collect(),
        ))
    }
}

/// A temporary analysis result builder to pass around, to be turned into an
/// `Vc<AnalyzeEcmascriptModuleResult>` eventually.
pub struct AnalyzeEcmascriptModuleResultBuilder {
    analyze_mode: AnalyzeMode,

    references: FxIndexSet<ResolvedVc<Box<dyn ModuleReference>>>,

    esm_references: FxHashSet<usize>,
    esm_local_references: FxHashSet<usize>,
    esm_reexport_references: FxHashSet<usize>,

    esm_references_free_var: FxIndexMap<RcStr, ResolvedVc<EsmAssetReference>>,
    // Ad-hoc created import references that are resolved `import * as x from ...; x.foo` accesses
    // This caches repeated access because EsmAssetReference::new is not a turbo task function.
    esm_references_rewritten: FxHashMap<usize, FxIndexMap<RcStr, ResolvedVc<EsmAssetReference>>>,

    code_gens: Vec<CodeGen>,
    exports: EcmascriptExports,
    async_module: ResolvedVc<OptionAsyncModule>,
    successful: bool,
    source_map: Option<ResolvedVc<Box<dyn GenerateSourceMap>>>,
    has_side_effect_free_directive: bool,
}

impl AnalyzeEcmascriptModuleResultBuilder {
    pub fn new(analyze_mode: AnalyzeMode) -> Self {
        Self {
            analyze_mode,
            references: Default::default(),
            esm_references: Default::default(),
            esm_local_references: Default::default(),
            esm_reexport_references: Default::default(),
            esm_references_rewritten: Default::default(),
            esm_references_free_var: Default::default(),
            code_gens: Default::default(),
            exports: EcmascriptExports::Unknown,
            async_module: ResolvedVc::cell(None),
            successful: false,
            source_map: None,
            has_side_effect_free_directive: false,
        }
    }

    /// Adds an asset reference to the analysis result.
    pub fn add_reference(&mut self, reference: ResolvedVc<impl Upcast<Box<dyn ModuleReference>>>) {
        let r = ResolvedVc::upcast_non_strict(reference);
        self.references.insert(r);
    }

    /// Adds an asset reference with codegen to the analysis result.
    pub fn add_reference_code_gen<R: IntoCodeGenReference>(&mut self, reference: R, path: AstPath) {
        let (reference, code_gen) = reference.into_code_gen_reference(path);
        self.references.insert(reference);
        self.add_code_gen(code_gen);
    }

    /// Adds an ESM asset reference to the analysis result.
    pub fn add_esm_reference(&mut self, idx: usize) {
        self.esm_references.insert(idx);
        self.esm_local_references.insert(idx);
    }

    /// Adds an reexport ESM reference to the analysis result.
    /// If you're unsure about which function to use, use `add_reference()`
    pub fn add_esm_reexport_reference(&mut self, idx: usize) {
        self.esm_references.insert(idx);
        self.esm_reexport_references.insert(idx);
    }

    /// Adds an evaluation ESM reference to the analysis result.
    /// If you're unsure about which function to use, use `add_reference()`
    pub fn add_esm_evaluation_reference(&mut self, idx: usize) {
        self.esm_references.insert(idx);
        self.esm_local_references.insert(idx);
    }

    /// Adds a codegen to the analysis result.
    pub fn add_code_gen<C>(&mut self, code_gen: C)
    where
        C: Into<CodeGen>,
    {
        if self.analyze_mode.is_code_gen() {
            self.code_gens.push(code_gen.into())
        }
    }

    /// Sets the analysis result ES export.
    pub fn set_source_map(&mut self, source_map: ResolvedVc<Box<dyn GenerateSourceMap>>) {
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

    /// Set whether this module is side-efffect free according to a user-provided directive.
    pub fn set_has_side_effect_free_directive(&mut self, value: bool) {
        self.has_side_effect_free_directive = value;
    }

    /// Sets whether the analysis was successful.
    pub fn set_successful(&mut self, successful: bool) {
        self.successful = successful;
    }

    pub fn add_esm_reference_namespace_resolved(
        &mut self,
        esm_reference_idx: usize,
        export: RcStr,
        on_insert: impl FnOnce() -> ResolvedVc<EsmAssetReference>,
    ) -> ResolvedVc<EsmAssetReference> {
        *self
            .esm_references_rewritten
            .entry(esm_reference_idx)
            .or_default()
            .entry(export)
            .or_insert_with(on_insert)
    }

    pub async fn add_esm_reference_free_var(
        &mut self,
        request: RcStr,
        on_insert: impl AsyncFnOnce() -> Result<ResolvedVc<EsmAssetReference>>,
    ) -> Result<ResolvedVc<EsmAssetReference>> {
        Ok(match self.esm_references_free_var.entry(request) {
            Entry::Occupied(e) => *e.get(),
            Entry::Vacant(e) => *e.insert(on_insert().await?),
        })
    }

    /// Builds the final analysis result. Resolves internal Vcs.
    pub async fn build(
        mut self,
        import_references: Vec<ResolvedVc<EsmAssetReference>>,
        track_reexport_references: bool,
    ) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
        // esm_references_rewritten (and esm_references_free_var) needs to be spliced in at the
        // correct index into esm_references and esm_local_references
        let mut esm_references = Vec::with_capacity(
            self.esm_references.len()
                + self.esm_references_free_var.len()
                + self.esm_references_rewritten.len(),
        );
        esm_references.extend(self.esm_references_free_var.values());

        let mut esm_local_references = track_reexport_references.then(|| {
            let mut esm_local_references = Vec::with_capacity(
                self.esm_local_references.len()
                    + self.esm_references_free_var.len()
                    + self.esm_references_rewritten.len(),
            );
            esm_local_references.extend(self.esm_references_free_var.values());
            esm_local_references
        });
        let mut esm_reexport_references = track_reexport_references
            .then(|| Vec::with_capacity(self.esm_reexport_references.len()));
        for (i, reference) in import_references.iter().enumerate() {
            if self.esm_references.contains(&i) {
                esm_references.push(*reference);
            }
            esm_references.extend(
                self.esm_references_rewritten
                    .get(&i)
                    .iter()
                    .flat_map(|m| m.values().copied()),
            );
            if let Some(esm_local_references) = &mut esm_local_references {
                if self.esm_local_references.contains(&i) {
                    esm_local_references.push(*reference);
                }
                esm_local_references.extend(
                    self.esm_references_rewritten
                        .get(&i)
                        .iter()
                        .flat_map(|m| m.values().copied()),
                );
            }
            if let Some(esm_reexport_references) = &mut esm_reexport_references
                && self.esm_reexport_references.contains(&i)
            {
                esm_reexport_references.push(*reference);
            }
        }

        let references: Vec<_> = self.references.into_iter().collect();

        if !self.analyze_mode.is_code_gen() {
            debug_assert!(self.code_gens.is_empty());
        }

        self.code_gens.shrink_to_fit();
        Ok(AnalyzeEcmascriptModuleResult::cell(
            AnalyzeEcmascriptModuleResult {
                references,
                esm_references: ResolvedVc::cell(esm_references),
                esm_local_references: ResolvedVc::cell(esm_local_references.unwrap_or_default()),
                esm_reexport_references: ResolvedVc::cell(
                    esm_reexport_references.unwrap_or_default(),
                ),
                code_generation: ResolvedVc::cell(self.code_gens),
                exports: self.exports.resolved_cell(),
                async_module: self.async_module,
                has_side_effect_free_directive: self.has_side_effect_free_directive,
                successful: self.successful,
                source_map: self.source_map,
            },
        ))
    }
}

struct AnalysisState<'a> {
    handler: &'a Handler,
    source: ResolvedVc<Box<dyn Source>>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    compile_time_info: ResolvedVc<CompileTimeInfo>,
    var_graph: &'a VarGraph,
    /// Whether to allow tracing to reference files from the project root. This is used to prevent
    /// random node_modules packages from tracing the entire project due to some dynamic
    /// `path.join(foo, bar)` call.
    allow_project_root_tracing: bool,
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
    // Whether we should collect affecting sources from referenced files. Only usedful when
    // tracing.
    collect_affecting_sources: bool,
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
                    self.allow_project_root_tracing,
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
pub async fn analyze_ecmascript_module(
    module: ResolvedVc<EcmascriptModuleAsset>,
    part: Option<ModulePart>,
) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
    let span = tracing::info_span!(
        "analyze ecmascript module",
        name = display(module.ident().to_string().await?)
    );
    let result = analyze_ecmascript_module_internal(module, part)
        .instrument(span)
        .await;

    match result {
        Ok(result) => Ok(result),
        Err(err) => Err(err.context(format!(
            "failed to analyze ecmascript module '{}'",
            module.ident().to_string().await?
        ))),
    }
}

async fn analyze_ecmascript_module_internal(
    module: ResolvedVc<EcmascriptModuleAsset>,
    part: Option<ModulePart>,
) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
    let raw_module = module.await?;

    let source = raw_module.source;
    let ty = raw_module.ty;
    let transforms = raw_module.transforms;
    let options = raw_module.options;
    let options = options.await?;
    let import_externals = options.import_externals;
    let analyze_mode = options.analyze_mode;

    let origin = ResolvedVc::upcast::<Box<dyn ResolveOrigin>>(module);
    let mut analysis = AnalyzeEcmascriptModuleResultBuilder::new(analyze_mode);
    let path = &*origin.origin_path().await?;

    // Is this a typescript file that requires analyzing type references?
    let analyze_types = match &ty {
        EcmascriptModuleAssetType::Typescript { analyze_types, .. } => *analyze_types,
        EcmascriptModuleAssetType::TypescriptDeclaration => true,
        EcmascriptModuleAssetType::Ecmascript
        | EcmascriptModuleAssetType::EcmascriptExtensionless => false,
    };

    // Split out our module part if we have one.
    let parsed = if let Some(part) = part {
        let split_data = split_module(*module);
        part_of_module(split_data, part)
    } else {
        module.failsafe_parse()
    };

    let ModuleTypeResult {
        module_type: specified_type,
        ref referenced_package_json,
    } = *module.determine_module_type().await?;

    if let Some(package_json) = referenced_package_json {
        let span = tracing::trace_span!("package.json reference");
        async {
            analysis.add_reference(
                PackageJsonReference::new(package_json.clone())
                    .to_resolved()
                    .await?,
            );
            anyhow::Ok(())
        }
        .instrument(span)
        .await?;
    }

    if analyze_types {
        let span = tracing::trace_span!("tsconfig reference");
        async {
            match &*find_context_file(path.parent(), tsconfig(), false).await? {
                FindContextFileResult::Found(tsconfig, _) => {
                    analysis.add_reference(
                        TsConfigReference::new(*origin, tsconfig.clone())
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

    let parsed = if !analyze_mode.is_code_gen() {
        // We are never code-gening the module, so we can drop the AST after the analysis.
        parsed.final_read_hint().await?
    } else {
        parsed.await?
    };

    let ParseResult::Ok {
        program,
        globals,
        eval_context,
        comments,
        source_map,
        ..
    } = &*parsed
    else {
        return analysis.build(Default::default(), false).await;
    };

    let has_side_effect_free_directive = match program {
        Program::Module(module) => Either::Left(
            module
                .body
                .iter()
                .take_while(|i| match i {
                    ModuleItem::Stmt(stmt) => stmt.directive_continue(),
                    ModuleItem::ModuleDecl(_) => false,
                })
                .filter_map(|i| i.as_stmt()),
        ),
        Program::Script(script) => Either::Right(
            script
                .body
                .iter()
                .take_while(|stmt| stmt.directive_continue()),
        ),
    }
    .any(|f| match f {
        Stmt::Expr(ExprStmt { expr, .. }) => match &**expr {
            Expr::Lit(Lit::Str(Str { value, .. })) => value == "use turbopack no side effects",
            _ => false,
        },
        _ => false,
    });
    analysis.set_has_side_effect_free_directive(has_side_effect_free_directive);

    let is_esm = eval_context.is_esm(specified_type);
    let compile_time_info = compile_time_info_for_module_options(
        *raw_module.compile_time_info,
        is_esm,
        options.enable_typeof_window_inlining,
    )
    .to_resolved()
    .await?;

    let pos = program.span().lo;
    if analyze_types {
        let span = tracing::trace_span!("type references");
        async {
            if let Some(comments) = comments.get_leading(pos) {
                for comment in comments.iter() {
                    if let CommentKind::Line = comment.kind {
                        static REFERENCE_PATH: LazyLock<Regex> = LazyLock::new(|| {
                            Regex::new(r#"^/\s*<reference\s*path\s*=\s*["'](.+)["']\s*/>\s*$"#)
                                .unwrap()
                        });
                        static REFERENCE_TYPES: LazyLock<Regex> = LazyLock::new(|| {
                            Regex::new(r#"^/\s*<reference\s*types\s*=\s*["'](.+)["']\s*/>\s*$"#)
                                .unwrap()
                        });
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
        let span = tracing::trace_span!("source map reference");
        async {
            if let Some((source_map, reference)) = parse_source_map_comment(
                source,
                Either::Left(comments),
                &*origin.origin_path().await?,
            )
            .await?
            {
                analysis.set_source_map(source_map);
                if let Some(reference) = reference {
                    analysis.add_reference(reference);
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
        let _span = tracing::trace_span!("analyze variable values").entered();
        set_handler_and_globals(&handler, globals, || {
            create_graph(program, eval_context, analyze_mode)
        })
    };

    let span = tracing::trace_span!("esm import references");
    let import_references = async {
        let mut import_references = Vec::with_capacity(eval_context.imports.references().len());
        for (i, r) in eval_context.imports.references().enumerate() {
            let mut should_add_evaluation = false;
            let reference = EsmAssetReference::new(
                origin,
                RcStr::from(&*r.module_path),
                r.issue_source
                    .unwrap_or_else(|| IssueSource::from_source_only(source)),
                r.annotations.clone(),
                match &r.imported_symbol {
                    ImportedSymbol::ModuleEvaluation => {
                        should_add_evaluation = true;
                        Some(ModulePart::evaluation())
                    }
                    ImportedSymbol::Symbol(name) => Some(ModulePart::export((&**name).into())),
                    ImportedSymbol::PartEvaluation(part_id) | ImportedSymbol::Part(part_id) => {
                        if !matches!(
                            options.tree_shaking_mode,
                            Some(TreeShakingMode::ModuleFragments)
                        ) {
                            bail!(
                                "Internal imports only exist in reexports only mode when \
                                 importing {:?} from {}",
                                r.imported_symbol,
                                r.module_path
                            );
                        }
                        if matches!(&r.imported_symbol, ImportedSymbol::PartEvaluation(_)) {
                            should_add_evaluation = true;
                        }
                        Some(ModulePart::internal(*part_id))
                    }
                    ImportedSymbol::Exports => matches!(
                        options.tree_shaking_mode,
                        Some(TreeShakingMode::ModuleFragments)
                    )
                    .then(ModulePart::exports),
                },
                import_externals,
            )
            .resolved_cell();

            import_references.push(reference);
            if should_add_evaluation {
                analysis.add_esm_evaluation_reference(i);
            }
        }
        anyhow::Ok(import_references)
    }
    .instrument(span)
    .await?;

    let span = tracing::trace_span!("exports");
    let (webpack_runtime, webpack_entry, webpack_chunks) = async {
        let (webpack_runtime, webpack_entry, webpack_chunks, mut esm_exports) =
            set_handler_and_globals(&handler, globals, || {
                // TODO migrate to effects
                let mut visitor = ModuleReferencesVisitor::new(
                    eval_context,
                    &import_references,
                    &mut analysis,
                    analyze_mode,
                );
                // ModuleReferencesVisitor has already called analysis.add_esm_reexport_reference
                // for any references in esm_exports
                program.visit_with_ast_path(&mut visitor, &mut Default::default());
                (
                    visitor.webpack_runtime,
                    visitor.webpack_entry,
                    visitor.webpack_chunks,
                    visitor.esm_exports,
                )
            });

        let mut esm_star_exports: Vec<ResolvedVc<Box<dyn ModuleReference>>> = vec![];
        for (i, reexport) in eval_context.imports.reexports() {
            let reference = import_references[i];
            match reexport {
                Reexport::Star => {
                    esm_star_exports.push(ResolvedVc::upcast(reference));
                    analysis.add_esm_reexport_reference(i);
                }
                Reexport::Namespace { exported: n } => {
                    esm_exports.insert(
                        n.as_str().into(),
                        EsmExport::ImportedNamespace(ResolvedVc::upcast(reference)),
                    );
                    analysis.add_esm_reexport_reference(i);
                }
                Reexport::Named { imported, exported } => {
                    esm_exports.insert(
                        exported.as_str().into(),
                        EsmExport::ImportedBinding(
                            ResolvedVc::upcast(reference),
                            imported.to_string().into(),
                            false,
                        ),
                    );
                    analysis.add_esm_reexport_reference(i);
                }
            }
        }

        let exports = if !esm_exports.is_empty() || !esm_star_exports.is_empty() {
            if specified_type == SpecifiedModuleType::CommonJs {
                SpecifiedModuleTypeIssue {
                    // TODO(PACK-4879): this should point at one of the exports
                    source: IssueSource::from_source_only(source),
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
                        // TODO(PACK-4879): this should point at the source location of the commonjs
                        // export
                        source: IssueSource::from_source_only(source),
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
        let span = tracing::trace_span!("webpack runtime reference");
        async {
            let request = Request::parse(request.into()).to_resolved().await?;
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
    // TODO: we can do this when constructing the var graph
    let span = tracing::trace_span!("async module handling");
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
                IssueSeverity::Error,
                source.ident(),
                Vc::cell(rcstr!("unexpected top level await")),
                StyledString::Text(rcstr!("top level await is only supported in ESM modules."))
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

    let span = tracing::trace_span!("effects processing");
    async {
        let effects = take(&mut var_graph.effects);

        let mut analysis_state = AnalysisState {
            handler: &handler,
            source,
            origin,
            compile_time_info,
            var_graph: &var_graph,
            allow_project_root_tracing: !source
                .ident()
                .path()
                .await?
                .path
                .contains("/node_modules/"),
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
            collect_affecting_sources: options.analyze_mode.is_tracing(),
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
                    debug_assert!(
                        analyze_mode.is_code_gen(),
                        "unexpected Effect::Unreachable in tracing mode"
                    );

                    analysis
                        .add_code_gen(Unreachable::new(AstPathRange::StartAfter(start_ast_path)));
                }
                Effect::Conditional {
                    condition,
                    kind,
                    ast_path: condition_ast_path,
                    span: _,
                } => {
                    // Don't replace condition with it's truth-y value, if it has side effects
                    // (e.g. function calls)
                    let condition_has_side_effects = condition.has_side_effects();

                    let condition = analysis_state
                        .link_value(*condition, ImportAttributes::empty_ref())
                        .await?;

                    macro_rules! inactive {
                        ($block:ident) => {
                            if analyze_mode.is_code_gen() {
                                analysis.add_code_gen(Unreachable::new($block.range.clone()));
                            }
                        };
                    }
                    macro_rules! condition {
                        ($expr:expr) => {
                            if analyze_mode.is_code_gen() && !condition_has_side_effects {
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
                        ConditionalKind::Labeled { body } => {
                            active!(body);
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
                    if let Some(ignored) = &ignore_effect_span
                        && *ignored == span
                    {
                        continue;
                    }

                    let func = analysis_state
                        .link_value(*func, eval_context.imports.get_attributes(span))
                        .await?;

                    handle_call(
                        &ast_path,
                        span,
                        func,
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
                    if let Some(ignored) = &ignore_effect_span
                        && *ignored == span
                    {
                        continue;
                    }

                    let func = analysis_state
                        .link_value(
                            JsValue::member(obj.clone(), prop),
                            eval_context.imports.get_attributes(span),
                        )
                        .await?;

                    if !new
                        && matches!(
                            func,
                            JsValue::WellKnownFunction(
                                WellKnownFunctionKind::ArrayFilter
                                    | WellKnownFunctionKind::ArrayForEach
                                    | WellKnownFunctionKind::ArrayMap
                            )
                        )
                        && let [EffectArg::Closure(value, block)] = &mut args[..]
                        && let JsValue::Array {
                            items: ref mut values,
                            mutable,
                            ..
                        } = analysis_state
                            .link_value(*obj, eval_context.imports.get_attributes(span))
                            .await?
                    {
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

                    handle_call(
                        &ast_path,
                        span,
                        func,
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
                } => {
                    debug_assert!(
                        analyze_mode.is_code_gen(),
                        "unexpected Effect::FreeVar in tracing mode"
                    );

                    // FreeVar("require") might be turbopackIgnore-d
                    if !analysis_state
                        .link_value(
                            JsValue::FreeVar(var.clone()),
                            eval_context.imports.get_attributes(span),
                        )
                        .await?
                        .is_unknown()
                    {
                        // Call handle free var
                        handle_free_var(
                            &ast_path,
                            JsValue::FreeVar(var),
                            span,
                            &analysis_state,
                            &mut analysis,
                        )
                        .await?;
                    }
                }
                Effect::Member {
                    obj,
                    prop,
                    ast_path,
                    span,
                } => {
                    debug_assert!(
                        analyze_mode.is_code_gen(),
                        "unexpected Effect::Member in tracing mode"
                    );

                    // Intentionally not awaited because `handle_member` reads this only when needed
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
                } => {
                    let Some(r) = import_references.get(esm_reference_index) else {
                        continue;
                    };

                    if let Some("__turbopack_module_id__") = export.as_deref() {
                        analysis.add_reference_code_gen(
                            EsmModuleIdAssetReference::new(*r),
                            ast_path.into(),
                        )
                    } else {
                        if matches!(
                            options.tree_shaking_mode,
                            Some(TreeShakingMode::ReexportsOnly)
                        ) {
                            let original_reference = r.await?;
                            if original_reference.export_name.is_none()
                                && export.is_some()
                                && let Some(export) = export
                            {
                                // Rewrite `import * as ns from 'foo'; foo.bar()` to behave like
                                // `import {bar} from 'foo'; bar()` for tree shaking purposes.
                                let named_reference = analysis
                                    .add_esm_reference_namespace_resolved(
                                        esm_reference_index,
                                        export.clone(),
                                        || {
                                            EsmAssetReference::new(
                                                original_reference.origin,
                                                original_reference.request.clone(),
                                                original_reference.issue_source,
                                                original_reference.annotations.clone(),
                                                Some(ModulePart::export(export.clone())),
                                                original_reference.import_externals,
                                            )
                                            .resolved_cell()
                                        },
                                    );
                                analysis.add_code_gen(EsmBinding::new_keep_this(
                                    named_reference,
                                    Some(export),
                                    ast_path.into(),
                                ));
                                continue;
                            }
                        }

                        analysis.add_esm_reference(esm_reference_index);
                        analysis.add_code_gen(EsmBinding::new(*r, export, ast_path.into()));
                    }
                }
                Effect::TypeOf {
                    arg,
                    ast_path,
                    span,
                } => {
                    debug_assert!(
                        analyze_mode.is_code_gen(),
                        "unexpected Effect::TypeOf in tracing mode"
                    );
                    let arg = analysis_state
                        .link_value(*arg, ImportAttributes::empty_ref())
                        .await?;
                    handle_typeof(&ast_path, arg, span, &analysis_state, &mut analysis).await?;
                }
                Effect::ImportMeta { ast_path, span: _ } => {
                    debug_assert!(
                        analyze_mode.is_code_gen(),
                        "unexpected Effect::ImportMeta in tracing mode"
                    );
                    if analysis_state.first_import_meta {
                        analysis_state.first_import_meta = false;
                        analysis.add_code_gen(ImportMetaBinding::new(
                            source.ident().path().owned().await?,
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

    collector.emit(false).await?;

    analysis
        .build(
            import_references,
            matches!(
                options.tree_shaking_mode,
                Some(TreeShakingMode::ReexportsOnly)
            ),
        )
        .await
}

#[turbo_tasks::function]
async fn compile_time_info_for_module_options(
    compile_time_info: Vc<CompileTimeInfo>,
    is_esm: bool,
    enable_typeof_window_inlining: Option<TypeofWindow>,
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
            DefinableNameSegment::Name(rcstr!("import")),
            DefinableNameSegment::Name(rcstr!("meta")),
            DefinableNameSegment::TypeOf,
        ])
        .or_insert(rcstr!("object").into());
    free_var_references
        .entry(vec![
            DefinableNameSegment::Name(rcstr!("exports")),
            DefinableNameSegment::TypeOf,
        ])
        .or_insert(typeof_exports.into());
    free_var_references
        .entry(vec![
            DefinableNameSegment::Name(rcstr!("module")),
            DefinableNameSegment::TypeOf,
        ])
        .or_insert(typeof_module.into());
    free_var_references
        .entry(vec![
            DefinableNameSegment::Name(rcstr!("require")),
            DefinableNameSegment::TypeOf,
        ])
        .or_insert(rcstr!("function").into());
    free_var_references
        .entry(vec![DefinableNameSegment::Name(rcstr!("require"))])
        .or_insert(require.into());

    let dir_name = rcstr!("__dirname");
    free_var_references
        .entry(vec![
            DefinableNameSegment::Name(dir_name.clone()),
            DefinableNameSegment::TypeOf,
        ])
        .or_insert(rcstr!("string").into());
    free_var_references
        .entry(vec![DefinableNameSegment::Name(dir_name)])
        .or_insert(FreeVarReference::InputRelative(
            InputRelativeConstant::DirName,
        ));
    let file_name = rcstr!("__filename");

    free_var_references
        .entry(vec![
            DefinableNameSegment::Name(file_name.clone()),
            DefinableNameSegment::TypeOf,
        ])
        .or_insert(rcstr!("string").into());
    free_var_references
        .entry(vec![DefinableNameSegment::Name(file_name)])
        .or_insert(FreeVarReference::InputRelative(
            InputRelativeConstant::FileName,
        ));

    // Compiletime rewrite the nodejs `global` to `__turbopack_context_.g` which is a shortcut for
    // `globalThis` that cannot be shadowed by a local variable.
    let global = rcstr!("global");
    free_var_references
        .entry(vec![
            DefinableNameSegment::Name(global.clone()),
            DefinableNameSegment::TypeOf,
        ])
        .or_insert(rcstr!("object").into());
    free_var_references
        .entry(vec![DefinableNameSegment::Name(global)])
        .or_insert(TURBOPACK_GLOBAL.into());

    free_var_references.extend(TURBOPACK_RUNTIME_FUNCTION_SHORTCUTS.into_iter().map(
        |(name, shortcut)| {
            (
                vec![DefinableNameSegment::Name(name.into())],
                shortcut.into(),
            )
        },
    ));
    // A 'free' reference to `this` in an ESM module is meant to be `undefined`
    // Compile time replace it so we can represent module-factories as arrow functions without
    // needing to be defensive about rebinding this. Do the same for CJS modules while we are
    // here.
    let this = rcstr!("this");
    free_var_references
        .entry(vec![DefinableNameSegment::Name(this.clone())])
        .or_insert(if is_esm {
            FreeVarReference::Value(CompileTimeDefineValue::Undefined)
        } else {
            // Insert shortcut which is equivalent to `module.exports` but should
            // not be shadowed by user symbols.
            TURBOPACK_EXPORTS.into()
        });
    free_var_references
        .entry(vec![
            DefinableNameSegment::Name(this),
            DefinableNameSegment::TypeOf,
        ])
        .or_insert(if is_esm {
            rcstr!("undefined").into()
        } else {
            rcstr!("object").into()
        });

    let mut defines = compile_time_info.defines;
    if let Some(enable_typeof_window_inlining) = enable_typeof_window_inlining {
        let value = match enable_typeof_window_inlining {
            TypeofWindow::Object => rcstr!("object"),
            TypeofWindow::Undefined => rcstr!("undefined"),
        };
        let window = rcstr!("window");
        let mut defines_value = defines.owned().await?;
        defines_value
            .entry(vec![
                DefinableNameSegment::Name(window.clone()),
                DefinableNameSegment::TypeOf,
            ])
            .or_insert(value.clone().into());
        free_var_references
            .entry(vec![
                DefinableNameSegment::Name(window),
                DefinableNameSegment::TypeOf,
            ])
            .or_insert(value.into());
        defines = CompileTimeDefines(defines_value).resolved_cell()
    }

    Ok(CompileTimeInfo {
        environment: compile_time_info.environment,
        defines,
        free_var_references: FreeVarReferences(free_var_references).resolved_cell(),
    }
    .cell())
}

async fn handle_call<G: Fn(Vec<Effect>) + Send + Sync>(
    ast_path: &[AstParentKind],
    span: Span,
    func: JsValue,
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
        collect_affecting_sources,
        allow_project_root_tracing,
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

    let make_issue_source =
        || IssueSource::from_swc_offsets(source, span.lo.to_u32(), span.hi.to_u32());
    if new {
        match func {
            JsValue::WellKnownFunction(WellKnownFunctionKind::URLConstructor) => {
                let args = linked_args(args).await?;
                if let [
                    url,
                    JsValue::Member(
                        _,
                        box JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta),
                        box JsValue::Constant(super::analyzer::ConstantValue::Str(meta_prop)),
                    ),
                ] = &args[..]
                    && meta_prop.as_str() == "url"
                {
                    let pat = js_value_to_pattern(url);
                    if !pat.has_constant_parts() {
                        let (args, hints) = explain_args(&args);
                        handler.span_warn_with_code(
                            span,
                            &format!("new URL({args}) is very dynamic{hints}",),
                            DiagnosticId::Lint(
                                errors::failed_to_analyze::ecmascript::NEW_URL_IMPORT_META
                                    .to_string(),
                            ),
                        );
                        if ignore_dynamic_requests {
                            return Ok(());
                        }
                    }
                    analysis.add_reference_code_gen(
                        UrlAssetReference::new(
                            origin,
                            Request::parse(pat).to_resolved().await?,
                            *compile_time_info.environment().rendering().await?,
                            issue_source(source, span),
                            in_try,
                            url_rewrite_behavior.unwrap_or(UrlRewriteBehavior::Relative),
                        ),
                        ast_path.to_vec().into(),
                    );
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
                                errors::failed_to_analyze::ecmascript::NEW_WORKER.to_string(),
                            ),
                        );
                        if ignore_dynamic_requests {
                            return Ok(());
                        }
                    }

                    if *compile_time_info.environment().rendering().await? == Rendering::Client {
                        analysis.add_reference_code_gen(
                            WorkerAssetReference::new(
                                origin,
                                Request::parse(pat).to_resolved().await?,
                                issue_source(source, span),
                                in_try,
                            ),
                            ast_path.to_vec().into(),
                        );
                    }

                    return Ok(());
                }
                // Ignore (e.g. dynamic parameter or string literal), just as Webpack does
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

    let get_traced_project_dir = async || {
        // readFileSync("./foo") should always be relative to the project root, but this is
        // dangerous inside of node_modules as it can cause a lot of false positives in the
        // tracing, if some package does `path.join(dynamic)`, it would include everything from
        // the project root as well.
        if allow_project_root_tracing {
            compile_time_info.environment().cwd().owned().await
        } else {
            Ok(Some(source.ident().path().await?.parent()))
        }
    };

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
                                    && key.as_str() == "with"
                                {
                                    return Some(value);
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
                            errors::failed_to_analyze::ecmascript::DYNAMIC_IMPORT.to_string(),
                        ),
                    );
                    if ignore_dynamic_requests {
                        analysis
                            .add_code_gen(DynamicExpression::new_promise(ast_path.to_vec().into()));
                        return Ok(());
                    }
                }
                analysis.add_reference_code_gen(
                    EsmAsyncAssetReference::new(
                        origin,
                        Request::parse(pat).to_resolved().await?,
                        issue_source(source, span),
                        import_annotations,
                        in_try,
                        state.import_externals,
                    ),
                    ast_path.to_vec().into(),
                );
                return Ok(());
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!("import({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::DYNAMIC_IMPORT.to_string(),
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
                            errors::failed_to_analyze::ecmascript::REQUIRE.to_string(),
                        ),
                    );
                    if ignore_dynamic_requests {
                        analysis.add_code_gen(DynamicExpression::new(ast_path.to_vec().into()));
                        return Ok(());
                    }
                }
                analysis.add_reference_code_gen(
                    CjsRequireAssetReference::new(
                        origin,
                        Request::parse(pat).to_resolved().await?,
                        issue_source(source, span),
                        in_try,
                    ),
                    ast_path.to_vec().into(),
                );
                return Ok(());
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!("require({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(errors::failed_to_analyze::ecmascript::REQUIRE.to_string()),
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
                // analyze-able with ignore_dynamic_requests = true
                let pat = js_value_to_pattern(&args[0]);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(&args);
                    handler.span_warn_with_code(
                        span,
                        &format!("require.resolve({args}) is very dynamic{hints}",),
                        DiagnosticId::Lint(
                            errors::failed_to_analyze::ecmascript::REQUIRE_RESOLVE.to_string(),
                        ),
                    );
                    if ignore_dynamic_requests {
                        analysis.add_code_gen(DynamicExpression::new(ast_path.to_vec().into()));
                        return Ok(());
                    }
                }
                analysis.add_reference_code_gen(
                    CjsRequireResolveAssetReference::new(
                        origin,
                        Request::parse(pat).to_resolved().await?,
                        issue_source(source, span),
                        in_try,
                    ),
                    ast_path.to_vec().into(),
                );
                return Ok(());
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!("require.resolve({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::REQUIRE_RESOLVE.to_string(),
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
                            errors::failed_to_analyze::ecmascript::REQUIRE_CONTEXT.to_string(),
                        ),
                    );
                    return Ok(());
                }
            };

            analysis.add_reference_code_gen(
                RequireContextAssetReference::new(
                    source,
                    origin,
                    options.dir,
                    options.include_subdirs,
                    options.filter.cell(),
                    Some(issue_source(source, span)),
                    in_try,
                )
                .await?,
                ast_path.to_vec().into(),
            );
        }

        JsValue::WellKnownFunction(WellKnownFunctionKind::FsReadMethod(name))
            if analysis.analyze_mode.is_tracing() =>
        {
            let args = linked_args(args).await?;
            if !args.is_empty() {
                let pat = js_value_to_pattern(&args[0]);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(&args);
                    handler.span_warn_with_code(
                        span,
                        &format!("fs.{name}({args}) is very dynamic{hints}",),
                        DiagnosticId::Lint(
                            errors::failed_to_analyze::ecmascript::FS_METHOD.to_string(),
                        ),
                    );
                    if ignore_dynamic_requests {
                        return Ok(());
                    }
                }
                if let Some(context_dir) = get_traced_project_dir().await? {
                    analysis.add_reference(
                        FileSourceReference::new(
                            context_dir,
                            Pattern::new(pat),
                            collect_affecting_sources,
                            make_issue_source(),
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
                &format!("fs.{name}({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(errors::failed_to_analyze::ecmascript::FS_METHOD.to_string()),
            )
        }

        JsValue::WellKnownFunction(WellKnownFunctionKind::PathResolve(..))
            if analysis.analyze_mode.is_tracing() =>
        {
            let parent_path = origin.origin_path().owned().await?.parent();
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
                        errors::failed_to_analyze::ecmascript::PATH_METHOD.to_string(),
                    ),
                );
                if ignore_dynamic_requests {
                    return Ok(());
                }
            }
            if let Some(context_dir) = get_traced_project_dir().await? {
                analysis.add_reference(
                    DirAssetReference::new(context_dir, Pattern::new(pat), make_issue_source())
                        .to_resolved()
                        .await?,
                );
            }
            return Ok(());
        }

        JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin)
            if analysis.analyze_mode.is_tracing() =>
        {
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
                        errors::failed_to_analyze::ecmascript::PATH_METHOD.to_string(),
                    ),
                );
                if ignore_dynamic_requests {
                    return Ok(());
                }
            }
            if let Some(context_dir) = get_traced_project_dir().await? {
                analysis.add_reference(
                    DirAssetReference::new(context_dir, Pattern::new(pat), make_issue_source())
                        .to_resolved()
                        .await?,
                );
            }
            return Ok(());
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::ChildProcessSpawnMethod(name))
            if analysis.analyze_mode.is_tracing() =>
        {
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
                                Request::parse(pat),
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
                if (!dynamic || !ignore_dynamic_requests)
                    && let Some(context_dir) = get_traced_project_dir().await?
                {
                    analysis.add_reference(
                        FileSourceReference::new(
                            context_dir,
                            Pattern::new(pat),
                            collect_affecting_sources,
                            IssueSource::from_swc_offsets(
                                source,
                                span.lo.to_u32(),
                                span.hi.to_u32(),
                            ),
                        )
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
                            errors::failed_to_analyze::ecmascript::CHILD_PROCESS_SPAWN.to_string(),
                        ),
                    );
                }
                return Ok(());
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!("child_process.{name}({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::CHILD_PROCESS_SPAWN.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::ChildProcessFork)
            if analysis.analyze_mode.is_tracing() =>
        {
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
                            errors::failed_to_analyze::ecmascript::CHILD_PROCESS_SPAWN.to_string(),
                        ),
                    );
                    if ignore_dynamic_requests {
                        return Ok(());
                    }
                }
                analysis.add_reference(
                    CjsAssetReference::new(
                        *origin,
                        Request::parse(pat),
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
                &format!("child_process.fork({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::CHILD_PROCESS_SPAWN.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::NodePreGypFind)
            if analysis.analyze_mode.is_tracing() =>
        {
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
                            errors::failed_to_analyze::ecmascript::NODE_PRE_GYP_FIND.to_string(),
                        ),
                    );
                    // Always ignore this dynamic request
                    return Ok(());
                }
                analysis.add_reference(
                    NodePreGypConfigReference::new(
                        origin.origin_path().await?.parent(),
                        Pattern::new(pat),
                        compile_time_info.environment().compile_target(),
                        collect_affecting_sources,
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
                     analyze-able{hints}",
                ),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::NODE_PRE_GYP_FIND.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeGypBuild)
            if analysis.analyze_mode.is_tracing() =>
        {
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
                        .await?
                        .root()
                        .await?
                        .join(s.trim_start_matches("/ROOT/"))?;
                    analysis.add_reference(
                        NodeGypBuildReference::new(
                            current_context,
                            collect_affecting_sources,
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
                    "require('node-gyp-build')({args}) is not statically analyze-able{hints}",
                ),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::NODE_GYP_BUILD.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeBindings)
            if analysis.analyze_mode.is_tracing() =>
        {
            use turbopack_resolve::node_native_binding::NodeBindingsReference;

            let args = linked_args(args).await?;
            if args.len() == 1 {
                let first_arg = state
                    .link_value(args[0].clone(), ImportAttributes::empty_ref())
                    .await?;
                if let Some(s) = first_arg.as_str() {
                    analysis.add_reference(
                        NodeBindingsReference::new(
                            origin.origin_path().owned().await?,
                            s.into(),
                            collect_affecting_sources,
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
                &format!("require('bindings')({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::NODE_BINDINGS.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeExpressSet)
            if analysis.analyze_mode.is_tracing() =>
        {
            let args = linked_args(args).await?;
            if args.len() == 2
                && let Some(s) = args.first().and_then(|arg| arg.as_str())
            {
                let pkg_or_dir = args.get(1).unwrap();
                let pat = js_value_to_pattern(pkg_or_dir);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(&args);
                    handler.span_warn_with_code(
                        span,
                        &format!("require('express')().set({args}) is very dynamic{hints}",),
                        DiagnosticId::Lint(
                            errors::failed_to_analyze::ecmascript::NODE_EXPRESS.to_string(),
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
                                                JsValue::FreeVar(atom!("__dirname")),
                                                pkg_or_dir.clone(),
                                            ],
                                        ),
                                        ImportAttributes::empty_ref(),
                                    )
                                    .await?;
                                js_value_to_pattern(&linked_func_call)
                            };
                            if let Some(context_dir) = get_traced_project_dir().await? {
                                analysis.add_reference(
                                    DirAssetReference::new(
                                        context_dir,
                                        Pattern::new(abs_pattern),
                                        make_issue_source(),
                                    )
                                    .to_resolved()
                                    .await?,
                                );
                            }
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
                                        Request::parse(pat),
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
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!("require('express')().set({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::NODE_EXPRESS.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeStrongGlobalizeSetRootDir)
            if analysis.analyze_mode.is_tracing() =>
        {
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
                                    JsValue::FreeVar(atom!("__dirname")),
                                    p.into(),
                                    atom!("intl").into(),
                                ],
                            ),
                            ImportAttributes::empty_ref(),
                        )
                        .await?;
                    js_value_to_pattern(&linked_func_call)
                };
                if let Some(context_dir) = get_traced_project_dir().await? {
                    analysis.add_reference(
                        DirAssetReference::new(
                            context_dir,
                            Pattern::new(abs_pattern),
                            make_issue_source(),
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
                &format!(
                    "require('strong-globalize').SetRootDir({args}) is not statically \
                     analyze-able{hints}",
                ),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::NODE_GYP_BUILD.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeResolveFrom)
            if analysis.analyze_mode.is_tracing() =>
        {
            let args = linked_args(args).await?;
            if args.len() == 2 && args.get(1).and_then(|arg| arg.as_str()).is_some() {
                analysis.add_reference(
                    CjsAssetReference::new(
                        *origin,
                        Request::parse(js_value_to_pattern(&args[1])),
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
                &format!("require('resolve-from')({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::NODE_RESOLVE_FROM.to_string(),
                ),
            )
        }
        JsValue::WellKnownFunction(WellKnownFunctionKind::NodeProtobufLoad)
            if analysis.analyze_mode.is_tracing() =>
        {
            let args = linked_args(args).await?;
            if args.len() == 2
                && let Some(JsValue::Object { parts, .. }) = args.get(1)
            {
                if let Some(context_dir) = get_traced_project_dir().await? {
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
                                context_dir.clone(),
                                Pattern::new(Pattern::Constant(dir.into())),
                                make_issue_source(),
                            )
                            .to_resolved()
                        })
                        .try_join()
                        .await?;

                    for resolved_dir_ref in resolved_dirs {
                        analysis.add_reference(resolved_dir_ref);
                    }
                }

                return Ok(());
            }
            let (args, hints) = explain_args(&args);
            handler.span_warn_with_code(
                span,
                &format!(
                    "require('@grpc/proto-loader').load({args}) is not statically \
                     analyze-able{hints}",
                ),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::NODE_PROTOBUF_LOADER.to_string(),
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
        let prop_seg = DefinableNameSegment::Name(prop.into());

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
            if let Some(def_name_len) = obj.get_definable_name_len() {
                for (name, value) in references {
                    if name.len() != def_name_len {
                        continue;
                    }

                    let it = name.iter().map(Cow::Borrowed).rev();
                    if it.eq(obj.iter_definable_name_rev())
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

        if is_prop_cache
            && let JsValue::WellKnownFunction(WellKnownFunctionKind::Require) =
                obj.as_ref().unwrap()
        {
            analysis.add_code_gen(CjsRequireCacheAccess::new(ast_path.to_vec().into()));
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
        state.var_graph,
        &*state.free_var_references,
        &DefinableNameSegment::TypeOf,
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
    if let Some(def_name_len) = var.get_definable_name_len() {
        let first = var.iter_definable_name_rev().next().unwrap();
        if let Some(references) = state.free_var_references.get(&*first) {
            for (name, value) in references {
                if name.len() + 1 != def_name_len {
                    continue;
                }

                let it = name.iter().map(Cow::Borrowed).rev();
                if it.eq(var.iter_definable_name_rev().skip(1)) {
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
        // Matches assignments to members
        [
            ..,
            AstParentKind::AssignExpr(AssignExprField::Left),
            AstParentKind::AssignTarget(AssignTargetField::Simple),
            AstParentKind::SimpleAssignTarget(SimpleAssignTargetField::Member),
        ] |
        // Matches assignments to identifiers
        [
            ..,
            AstParentKind::AssignExpr(AssignExprField::Left),
            AstParentKind::AssignTarget(AssignTargetField::Simple),
            AstParentKind::SimpleAssignTarget(SimpleAssignTargetField::Ident),
            AstParentKind::BindingIdent(BindingIdentField::Id),
        ]
    ) {
        return Ok(false);
    }

    match value {
        FreeVarReference::Error(error_message) => state.handler.span_err_with_code(
            span,
            error_message,
            DiagnosticId::Error(
                errors::failed_to_analyze::ecmascript::FREE_VAR_REFERENCE.to_string(),
            ),
        ),
        FreeVarReference::Value(value) => {
            analysis.add_code_gen(ConstantValueCodeGen::new(
                value.clone(),
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
            let esm_reference = analysis
                .add_esm_reference_free_var(request.clone(), async || {
                    // There would be no import in the first place if you don't reference the given
                    // free var (e.g. `process`). This means that it's also fine to remove the
                    // import again if the variable reference turns out be dead code in some later
                    // stage of the build, thus mark the import call as /*@__PURE__*/.
                    Ok(EsmAssetReference::new_pure(
                        if let Some(lookup_path) = lookup_path {
                            ResolvedVc::upcast(
                                PlainResolveOrigin::new(
                                    state.origin.asset_context(),
                                    lookup_path.clone(),
                                )
                                .to_resolved()
                                .await?,
                            )
                        } else {
                            state.origin
                        },
                        request.clone(),
                        IssueSource::from_swc_offsets(
                            state.source,
                            span.lo.to_u32(),
                            span.hi.to_u32(),
                        ),
                        Default::default(),
                        match state.tree_shaking_mode {
                            Some(
                                TreeShakingMode::ModuleFragments | TreeShakingMode::ReexportsOnly,
                            ) => export.clone().map(ModulePart::export),
                            None => None,
                        },
                        state.import_externals,
                    )
                    .resolved_cell())
                })
                .await?;

            analysis.add_code_gen(EsmBinding::new(
                esm_reference,
                export.clone(),
                ast_path.to_vec().into(),
            ));
        }
        FreeVarReference::InputRelative(kind) => {
            let source_path = (*state.source).ident().path().owned().await?;
            let source_path = match kind {
                InputRelativeConstant::DirName => source_path.parent(),
                InputRelativeConstant::FileName => source_path,
            };
            analysis.add_code_gen(ConstantValueCodeGen::new(
                as_abs_path(source_path).into(),
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
                DiagnosticId::Error(errors::failed_to_analyze::ecmascript::AMD_DEFINE.to_string()),
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
                            errors::failed_to_analyze::ecmascript::AMD_DEFINE.to_string(),
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
                DiagnosticId::Error(errors::failed_to_analyze::ecmascript::AMD_DEFINE.to_string()),
            );
        }
    }

    if id.is_some() {
        handler.span_warn_with_code(
            span,
            "passing an ID to AMD define() is not yet fully supported",
            DiagnosticId::Lint(errors::failed_to_analyze::ecmascript::AMD_DEFINE.to_string()),
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
pub fn as_abs_path(path: FileSystemPath) -> String {
    // TODO: This should be updated to generate a real system path on the fly
    // during runtime, so that the generated code is constant between systems
    // but the runtime evaluation can take into account the project's
    // actual root directory.
    require_resolve(path)
}

/// Generates an absolute path usable for `require.resolve()` calls.
fn require_resolve(path: FileSystemPath) -> String {
    format!("/ROOT/{}", path.path.as_str())
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
        DefinableNameSegment,
        FxIndexMap<Vec<DefinableNameSegment>, ResolvedVc<FreeVarReference>>,
    >,
    var_graph: &VarGraph,
    attributes: &ImportAttributes,
    allow_project_root_tracing: bool,
) -> Result<(JsValue, bool)> {
    let (mut v, modified) = value_visitor_inner(
        origin,
        v,
        compile_time_info,
        free_var_references,
        var_graph,
        attributes,
        allow_project_root_tracing,
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
        DefinableNameSegment,
        FxIndexMap<Vec<DefinableNameSegment>, ResolvedVc<FreeVarReference>>,
    >,
    var_graph: &VarGraph,
    attributes: &ImportAttributes,
    allow_project_root_tracing: bool,
) -> Result<(JsValue, bool)> {
    let ImportAttributes { ignore, .. } = *attributes;
    // This check is just an optimization
    if v.get_definable_name_len().is_some() {
        let compile_time_info = compile_time_info.await?;
        if let JsValue::TypeOf(_, arg) = &v
            && let Some(value) = arg.match_free_var_reference(
                var_graph,
                free_var_references,
                &DefinableNameSegment::TypeOf,
            )
        {
            return Ok(((&*value.await?).try_into()?, true));
        }

        if let Some(value) = v.match_define(&*compile_time_info.defines.individual().await?) {
            return Ok(((&*value.await?).try_into()?, true));
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
            // TODO: figure out how to do static analysis without invalidating the whole
            // analysis when a new file gets added
            v.into_unknown(
                true,
                "require.context() static analysis is currently limited",
            )
        }
        JsValue::Call(
            _,
            box JsValue::WellKnownFunction(WellKnownFunctionKind::CreateRequire),
            ref args,
        ) => {
            // Only support `createRequire(import.meta.url)` for now
            if let [
                JsValue::Member(
                    _,
                    box JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta),
                    box JsValue::Constant(super::analyzer::ConstantValue::Str(prop)),
                ),
            ] = &args[..]
                && prop.as_str() == "url"
            {
                JsValue::WellKnownFunction(WellKnownFunctionKind::Require)
            } else {
                v.into_unknown(true, "createRequire() non constant")
            }
        }
        JsValue::New(
            _,
            box JsValue::WellKnownFunction(WellKnownFunctionKind::URLConstructor),
            ref args,
        ) => {
            if let [
                JsValue::Constant(super::analyzer::ConstantValue::Str(url)),
                JsValue::Member(
                    _,
                    box JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta),
                    box JsValue::Constant(super::analyzer::ConstantValue::Str(prop)),
                ),
            ] = &args[..]
            {
                if prop.as_str() == "url" {
                    JsValue::Url(url.clone(), JsValueUrlKind::Relative)
                } else {
                    v.into_unknown(true, "new URL() non constant")
                }
            } else {
                v.into_unknown(true, "new non constant")
            }
        }
        JsValue::WellKnownFunction(
            WellKnownFunctionKind::PathJoin
            | WellKnownFunctionKind::PathResolve(_)
            | WellKnownFunctionKind::FsReadMethod(_),
        ) => {
            if ignore {
                return Ok((
                    JsValue::unknown(v, true, "ignored well known function"),
                    true,
                ));
            } else {
                return Ok((v, false));
            }
        }
        JsValue::FreeVar(ref kind) => match &**kind {
            "__dirname" => as_abs_path(origin.origin_path().owned().await?.parent()).into(),
            "__filename" => as_abs_path(origin.origin_path().owned().await?).into(),

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
            let (mut v, mut modified) =
                replace_well_known(v, compile_time_info, allow_project_root_tracing).await?;
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
        let request = Request::parse(pat.clone());
        let resolved = cjs_resolve_source(
            origin,
            request,
            CommonJsReferenceSubType::Undefined,
            None,
            true,
        )
        .resolve()
        .await?;
        let mut values = resolved
            .primary_sources()
            .await?
            .iter()
            .map(|&source| async move {
                Ok(require_resolve(source.ident().path().owned().await?).into())
            })
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
            ));
        }
    };

    let dir = origin
        .origin_path()
        .owned()
        .await?
        .parent()
        .join(options.dir.as_str())?;

    let map = RequireContextMap::generate(
        origin,
        dir,
        options.include_subdirs,
        options.filter.cell(),
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
    analyze_mode: AnalyzeMode,
    eval_context: &'a EvalContext,
    old_analyzer: StaticAnalyser,
    import_references: &'a [ResolvedVc<EsmAssetReference>],
    analysis: &'a mut AnalyzeEcmascriptModuleResultBuilder,
    esm_exports: BTreeMap<RcStr, EsmExport>,
    webpack_runtime: Option<(RcStr, Span)>,
    webpack_entry: bool,
    webpack_chunks: Vec<Lit>,
}

impl<'a> ModuleReferencesVisitor<'a> {
    fn new(
        eval_context: &'a EvalContext,
        import_references: &'a [ResolvedVc<EsmAssetReference>],
        analysis: &'a mut AnalyzeEcmascriptModuleResultBuilder,
        analyze_mode: AnalyzeMode,
    ) -> Self {
        Self {
            analyze_mode,
            eval_context,
            old_analyzer: StaticAnalyser::default(),
            import_references,
            analysis,
            esm_exports: BTreeMap::new(),
            webpack_runtime: None,
            webpack_entry: false,
            webpack_chunks: Vec::new(),
        }
    }
}

fn as_parent_path(ast_path: &AstNodePath<AstParentNodeRef<'_>>) -> Vec<AstParentKind> {
    ast_path.iter().map(|n| n.kind()).collect()
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
        if self.analyze_mode.is_code_gen() {
            self.analysis
                .add_code_gen(EsmModuleItem::new(as_parent_path(ast_path).into()));
        }
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
                fn to_rcstr(name: &ModuleExportName) -> RcStr {
                    name.atom().as_str().into()
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
                        let key = to_rcstr(exported.as_ref().unwrap_or(orig));
                        let binding_name = to_rcstr(orig);
                        let export = {
                            let imported_binding = if let ModuleExportName::Ident(ident) = orig {
                                self.eval_context.imports.get_binding(&ident.to_id())
                            } else {
                                None
                            };
                            if let Some((index, export)) = imported_binding {
                                let esm_ref = self.import_references[index];
                                self.analysis.add_esm_reexport_reference(index);
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
                                EsmExport::LocalBinding(
                                    binding_name,
                                    if is_fake_esm {
                                        Liveness::Mutable
                                    } else {
                                        // If this is `export {foo} from 'mod'` and `foo` is a const
                                        // in mod then we could export as Const here.
                                        Liveness::Live
                                    },
                                )
                            }
                        };
                        self.esm_exports.insert(key, export);
                    }
                }
            }
        }

        if self.analyze_mode.is_code_gen() {
            self.analysis
                .add_code_gen(EsmModuleItem::new(as_parent_path(ast_path).into()));
        }
        export.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_export_decl<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportDecl,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        {
            let decl: &Decl = &export.decl;
            let insert_export_binding = &mut |name: RcStr, liveness: Liveness| {
                self.esm_exports
                    .insert(name.clone(), EsmExport::LocalBinding(name, liveness));
            };
            match decl {
                Decl::Class(ClassDecl { ident, .. }) | Decl::Fn(FnDecl { ident, .. }) => {
                    // TODO: examine whether the value is ever mutated rather than just checking
                    // 'const'
                    insert_export_binding(ident.sym.as_str().into(), Liveness::Live);
                }
                Decl::Var(var_decl) => {
                    // TODO: examine whether the value is ever mutated rather than just checking
                    // 'const'
                    let liveness = match var_decl.kind {
                        VarDeclKind::Var => Liveness::Live,
                        VarDeclKind::Let => Liveness::Live,
                        VarDeclKind::Const => Liveness::Constant,
                    };
                    let decls = &*var_decl.decls;
                    decls.iter().for_each(|VarDeclarator { name, .. }| {
                        for_each_ident_in_pat(name, &mut |name| {
                            insert_export_binding(name, liveness)
                        })
                    });
                }
                Decl::Using(_) => {
                    // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export#:~:text=You%20cannot%20use%20export%20on%20a%20using%20or%20await%20using%20declaration
                    unreachable!("using declarations can not be exported");
                }
                Decl::TsInterface(_)
                | Decl::TsTypeAlias(_)
                | Decl::TsEnum(_)
                | Decl::TsModule(_) => {
                    // ignore typescript for code generation
                }
            }
        };
        if self.analyze_mode.is_code_gen() {
            self.analysis
                .add_code_gen(EsmModuleItem::new(as_parent_path(ast_path).into()));
        }
        export.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_export_default_expr<'ast: 'r, 'r>(
        &mut self,
        export: &'ast ExportDefaultExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        self.esm_exports.insert(
            rcstr!("default"),
            EsmExport::LocalBinding(
                magic_identifier::mangle("default export").into(),
                // The expression passed to `export default` cannot be mutated
                Liveness::Constant,
            ),
        );
        if self.analyze_mode.is_code_gen() {
            self.analysis
                .add_code_gen(EsmModuleItem::new(as_parent_path(ast_path).into()));
        }
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
                    rcstr!("default"),
                    EsmExport::LocalBinding(
                        ident
                            .as_ref()
                            .map(|i| i.sym.as_str().into())
                            .unwrap_or_else(|| magic_identifier::mangle("default export").into()),
                        // Default export declarations can only be mutated if they have a name.
                        if ident.is_some() {
                            Liveness::Live
                        } else {
                            Liveness::Constant
                        },
                    ),
                );
            }
            DefaultDecl::TsInterfaceDecl(..) => {
                // ignore
            }
        }
        if self.analyze_mode.is_code_gen() {
            self.analysis
                .add_code_gen(EsmModuleItem::new(as_parent_path(ast_path).into()));
        }
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
                        self.old_analyzer.imports.insert(
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
                    self.old_analyzer.imports.insert(
                        default_import.local.sym.to_string(),
                        (src.clone(), vec!["default".to_string()]),
                    );
                }
                ImportSpecifier::Namespace(namespace) => {
                    self.old_analyzer
                        .imports
                        .insert(namespace.local.sym.to_string(), (src.clone(), Vec::new()));
                }
            }
        }
        if self.analyze_mode.is_code_gen() {
            self.analysis.add_code_gen(EsmModuleItem::new(path));
        }
    }

    fn visit_var_declarator<'ast: 'r, 'r>(
        &mut self,
        decl: &'ast VarDeclarator,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if let Some(ident) = decl.name.as_ident()
            && &*ident.id.sym == "__webpack_require__"
            && let Some(init) = &decl.init
            && let Some(call) = init.as_call()
            && let Some(expr) = call.callee.as_expr()
            && let Some(ident) = expr.as_ident()
            && &*ident.sym == "require"
            && let [ExprOrSpread { spread: None, expr }] = &call.args[..]
            && let Some(Lit::Str(str)) = expr.as_lit()
        {
            self.webpack_runtime = Some((str.value.as_str().into(), call.span));
            return;
        }
        decl.visit_children_with_ast_path(self, ast_path);
    }

    fn visit_call_expr<'ast: 'r, 'r>(
        &mut self,
        call: &'ast CallExpr,
        ast_path: &mut AstNodePath<AstParentNodeRef<'r>>,
    ) {
        if let Callee::Expr(expr) = &call.callee
            && let StaticExpr::FreeVar(var) = self.old_analyzer.evaluate_expr(expr)
        {
            match &var[..] {
                [webpack_require, property]
                    if webpack_require == "__webpack_require__" && property == "C" =>
                {
                    self.webpack_entry = true;
                }
                [webpack_require, property]
                    if webpack_require == "__webpack_require__" && property == "X" =>
                {
                    if let [
                        _,
                        ExprOrSpread {
                            spread: None,
                            expr: chunk_ids,
                        },
                        _,
                    ] = &call.args[..]
                        && let Some(array) = chunk_ids.as_array()
                    {
                        for elem in array.elems.iter().flatten() {
                            if let ExprOrSpread { spread: None, expr } = elem
                                && let Some(lit) = expr.as_lit()
                            {
                                self.webpack_chunks.push(lit.clone());
                            }
                        }
                    }
                }
                _ => {}
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
    let ty = ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined);
    let options = origin.resolve_options(ty.clone()).await?;

    let options = apply_cjs_specific_options(options);

    let resolved = resolve(
        origin.origin_path().await?.parent(),
        ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined),
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

pub static TURBOPACK_HELPER: Lazy<Atom> = Lazy::new(|| atom!("__turbopack-helper__"));

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
    use swc_core::ecma::visit::{Visit, VisitWith, visit_obj_and_computed};

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

            if let Expr::Member(member) = n
                && member.obj.is_ident_ref_to("__turbopack_context__")
                && let MemberProp::Ident(prop) = &member.prop
            {
                const TURBOPACK_EXPORT_VALUE_SHORTCUT: &str = TURBOPACK_EXPORT_VALUE.shortcut;
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
            if num.is_zero()
                && let JsValue::Array {
                    total_nodes: _,
                    items,
                    mutable: _,
                } = &args[1]
            {
                // Is `-e` one of the arguments passed to the program?
                if items.iter().any(|e| {
                    if let JsValue::Constant(JsConstantValue::Str(ConstantString::Atom(arg))) = e {
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

    false
}
