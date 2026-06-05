pub mod amd;
pub mod async_module;
pub mod cjs;
pub mod constant_condition;
pub mod constant_value;
pub mod dynamic_expression;
pub mod esm;
pub mod exports;
pub mod exports_info;
pub mod external_module;
pub mod hot_module;
pub mod ident;
pub mod import_meta_glob;
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
    future::Future,
    mem::take,
    ops::Deref,
    sync::{Arc, LazyLock},
};

use anyhow::Result;
use bincode::{Decode, Encode};
use constant_condition::{ConstantConditionCodeGen, ConstantConditionValue};
use constant_value::ConstantValueCodeGen;
use either::Either;
use indexmap::map::Entry;
use num_traits::Zero;
use parking_lot::Mutex;
use regex::Regex;
use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::{
    atoms::{Atom, Wtf8Atom, atom},
    common::{
        GLOBALS, Globals, Span, Spanned,
        comments::{CommentKind, Comments},
        errors::{DiagnosticId, HANDLER, Handler, Level},
        source_map::SmallPos,
    },
    ecma::{
        ast::*,
        utils::IsDirective,
        visit::{
            AstParentKind,
            fields::{
                AssignExprField, AssignTargetField, BindingIdentField, SimpleAssignTargetField,
            },
        },
    },
};
use tokio::sync::OnceCell;
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, PrettyPrintError, ReadRef, ResolvedVc, TaskInput,
    TryJoinIterExt, Upcast, ValueToString, Vc, trace::TraceRawVcs, turbofmt,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::ChunkingType,
    compile_time_info::{
        CompileTimeDefineValue, CompileTimeDefines, CompileTimeInfo, DefinableNameSegment,
        DefinableNameSegmentRef, FreeVarReference, FreeVarReferences, FreeVarReferencesMembers,
        InputRelativeConstant,
    },
    environment::Rendering,
    issue::{IssueExt, IssueSeverity, IssueSource, StyledString, analyze::AnalyzeIssue},
    module::{Module, ModuleSideEffects},
    reference::{ModuleReference, ModuleReferences},
    reference_type::{CommonJsReferenceSubType, InnerAssets},
    resolve::{
        ExportUsage, FindContextFileResult, ImportUsage, ModulePart, ResolveErrorMode,
        find_context_file,
        origin::{PlainResolveOrigin, ResolveOrigin},
        parse::Request,
        pattern::Pattern,
    },
    source::Source,
    source_map::GenerateSourceMap,
};
use turbopack_resolve::{ecmascript::cjs_resolve_source, typescript::tsconfig};
use turbopack_swc_utils::emitter::IssueEmitter;
use unreachable::Unreachable;
use worker::{WorkerAssetReference, WorkerGlobalPlaceholder, WorkerGlobalsReplacementCodeGen};

pub use crate::references::esm::export::{FollowExportsResult, follow_reexports};
use crate::{
    AnalyzeMode, EcmascriptModuleAsset, EcmascriptModuleAssetType, EcmascriptParsable,
    ModuleTypeResult, TreeShakingMode, TypeofWindow,
    analyzer::{
        ConstantNumber, ConstantString, ConstantValue as JsConstantValue, JsValue, JsValueUrlKind,
        ObjectPart, RequireContextValue, WellKnownFunctionKind, WellKnownObjectKind,
        builtin::{early_replace_builtin, replace_builtin},
        graph::{ConditionalKind, Effect, EffectArg, VarGraph, create_graph},
        imports::{ImportAnnotations, ImportAttributes, ImportMap},
        linker::link,
        parse_require_context, side_effects,
        top_level_await::has_top_level_await,
        well_known::replace_well_known,
    },
    code_gen::{CodeGen, CodeGens, IntoCodeGenReference},
    errors,
    parse::ParseResult,
    references::{
        amd::{
            AmdDefineAssetReference, AmdDefineDependencyElement, AmdDefineFactoryType,
            AmdDefineWithDependenciesCodeGen,
        },
        async_module::{AsyncModule, OptionAsyncModule},
        cjs::{
            CjsAssetReference, CjsRequireAssetReference, CjsRequireCacheAccess,
            CjsRequireResolveAssetReference,
        },
        dynamic_expression::DynamicExpression,
        esm::{
            EsmAssetReference, EsmAsyncAssetReference, EsmBinding, ImportMetaBinding,
            ImportMetaRef, UrlAssetReference, UrlRewriteBehavior, base::EsmAssetReferences,
            module_id::EsmModuleIdAssetReference,
        },
        exports::{EcmascriptExportsAnalysis, compute_ecmascript_module_exports},
        exports_info::{ExportsInfoBinding, ExportsInfoRef},
        hot_module::{ModuleHotReferenceAssetReference, ModuleHotReferenceCodeGen},
        ident::IdentReplacement,
        import_meta_glob::{ImportMetaGlobAssetReference, parse_import_meta_glob},
        member::MemberReplacement,
        node::PackageJsonReference,
        raw::{DirAssetReference, FileSourceReference},
        require_context::{RequireContextAssetReference, RequireContextMap},
        typescript::{
            TsConfigReference, TsReferencePathAssetReference, TsReferenceTypeAssetReference,
        },
    },
    runtime_functions::{
        TURBOPACK_EXPORTS, TURBOPACK_GLOBAL, TURBOPACK_REQUIRE_REAL, TURBOPACK_REQUIRE_STUB,
        TURBOPACK_RUNTIME_FUNCTION_SHORTCUTS,
    },
    source_map::parse_source_map_comment,
    tree_shake::{part_of_module, split_module},
    utils::{AstPathRange, js_value_to_pattern, module_value_to_well_known_object},
};

#[turbo_tasks::value(shared)]
pub struct AnalyzeEcmascriptModuleResult {
    references: Vec<ResolvedVc<Box<dyn ModuleReference>>>,

    pub esm_references: ResolvedVc<EsmAssetReferences>,
    pub esm_local_references: ResolvedVc<EsmAssetReferences>,
    pub esm_reexport_references: ResolvedVc<EsmAssetReferences>,

    pub code_generation: ResolvedVc<CodeGens>,
    pub async_module: ResolvedVc<OptionAsyncModule>,
    pub side_effects: ModuleSideEffects,
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

/// In debug builds, use FxIndexSet to catch duplicate code gens
/// In release builds, use Vec for better performance
#[cfg(debug_assertions)]
type CodeGenCollection = FxIndexSet<CodeGen>;
#[cfg(not(debug_assertions))]
type CodeGenCollection = Vec<CodeGen>;

/// A temporary analysis result builder to pass around, to be turned into an
/// `Vc<AnalyzeEcmascriptModuleResult>` eventually.
struct AnalyzeEcmascriptModuleResultBuilder {
    analyze_mode: AnalyzeMode,

    references: FxIndexSet<ResolvedVc<Box<dyn ModuleReference>>>,

    esm_references: FxHashSet<usize>,
    esm_local_references: FxHashSet<usize>,
    esm_reexport_references: FxHashSet<usize>,

    esm_references_free_var: FxIndexMap<RcStr, ResolvedVc<EsmAssetReference>>,
    // Ad-hoc created import references that are resolved `import * as x from ...; x.foo` accesses
    // This caches repeated access because EsmAssetReference::new is not a turbo task function.
    esm_references_rewritten: FxHashMap<usize, FxIndexMap<RcStr, ResolvedVc<EsmAssetReference>>>,

    code_gens: CodeGenCollection,
    async_module: ResolvedVc<OptionAsyncModule>,
    successful: bool,
    source_map: Option<ResolvedVc<Box<dyn GenerateSourceMap>>>,
    side_effects: ModuleSideEffects,
    #[cfg(debug_assertions)]
    ident: RcStr,
}

impl AnalyzeEcmascriptModuleResultBuilder {
    fn new(analyze_mode: AnalyzeMode) -> Self {
        Self {
            analyze_mode,
            references: Default::default(),
            esm_references: Default::default(),
            esm_local_references: Default::default(),
            esm_reexport_references: Default::default(),
            esm_references_rewritten: Default::default(),
            esm_references_free_var: Default::default(),
            code_gens: Default::default(),
            async_module: ResolvedVc::cell(None),
            successful: false,
            source_map: None,
            side_effects: ModuleSideEffects::SideEffectful,
            #[cfg(debug_assertions)]
            ident: Default::default(),
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
            #[cfg(debug_assertions)]
            {
                let (index, added) = self.code_gens.insert_full(code_gen.into());
                debug_assert!(
                    added,
                    "Duplicate code gen added: {:?} in {}",
                    self.code_gens.get_index(index).unwrap(),
                    self.ident
                );
            }
            #[cfg(not(debug_assertions))]
            {
                self.code_gens.push(code_gen.into());
            }
        }
    }

    /// Sets the analysis result ES export.
    pub fn set_source_map(&mut self, source_map: ResolvedVc<Box<dyn GenerateSourceMap>>) {
        self.source_map = Some(source_map);
    }

    /// Sets the analysis result ES export.
    pub fn set_async_module(&mut self, async_module: ResolvedVc<AsyncModule>) {
        self.async_module = ResolvedVc::cell(Some(async_module));
    }

    /// Set whether this module is side-effect free according to a user-provided directive.
    pub fn set_side_effects_mode(&mut self, value: ModuleSideEffects) {
        self.side_effects = value;
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
        import_references: &[ResolvedVc<EsmAssetReference>],
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

        #[cfg(debug_assertions)]
        let code_generation = self.code_gens.into_iter().collect::<Vec<_>>();
        #[cfg(not(debug_assertions))]
        let code_generation = self.code_gens;

        Ok(AnalyzeEcmascriptModuleResult::cell(
            AnalyzeEcmascriptModuleResult {
                references,
                esm_references: ResolvedVc::cell(esm_references),
                esm_local_references: ResolvedVc::cell(esm_local_references.unwrap_or_default()),
                esm_reexport_references: ResolvedVc::cell(
                    esm_reexport_references.unwrap_or_default(),
                ),
                code_generation: ResolvedVc::cell(code_generation),
                async_module: self.async_module,
                side_effects: self.side_effects,
                successful: self.successful,
                source_map: self.source_map,
            },
        ))
    }
}

struct AnalysisState<'a> {
    handler: &'a Handler,
    module: ResolvedVc<EcmascriptModuleAsset>,
    source: ResolvedVc<Box<dyn Source>>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    compile_time_info: ResolvedVc<CompileTimeInfo>,
    free_var_references_members: ResolvedVc<FreeVarReferencesMembers>,
    compile_time_info_ref: ReadRef<CompileTimeInfo>,
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
    // There can be many references to __webpack_exports_info__, but only the first should hoist
    // the object allocation.
    first_webpack_exports_info: bool,
    tree_shaking_mode: Option<TreeShakingMode>,
    import_externals: bool,
    ignore_dynamic_requests: bool,
    url_rewrite_behavior: Option<UrlRewriteBehavior>,
    // Whether we should collect affecting sources from referenced files. Only usedful when
    // tracing.
    collect_affecting_sources: bool,
    // Whether we are only tracing dependencies (no code generation). When true, synthetic
    // wrapper modules like WorkerLoaderModule should not be created.
    tracing_only: bool,
    // Whether the module is an ESM module (affects resolution for hot module dependencies).
    is_esm: bool,
    // ESM import references (indexed to match eval_context.imports.references()).
    import_references: &'a [ResolvedVc<EsmAssetReference>],
    // The import map from the eval context, used to match dep strings to import references.
    imports: &'a ImportMap,
    // Resolve overrides for imports
    inner_assets: Option<ReadRef<InnerAssets>>,
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
                    &self.compile_time_info_ref,
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
        // ast-grep-ignore: no-context-turbofmt
        Err(err) => Err(err
            .context(turbofmt!("failed to analyze ecmascript module '{}'", module.ident()).await?)),
    }
}

async fn analyze_ecmascript_module_internal(
    module: ResolvedVc<EcmascriptModuleAsset>,
    part: Option<ModulePart>,
) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
    let raw_module = module.await?;

    let source = raw_module.source;
    let ty = raw_module.ty;
    let options = raw_module.options;
    let options = options.await?;
    let import_externals = options.import_externals;
    let analyze_mode = options.analyze_mode;

    let origin = ResolvedVc::upcast::<Box<dyn ResolveOrigin>>(module);
    let path = &*origin.origin_path().await?;
    let mut analysis = AnalyzeEcmascriptModuleResultBuilder::new(analyze_mode);
    #[cfg(debug_assertions)]
    {
        analysis.ident = source.ident().to_string().owned().await?;
    }

    let inner_assets = if let Some(assets) = raw_module.inner_assets {
        Some(assets.await?)
    } else {
        None
    };

    // Is this a typescript file that requires analyzing type references?
    let analyze_types = match &ty {
        EcmascriptModuleAssetType::Typescript { analyze_types, .. } => *analyze_types,
        EcmascriptModuleAssetType::TypescriptDeclaration => true,
        EcmascriptModuleAssetType::Ecmascript
        | EcmascriptModuleAssetType::EcmascriptExtensionless => false,
    };

    // Split out our module part if we have one.
    let parsed = if let Some(part) = &part {
        let split_data = split_module(*module);
        part_of_module(split_data, part.clone())
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

    let EcmascriptExportsAnalysis {
        exports: _,
        import_references,
        esm_reexport_reference_idxs,
        esm_evaluation_reference_idxs,
        // This reads the ParseResult, so it has to happen before the final_read_hint.
    } = &*compute_ecmascript_module_exports(*module, part).await?;

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
        source_mapping_url,
        program_source: _,
    } = &*parsed
    else {
        return analysis.build(Default::default(), false).await;
    };

    for i in esm_reexport_reference_idxs {
        analysis.add_esm_reexport_reference(*i);
    }
    for i in esm_evaluation_reference_idxs {
        analysis.add_esm_evaluation_reference(*i);
    }

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
    analysis.set_side_effects_mode(if has_side_effect_free_directive {
        ModuleSideEffects::SideEffectFree
    } else if options.infer_module_side_effects {
        // Analyze the AST to infer side effects
        GLOBALS.set(globals, || {
            side_effects::compute_module_evaluation_side_effects(
                program,
                comments,
                eval_context.unresolved_mark,
            )
        })
    } else {
        // If inference is disabled, assume side effects
        ModuleSideEffects::SideEffectful
    });

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
                source_mapping_url.as_deref(),
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

    let supports_block_scoping = *compile_time_info
        .environment()
        .runtime_versions()
        .supports_block_scoping()
        .await?;

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

    let mut var_graph = {
        let _span = tracing::trace_span!("analyze variable values").entered();
        set_handler_and_globals(&handler, globals, || {
            create_graph(program, eval_context, analyze_mode, supports_block_scoping)
        })
    };

    let span = tracing::trace_span!("effects processing");
    async {
        analysis.code_gens.extend(take(&mut var_graph.code_gens));
        let effects = take(&mut var_graph.effects);
        let compile_time_info_ref = compile_time_info.await?;

        let mut analysis_state = AnalysisState {
            handler: &handler,
            module,
            source,
            origin,
            compile_time_info,
            free_var_references_members: compile_time_info_ref
                .free_var_references
                .members()
                .to_resolved()
                .await?,
            compile_time_info_ref,
            var_graph: &var_graph,
            allow_project_root_tracing: !source.ident().await?.path.is_in_node_modules(),
            fun_args_values: Default::default(),
            var_cache: Default::default(),
            first_import_meta: true,
            first_webpack_exports_info: true,
            tree_shaking_mode: options.tree_shaking_mode,
            import_externals: options.import_externals,
            ignore_dynamic_requests: options.ignore_dynamic_requests,
            url_rewrite_behavior: options.url_rewrite_behavior,
            collect_affecting_sources: options.analyze_mode.is_tracing_assets(),
            tracing_only: !options.analyze_mode.is_code_gen(),
            is_esm,
            import_references,
            imports: &eval_context.imports,
            inner_assets,
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
                        eval_context.imports.get_attributes(span),
                    )
                    .await?;
                }
                Effect::DynamicImport {
                    args,
                    ast_path,
                    span,
                    in_try,
                    export_usage,
                } => {
                    handle_dynamic_import(
                        &ast_path,
                        span,
                        args,
                        &analysis_state,
                        &add_effects,
                        &mut analysis,
                        in_try,
                        eval_context.imports.get_attributes(span),
                        export_usage,
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
                        eval_context.imports.get_attributes(span),
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

                    // Worker runtime helpers reference these as free vars; replace each
                    // with the value baked from the chunking context's worker config.
                    let worker_placeholder = match &*var {
                        "_TURBOPACK_WORKER_FORWARDED_GLOBALS_" => {
                            Some(WorkerGlobalPlaceholder::ForwardedGlobals)
                        }
                        "_TURBOPACK_WORKER_BASE_PATH_" => Some(WorkerGlobalPlaceholder::BasePath),
                        _ => None,
                    };
                    if let Some(placeholder) = worker_placeholder {
                        analysis.add_code_gen(WorkerGlobalsReplacementCodeGen::new(
                            placeholder,
                            ast_path.into(),
                        ));
                        continue;
                    }

                    if options.enable_exports_info_inlining && var == "__webpack_exports_info__" {
                        if analysis_state.first_webpack_exports_info {
                            analysis_state.first_webpack_exports_info = false;
                            analysis.add_code_gen(ExportsInfoBinding::new());
                        }
                        analysis.add_code_gen(ExportsInfoRef::new(ast_path.into()));
                        continue;
                    }

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
                        let chunking_type = r
                            .await?
                            .annotations
                            .as_ref()
                            .and_then(|a| a.chunking_type())
                            .map_or_else(
                                || {
                                    Some(ChunkingType::Parallel {
                                        inherit_async: true,
                                        hoisted: true,
                                    })
                                },
                                |c| c.as_chunking_type(true, true),
                            );
                        analysis.add_reference_code_gen(
                            EsmModuleIdAssetReference::new(*r, chunking_type),
                            ast_path.into(),
                        )
                    } else {
                        if matches!(
                            options.tree_shaking_mode,
                            Some(TreeShakingMode::ReexportsOnly)
                        ) {
                            // TODO move this logic into Effect creation itself and don't create new
                            // references after the fact here.
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
                                                original_reference.module,
                                                original_reference.origin,
                                                original_reference.request.clone(),
                                                original_reference.issue_source,
                                                original_reference.annotations.clone(),
                                                Some(ModulePart::export(export.clone())),
                                                // TODO this is correct, but an overapproximation.
                                                // We should have individual import_usage data for
                                                // each export. This would be fixed by moving this
                                                // logic earlier (see TODO above)
                                                original_reference.import_usage.clone(),
                                                original_reference.import_externals,
                                                original_reference.tree_shaking_mode,
                                                original_reference.resolve_override,
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
                            source.ident().await?.path.clone(),
                            analysis_state
                                .compile_time_info_ref
                                .hot_module_replacement_enabled,
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
    let defines = compile_time_info.defines;

    let mut free_var_references = free_var_references.owned().await?;
    let mut defines = defines.owned().await?;

    let (typeof_exports, typeof_module, typeof_this, require) = if is_esm {
        (
            rcstr!("undefined"),
            rcstr!("undefined"),
            rcstr!("undefined"),
            TURBOPACK_REQUIRE_STUB,
        )
    } else {
        (
            rcstr!("object"),
            rcstr!("object"),
            rcstr!("object"),
            TURBOPACK_REQUIRE_REAL,
        )
    };
    let typeofs: [(&[RcStr], RcStr); _] = [
        (&[rcstr!("import"), rcstr!("meta")], rcstr!("object")),
        (&[rcstr!("exports")], typeof_exports),
        (&[rcstr!("module")], typeof_module),
        (&[rcstr!("this")], typeof_this),
        (&[rcstr!("require")], rcstr!("function")),
        (&[rcstr!("__dirname")], rcstr!("string")),
        (&[rcstr!("__filename")], rcstr!("string")),
        (&[rcstr!("global")], rcstr!("object")),
    ];
    for (typeof_path, typeof_value) in typeofs {
        let name = typeof_path
            .iter()
            .map(|s| DefinableNameSegment::Name(s.clone()))
            .chain(std::iter::once(DefinableNameSegment::TypeOf))
            .collect::<Vec<_>>();
        free_var_references
            .entry(name.clone())
            .or_insert(typeof_value.clone().into());
        defines.entry(name).or_insert(typeof_value.into());
    }

    free_var_references
        .entry(vec![DefinableNameSegment::Name(rcstr!("require"))])
        .or_insert(require.into());
    free_var_references
        .entry(vec![DefinableNameSegment::Name(rcstr!("__dirname"))])
        .or_insert(FreeVarReference::InputRelative(
            InputRelativeConstant::DirName,
        ));
    free_var_references
        .entry(vec![DefinableNameSegment::Name(rcstr!("__filename"))])
        .or_insert(FreeVarReference::InputRelative(
            InputRelativeConstant::FileName,
        ));

    // Compiletime rewrite the nodejs `global` to `__turbopack_context_.g` which is a shortcut for
    // `globalThis` that cannot be shadowed by a local variable.
    free_var_references
        .entry(vec![DefinableNameSegment::Name(rcstr!("global"))])
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
    free_var_references
        .entry(vec![DefinableNameSegment::Name(rcstr!("this"))])
        .or_insert(if is_esm {
            FreeVarReference::Value(CompileTimeDefineValue::Undefined)
        } else {
            // Insert shortcut which is equivalent to `module.exports` but should
            // not be shadowed by user symbols.
            TURBOPACK_EXPORTS.into()
        });

    if let Some(enable_typeof_window_inlining) = enable_typeof_window_inlining {
        let value = match enable_typeof_window_inlining {
            TypeofWindow::Object => rcstr!("object"),
            TypeofWindow::Undefined => rcstr!("undefined"),
        };
        let window = rcstr!("window");
        free_var_references
            .entry(vec![
                DefinableNameSegment::Name(window.clone()),
                DefinableNameSegment::TypeOf,
            ])
            .or_insert(value.clone().into());
        defines
            .entry(vec![
                DefinableNameSegment::Name(window),
                DefinableNameSegment::TypeOf,
            ])
            .or_insert(value.into());
    }

    Ok(CompileTimeInfo {
        environment: compile_time_info.environment,
        defines: CompileTimeDefines(defines).resolved_cell(),
        free_var_references: FreeVarReferences(free_var_references).resolved_cell(),
        hot_module_replacement_enabled: compile_time_info.hot_module_replacement_enabled,
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
    attributes: &ImportAttributes,
) -> Result<()> {
    let &AnalysisState {
        handler,
        origin,
        source,
        compile_time_info,
        ignore_dynamic_requests,
        url_rewrite_behavior,
        collect_affecting_sources,
        tracing_only,
        ..
    } = state;

    // Process all effects first so they happen exactly once.
    // If we end up modeling the behavior of the closures passed to any of these functions then we
    // will need to inline this into the appropriate spot just like Array.prototype.map support.
    let unlinked_args = args
        .into_iter()
        .map(|effect_arg| match effect_arg {
            EffectArg::Value(value) => value,
            EffectArg::Closure(value, block) => {
                add_effects(block.effects);
                value
            }
            EffectArg::Spread => {
                JsValue::unknown_empty(true, rcstr!("spread is not supported yet"))
            }
        })
        .collect::<Vec<_>>();

    // Create a OnceCell to cache linked args across multiple calls
    let linked_args_cache = OnceCell::new();

    // Create the lazy linking closure that will be passed to handle_well_known_function_call
    let linked_args = || async {
        linked_args_cache
            .get_or_try_init(|| async {
                unlinked_args
                    .iter()
                    .cloned()
                    .map(|arg| state.link_value(arg, ImportAttributes::empty_ref()))
                    .try_join()
                    .await
            })
            .await
    };

    match func {
        JsValue::Alternatives {
            total_nodes: _,
            values,
            logical_property: _,
        } => {
            for alt in values {
                if let JsValue::WellKnownFunction(wkf) = alt {
                    handle_well_known_function_call(
                        wkf,
                        new,
                        &linked_args,
                        handler,
                        span,
                        ignore_dynamic_requests,
                        analysis,
                        origin,
                        compile_time_info,
                        url_rewrite_behavior,
                        source,
                        ast_path,
                        in_try,
                        state,
                        collect_affecting_sources,
                        tracing_only,
                        attributes,
                    )
                    .await?;
                }
            }
        }
        JsValue::WellKnownFunction(wkf) => {
            handle_well_known_function_call(
                wkf,
                new,
                &linked_args,
                handler,
                span,
                ignore_dynamic_requests,
                analysis,
                origin,
                compile_time_info,
                url_rewrite_behavior,
                source,
                ast_path,
                in_try,
                state,
                collect_affecting_sources,
                tracing_only,
                attributes,
            )
            .await?;
        }
        _ => {}
    }

    Ok(())
}

async fn handle_dynamic_import<G: Fn(Vec<Effect>) + Send + Sync>(
    ast_path: &[AstParentKind],
    span: Span,
    args: Vec<EffectArg>,
    state: &AnalysisState<'_>,
    add_effects: &G,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
    in_try: bool,
    attributes: &ImportAttributes,
    export_usage: ExportUsage,
) -> Result<()> {
    // If the import has a webpackIgnore/turbopackIgnore comment, skip processing
    // so the import expression is preserved as-is in the output.
    if attributes.ignore {
        return Ok(());
    }

    let &AnalysisState {
        handler,
        origin,
        source,
        ignore_dynamic_requests,
        ..
    } = state;

    let error_mode = if attributes.optional {
        ResolveErrorMode::Ignore
    } else if in_try {
        ResolveErrorMode::Warn
    } else {
        ResolveErrorMode::Error
    };

    // Process all effects (closures) from args
    let unlinked_args: Vec<JsValue> = args
        .into_iter()
        .map(|effect_arg| match effect_arg {
            EffectArg::Value(value) => value,
            EffectArg::Closure(value, block) => {
                add_effects(block.effects);
                value
            }
            EffectArg::Spread => {
                JsValue::unknown_empty(true, rcstr!("spread is not supported yet"))
            }
        })
        .collect();

    let linked_args = unlinked_args
        .iter()
        .cloned()
        .map(|arg| state.link_value(arg, ImportAttributes::empty_ref()))
        .try_join()
        .await?;

    handle_dynamic_import_with_linked_args(
        ast_path,
        span,
        &linked_args,
        handler,
        origin,
        source,
        &state.inner_assets,
        ignore_dynamic_requests,
        analysis,
        error_mode,
        state.import_externals,
        export_usage,
    )
    .await
}

async fn handle_dynamic_import_with_linked_args(
    ast_path: &[AstParentKind],
    span: Span,
    linked_args: &[JsValue],
    handler: &Handler,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    source: ResolvedVc<Box<dyn Source>>,
    inner_assets: &Option<ReadRef<InnerAssets>>,
    ignore_dynamic_requests: bool,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
    error_mode: ResolveErrorMode,
    import_externals: bool,
    export_usage: ExportUsage,
) -> Result<()> {
    if linked_args.len() == 1 || linked_args.len() == 2 {
        let pat = js_value_to_pattern(&linked_args[0]);
        let options = linked_args.get(1);
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
            let (args, hints) = JsValue::explain_args(linked_args, 10, 2);
            handler.span_warn_with_code(
                span,
                &format!("import({args}) is very dynamic{hints}",),
                DiagnosticId::Lint(
                    errors::failed_to_analyze::ecmascript::DYNAMIC_IMPORT.to_string(),
                ),
            );
            if ignore_dynamic_requests {
                analysis.add_code_gen(DynamicExpression::new_promise(ast_path.to_vec().into()));
                return Ok(());
            }
        }

        let resolve_override = if let Some(inner_assets) = &inner_assets
            && let Some(req) = pat.as_constant_string()
            && let Some(a) = inner_assets.get(req)
        {
            Some(*a)
        } else {
            None
        };

        analysis.add_reference_code_gen(
            EsmAsyncAssetReference::new(
                origin,
                Request::parse(pat).to_resolved().await?,
                issue_source(source, span),
                import_annotations,
                error_mode,
                import_externals,
                export_usage,
                resolve_override,
            ),
            ast_path.to_vec().into(),
        );
        return Ok(());
    }
    let (args, hints) = JsValue::explain_args(linked_args, 10, 2);
    handler.span_warn_with_code(
        span,
        &format!("import({args}) is not statically analyze-able{hints}",),
        DiagnosticId::Error(errors::failed_to_analyze::ecmascript::DYNAMIC_IMPORT.to_string()),
    );

    Ok(())
}

async fn handle_well_known_function_call<'a, F, Fut>(
    func: WellKnownFunctionKind,
    new: bool,
    linked_args: &F,
    handler: &Handler,
    span: Span,
    ignore_dynamic_requests: bool,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    compile_time_info: ResolvedVc<CompileTimeInfo>,
    url_rewrite_behavior: Option<UrlRewriteBehavior>,
    source: ResolvedVc<Box<dyn Source>>,
    ast_path: &[AstParentKind],
    in_try: bool,
    state: &'a AnalysisState<'a>,
    collect_affecting_sources: bool,
    tracing_only: bool,
    attributes: &ImportAttributes,
) -> Result<()>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<&'a Vec<JsValue>>>,
{
    fn explain_args(args: &[JsValue]) -> (String, String) {
        JsValue::explain_args(args, 10, 2)
    }

    // Compute error mode from in_try and attributes.optional
    let error_mode = if attributes.optional {
        ResolveErrorMode::Ignore
    } else if in_try {
        ResolveErrorMode::Warn
    } else {
        ResolveErrorMode::Error
    };

    let get_traced_project_dir = async || -> Result<FileSystemPath> {
        // readFileSync("./foo") should always be relative to the project root, but this is
        // dangerous inside of node_modules as it can cause a lot of false positives in the
        // tracing, if some package does `path.join(dynamic)`, it would include
        // everything from the project root as well.
        //
        // Also, when there's no cwd set (i.e. in a tracing-specific module context, as we
        // shouldn't assume a `process.cwd()` for all of node_modules), fallback to
        // the source file directory. This still allows relative file accesses, just
        // not from the project root.
        if state.allow_project_root_tracing
            && let Some(cwd) = compile_time_info.environment().cwd().owned().await?
        {
            Ok(cwd)
        } else {
            Ok(source.ident().await?.path.parent())
        }
    };

    let get_issue_source =
        || IssueSource::from_swc_offsets(source, span.lo.to_u32(), span.hi.to_u32());
    if new {
        match func {
            WellKnownFunctionKind::URLConstructor => {
                let args = linked_args().await?;
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
                        let (args, hints) = explain_args(args);
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
                    let error_mode = if in_try {
                        ResolveErrorMode::Warn
                    } else {
                        ResolveErrorMode::Error
                    };
                    analysis.add_reference_code_gen(
                        UrlAssetReference::new(
                            origin,
                            Request::parse(pat).to_resolved().await?,
                            *compile_time_info.environment().rendering().await?,
                            issue_source(source, span),
                            error_mode,
                            url_rewrite_behavior.unwrap_or(UrlRewriteBehavior::Relative),
                        ),
                        ast_path.to_vec().into(),
                    );
                }
                return Ok(());
            }
            WellKnownFunctionKind::WorkerConstructor
            | WellKnownFunctionKind::SharedWorkerConstructor => {
                let args = linked_args().await?;
                if let Some(url @ JsValue::Url(_, JsValueUrlKind::Relative)) = args.first() {
                    let (name, is_shared) = match func {
                        WellKnownFunctionKind::WorkerConstructor => ("Worker", false),
                        WellKnownFunctionKind::SharedWorkerConstructor => ("SharedWorker", true),
                        _ => unreachable!(),
                    };
                    let pat = js_value_to_pattern(url);
                    if !pat.has_constant_parts() {
                        let (args, hints) = explain_args(args);
                        handler.span_warn_with_code(
                            span,
                            &format!("new {name}({args}) is very dynamic{hints}",),
                            DiagnosticId::Lint(
                                errors::failed_to_analyze::ecmascript::NEW_WORKER.to_string(),
                            ),
                        );
                        if ignore_dynamic_requests {
                            return Ok(());
                        }
                    }

                    if *compile_time_info.environment().rendering().await? == Rendering::Client {
                        let error_mode = if in_try {
                            ResolveErrorMode::Warn
                        } else {
                            ResolveErrorMode::Error
                        };
                        analysis.add_reference_code_gen(
                            WorkerAssetReference::new_web_worker(
                                origin,
                                Request::parse(pat).to_resolved().await?,
                                issue_source(source, span),
                                error_mode,
                                tracing_only,
                                is_shared,
                            ),
                            ast_path.to_vec().into(),
                        );
                    }

                    return Ok(());
                }
                // Ignore (e.g. dynamic parameter or string literal), just as Webpack does
                return Ok(());
            }
            WellKnownFunctionKind::NodeWorkerConstructor => {
                let args = linked_args().await?;
                if !args.is_empty() {
                    // When `{ eval: true }` is passed as the second argument,
                    // the first argument is inline JS code, not a file path.
                    // Skip creating a worker reference in that case.
                    let mut dynamic_warning: Option<&str> = None;
                    if let Some(opts) = args.get(1) {
                        match opts {
                            JsValue::Object { parts, .. } => {
                                let eval_value = parts.iter().find_map(|part| match part {
                                    ObjectPart::KeyValue(
                                        JsValue::Constant(JsConstantValue::Str(key)),
                                        value,
                                    ) if key.as_str() == "eval" => Some(value),
                                    _ => None,
                                });
                                if let Some(eval_value) = eval_value {
                                    match eval_value {
                                        // eval: true — first arg is code, not a
                                        // path
                                        JsValue::Constant(JsConstantValue::True) => {
                                            return Ok(());
                                        }
                                        // eval: false — first arg is a path,
                                        // continue normally
                                        JsValue::Constant(JsConstantValue::False) => {}
                                        // eval is set but not a literal boolean
                                        _ => {
                                            dynamic_warning = Some("has a dynamic `eval` option");
                                        }
                                    }
                                }
                            }
                            // Options argument is not a static object literal —
                            // we can't inspect it for `eval: true`
                            _ => {
                                dynamic_warning = Some("has a dynamic options argument");
                            }
                        }
                    }
                    if let Some(warning) = dynamic_warning {
                        let (args, hints) = explain_args(args);
                        handler.span_warn_with_code(
                            span,
                            &format!("new Worker({args}) {warning}{hints}"),
                            DiagnosticId::Lint(
                                errors::failed_to_analyze::ecmascript::NEW_WORKER.to_string(),
                            ),
                        );
                        if ignore_dynamic_requests {
                            return Ok(());
                        }
                    }

                    let pat = js_value_to_pattern(&args[0]);
                    if !pat.has_constant_parts() {
                        let (args, hints) = explain_args(args);
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

                    let error_mode = if in_try {
                        ResolveErrorMode::Warn
                    } else {
                        ResolveErrorMode::Error
                    };
                    // WorkerThreads resolve URLs relative to import.meta.url
                    // and string paths relative to the process root
                    let context_dir = if matches!(
                        args.first(),
                        Some(JsValue::Url(_, JsValueUrlKind::Relative))
                    ) {
                        origin.origin_path().await?.parent()
                    } else {
                        get_traced_project_dir().await?
                    };
                    analysis.add_reference_code_gen(
                        WorkerAssetReference::new_node_worker_thread(
                            origin,
                            context_dir,
                            Pattern::new(pat).to_resolved().await?,
                            collect_affecting_sources,
                            get_issue_source(),
                            error_mode,
                            tracing_only,
                        ),
                        ast_path.to_vec().into(),
                    );

                    return Ok(());
                }
                let (args, hints) = explain_args(args);
                handler.span_warn_with_code(
                    span,
                    &format!("new Worker({args}) is not statically analyze-able{hints}",),
                    DiagnosticId::Error(
                        errors::failed_to_analyze::ecmascript::NEW_WORKER.to_string(),
                    ),
                );
                // Ignore (e.g. dynamic parameter or string literal)
                return Ok(());
            }
            _ => {}
        }

        return Ok(());
    }

    match func {
        WellKnownFunctionKind::Import => {
            let args = linked_args().await?;
            let export_usage = match &attributes.export_names {
                Some(names) if names.is_empty() => ExportUsage::Evaluation,
                Some(names) => ExportUsage::PartialNamespaceObject(names.clone()),
                None => ExportUsage::All,
            };
            handle_dynamic_import_with_linked_args(
                ast_path,
                span,
                args,
                handler,
                origin,
                source,
                &state.inner_assets,
                ignore_dynamic_requests,
                analysis,
                error_mode,
                state.import_externals,
                export_usage,
            )
            .await?;
        }
        WellKnownFunctionKind::Require => {
            let args = linked_args().await?;
            if args.len() == 1 {
                let pat = js_value_to_pattern(&args[0]);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(args);
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

                let resolve_override = if let Some(inner_assets) = &state.inner_assets
                    && let Some(req) = pat.as_constant_string()
                    && let Some(a) = inner_assets.get(req)
                {
                    Some(*a)
                } else {
                    None
                };

                analysis.add_reference_code_gen(
                    CjsRequireAssetReference::new(
                        origin,
                        Request::parse(pat).to_resolved().await?,
                        issue_source(source, span),
                        error_mode,
                        attributes.chunking_type,
                        resolve_override,
                    ),
                    ast_path.to_vec().into(),
                );
                return Ok(());
            }
            let (args, hints) = explain_args(args);
            handler.span_warn_with_code(
                span,
                &format!("require({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(errors::failed_to_analyze::ecmascript::REQUIRE.to_string()),
            )
        }
        WellKnownFunctionKind::RequireFrom(rel) => {
            let args = linked_args().await?;
            if args.len() == 1 {
                let pat = js_value_to_pattern(&args[0]);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(args);
                    handler.span_warn_with_code(
                        span,
                        &format!("createRequire()({args}) is very dynamic{hints}",),
                        DiagnosticId::Lint(
                            errors::failed_to_analyze::ecmascript::REQUIRE.to_string(),
                        ),
                    );
                    if ignore_dynamic_requests {
                        analysis.add_code_gen(DynamicExpression::new(ast_path.to_vec().into()));
                        return Ok(());
                    }
                }
                let origin = ResolvedVc::upcast(
                    PlainResolveOrigin::new(
                        origin.asset_context(),
                        origin
                            .origin_path()
                            .await?
                            .parent()
                            .join(rel.as_str())?
                            .join("_")?,
                    )
                    .to_resolved()
                    .await?,
                );

                analysis.add_reference_code_gen(
                    CjsRequireAssetReference::new(
                        origin,
                        Request::parse(pat).to_resolved().await?,
                        issue_source(source, span),
                        error_mode,
                        attributes.chunking_type,
                        None,
                    ),
                    ast_path.to_vec().into(),
                );
                return Ok(());
            }
            let (args, hints) = explain_args(args);
            handler.span_warn_with_code(
                span,
                &format!("createRequire()({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(errors::failed_to_analyze::ecmascript::REQUIRE.to_string()),
            )
        }
        WellKnownFunctionKind::Define => {
            analyze_amd_define(
                source,
                analysis,
                origin,
                handler,
                span,
                ast_path,
                linked_args().await?,
                error_mode,
            )
            .await?;
        }

        WellKnownFunctionKind::RequireResolve => {
            let args = linked_args().await?;
            if args.len() == 1 || args.len() == 2 {
                // TODO error TP1003 require.resolve(???*0*, {"paths": [???*1*]}) is not
                // statically analyze-able with ignore_dynamic_requests =
                // true
                let pat = js_value_to_pattern(&args[0]);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(args);
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

                let resolve_override = if let Some(inner_assets) = &state.inner_assets
                    && let Some(req) = pat.as_constant_string()
                    && let Some(a) = inner_assets.get(req)
                {
                    Some(*a)
                } else {
                    None
                };

                analysis.add_reference_code_gen(
                    CjsRequireResolveAssetReference::new(
                        origin,
                        Request::parse(pat).to_resolved().await?,
                        issue_source(source, span),
                        error_mode,
                        attributes.chunking_type,
                        resolve_override,
                    ),
                    ast_path.to_vec().into(),
                );
                return Ok(());
            }
            let (args, hints) = explain_args(args);
            handler.span_warn_with_code(
                span,
                &format!("require.resolve({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::REQUIRE_RESOLVE.to_string(),
                ),
            )
        }

        WellKnownFunctionKind::ImportMetaGlob => {
            let args = linked_args().await?;
            let Some(options) = parse_import_meta_glob(
                args,
                handler,
                span,
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::IMPORT_META_GLOB.to_string(),
                ),
            ) else {
                return Ok(());
            };

            analysis.add_reference_code_gen(
                ImportMetaGlobAssetReference::new(
                    origin,
                    options.patterns,
                    options.eager,
                    options.import,
                    options.query,
                    options.base,
                    Some(issue_source(source, span)),
                    error_mode,
                ),
                ast_path.to_vec().into(),
            );
        }

        WellKnownFunctionKind::RequireContext => {
            let args = linked_args().await?;
            let options = match parse_require_context(args) {
                Ok(options) => options,
                Err(err) => {
                    let (args, hints) = explain_args(args);
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
                    error_mode,
                )
                .await?,
                ast_path.to_vec().into(),
            );
        }

        WellKnownFunctionKind::FsReadMethod(name) if analysis.analyze_mode.is_tracing_assets() => {
            let args = linked_args().await?;
            if !args.is_empty() {
                let pat = js_value_to_pattern(&args[0]);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(args);
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
                analysis.add_reference(
                    FileSourceReference::new(
                        get_traced_project_dir().await?,
                        Pattern::new(pat),
                        collect_affecting_sources,
                        get_issue_source(),
                    )
                    .to_resolved()
                    .await?,
                );
                return Ok(());
            }
            let (args, hints) = explain_args(args);
            handler.span_warn_with_code(
                span,
                &format!("fs.{name}({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(errors::failed_to_analyze::ecmascript::FS_METHOD.to_string()),
            )
        }
        WellKnownFunctionKind::FsReadDir if analysis.analyze_mode.is_tracing_assets() => {
            let args = linked_args().await?;
            if !args.is_empty() {
                let pat = js_value_to_pattern(&args[0]);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(args);
                    handler.span_warn_with_code(
                        span,
                        &format!("fs.readdir({args}) is very dynamic{hints}"),
                        DiagnosticId::Lint(
                            errors::failed_to_analyze::ecmascript::FS_METHOD.to_string(),
                        ),
                    );
                    if ignore_dynamic_requests {
                        return Ok(());
                    }
                }
                analysis.add_reference(
                    DirAssetReference::new(
                        get_traced_project_dir().await?,
                        Pattern::new(pat),
                        get_issue_source(),
                    )
                    .to_resolved()
                    .await?,
                );
                return Ok(());
            }
            let (args, hints) = explain_args(args);
            handler.span_warn_with_code(
                span,
                &format!("fs.readdir({args}) is not statically analyze-able{hints}"),
                DiagnosticId::Error(errors::failed_to_analyze::ecmascript::FS_METHOD.to_string()),
            )
        }
        WellKnownFunctionKind::PathResolve(..) if analysis.analyze_mode.is_tracing_assets() => {
            let parent_path = origin.origin_path().owned().await?.parent();
            let args = linked_args().await?;

            let linked_func_call = state
                .link_value(
                    JsValue::call_from_parts(
                        JsValue::WellKnownFunction(WellKnownFunctionKind::PathResolve(Box::new(
                            parent_path.path.as_str().into(),
                        ))),
                        args.clone(),
                    ),
                    ImportAttributes::empty_ref(),
                )
                .await?;

            let pat = js_value_to_pattern(&linked_func_call);
            if !pat.has_constant_parts() {
                let (args, hints) = explain_args(args);
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
            analysis.add_reference(
                DirAssetReference::new(
                    get_traced_project_dir().await?,
                    Pattern::new(pat),
                    get_issue_source(),
                )
                .to_resolved()
                .await?,
            );
            return Ok(());
        }
        WellKnownFunctionKind::PathJoin if analysis.analyze_mode.is_tracing_assets() => {
            // ignore path.join in `node-gyp`, it will includes too many files
            if source
                .ident()
                .await?
                .path
                .path
                .contains("node_modules/node-gyp")
            {
                return Ok(());
            }
            let args = linked_args().await?;
            let linked_func_call = state
                .link_value(
                    JsValue::call_from_parts(
                        JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
                        args.clone(),
                    ),
                    ImportAttributes::empty_ref(),
                )
                .await?;
            let pat = js_value_to_pattern(&linked_func_call);
            if !pat.has_constant_parts() {
                let (args, hints) = explain_args(args);
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
            analysis.add_reference(
                DirAssetReference::new(
                    get_traced_project_dir().await?,
                    Pattern::new(pat),
                    get_issue_source(),
                )
                .to_resolved()
                .await?,
            );
            return Ok(());
        }
        WellKnownFunctionKind::ChildProcessSpawnMethod(name)
            if analysis.analyze_mode.is_tracing_assets() =>
        {
            let args = linked_args().await?;

            // Is this specifically `spawn(process.argv[0], ['-e', ...])`?
            if is_invoking_node_process_eval(args) {
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
                        let error_mode = if in_try {
                            ResolveErrorMode::Warn
                        } else {
                            ResolveErrorMode::Error
                        };
                        analysis.add_reference(
                            CjsAssetReference::new(
                                *origin,
                                Request::parse(pat),
                                issue_source(source, span),
                                error_mode,
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
                        FileSourceReference::new(
                            get_traced_project_dir().await?,
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
                    let (args, hints) = explain_args(args);
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
            let (args, hints) = explain_args(args);
            handler.span_warn_with_code(
                span,
                &format!("child_process.{name}({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::CHILD_PROCESS_SPAWN.to_string(),
                ),
            )
        }
        WellKnownFunctionKind::ChildProcessFork if analysis.analyze_mode.is_tracing_assets() => {
            let args = linked_args().await?;
            if !args.is_empty() {
                let first_arg = &args[0];
                let pat = js_value_to_pattern(first_arg);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(args);
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
                let error_mode = if in_try {
                    ResolveErrorMode::Warn
                } else {
                    ResolveErrorMode::Error
                };
                analysis.add_reference(
                    CjsAssetReference::new(
                        *origin,
                        Request::parse(pat),
                        issue_source(source, span),
                        error_mode,
                    )
                    .to_resolved()
                    .await?,
                );
                return Ok(());
            }
            let (args, hints) = explain_args(args);
            handler.span_warn_with_code(
                span,
                &format!("child_process.fork({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::CHILD_PROCESS_SPAWN.to_string(),
                ),
            )
        }
        WellKnownFunctionKind::NodePreGypFind if analysis.analyze_mode.is_tracing_assets() => {
            use turbopack_resolve::node_native_binding::NodePreGypConfigReference;

            let args = linked_args().await?;
            if args.len() == 1 {
                let first_arg = &args[0];
                let pat = js_value_to_pattern(first_arg);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(args);
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
            let (args, hints) = explain_args(args);
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
        WellKnownFunctionKind::NodeGypBuild if analysis.analyze_mode.is_tracing_assets() => {
            use turbopack_resolve::node_native_binding::NodeGypBuildReference;

            let args = linked_args().await?;
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
            let (args, hints) = explain_args(args);
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
        WellKnownFunctionKind::NodeBindings if analysis.analyze_mode.is_tracing_assets() => {
            use turbopack_resolve::node_native_binding::NodeBindingsReference;

            let args = linked_args().await?;
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
            let (args, hints) = explain_args(args);
            handler.span_warn_with_code(
                span,
                &format!("require('bindings')({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::NODE_BINDINGS.to_string(),
                ),
            )
        }
        WellKnownFunctionKind::NodeExpressSet if analysis.analyze_mode.is_tracing_assets() => {
            let args = linked_args().await?;
            if args.len() == 2
                && let Some(s) = args.first().and_then(|arg| arg.as_str())
            {
                let pkg_or_dir = args.get(1).unwrap();
                let pat = js_value_to_pattern(pkg_or_dir);
                if !pat.has_constant_parts() {
                    let (args, hints) = explain_args(args);
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
                                        JsValue::call_from_parts(
                                            JsValue::WellKnownFunction(
                                                WellKnownFunctionKind::PathJoin,
                                            ),
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
                            analysis.add_reference(
                                DirAssetReference::new(
                                    get_traced_project_dir().await?,
                                    Pattern::new(abs_pattern),
                                    get_issue_source(),
                                )
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
                                let error_mode = if in_try {
                                    ResolveErrorMode::Warn
                                } else {
                                    ResolveErrorMode::Error
                                };
                                analysis.add_reference(
                                    CjsAssetReference::new(
                                        *origin,
                                        Request::parse(pat),
                                        issue_source(source, span),
                                        error_mode,
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
            let (args, hints) = explain_args(args);
            handler.span_warn_with_code(
                span,
                &format!("require('express')().set({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::NODE_EXPRESS.to_string(),
                ),
            )
        }
        WellKnownFunctionKind::NodeStrongGlobalizeSetRootDir
            if analysis.analyze_mode.is_tracing_assets() =>
        {
            let args = linked_args().await?;
            if let Some(p) = args.first().and_then(|arg| arg.as_str()) {
                let abs_pattern = if p.starts_with("/ROOT/") {
                    Pattern::Constant(format!("{p}/intl").into())
                } else {
                    let linked_func_call = state
                        .link_value(
                            JsValue::call_from_parts(
                                JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
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
                analysis.add_reference(
                    DirAssetReference::new(
                        get_traced_project_dir().await?,
                        Pattern::new(abs_pattern),
                        get_issue_source(),
                    )
                    .to_resolved()
                    .await?,
                );
                return Ok(());
            }
            let (args, hints) = explain_args(args);
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
        WellKnownFunctionKind::NodeResolveFrom if analysis.analyze_mode.is_tracing_assets() => {
            let args = linked_args().await?;
            if args.len() == 2 && args.get(1).and_then(|arg| arg.as_str()).is_some() {
                let error_mode = if in_try {
                    ResolveErrorMode::Warn
                } else {
                    ResolveErrorMode::Error
                };
                analysis.add_reference(
                    CjsAssetReference::new(
                        *origin,
                        Request::parse(js_value_to_pattern(&args[1])),
                        issue_source(source, span),
                        error_mode,
                    )
                    .to_resolved()
                    .await?,
                );
                return Ok(());
            }
            let (args, hints) = explain_args(args);
            handler.span_warn_with_code(
                span,
                &format!("require('resolve-from')({args}) is not statically analyze-able{hints}",),
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::NODE_RESOLVE_FROM.to_string(),
                ),
            )
        }
        WellKnownFunctionKind::NodeProtobufLoad if analysis.analyze_mode.is_tracing_assets() => {
            let args = linked_args().await?;
            if args.len() == 2
                && let Some(JsValue::Object { parts, .. }) = args.get(1)
            {
                let context_dir = get_traced_project_dir().await?;
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
                            get_issue_source(),
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
            let (args, hints) = explain_args(args);
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
        kind @ (WellKnownFunctionKind::ModuleHotAccept
        | WellKnownFunctionKind::ModuleHotDecline) => {
            let is_accept = matches!(kind, WellKnownFunctionKind::ModuleHotAccept);
            let args = linked_args().await?;
            if let Some(first_arg) = args.first() {
                if let Some(dep_strings) = extract_hot_dep_strings(first_arg) {
                    let mut references = Vec::new();
                    let mut esm_references = Vec::new();
                    for dep_str in &dep_strings {
                        let request = Request::parse_string(dep_str.clone()).to_resolved().await?;
                        let reference = ModuleHotReferenceAssetReference::new(
                            *origin,
                            *request,
                            issue_source(source, span),
                            error_mode,
                            state.is_esm,
                        )
                        .to_resolved()
                        .await?;
                        analysis.add_reference(reference);
                        references.push(reference);

                        // For accept, find a matching ESM import so we can
                        // re-assign the namespace binding after the update.
                        let esm_ref = if is_accept {
                            state
                                .imports
                                .references()
                                .enumerate()
                                .find(|(_, r)| r.module_path.to_string_lossy() == dep_str.as_str())
                                .and_then(|(idx, _)| state.import_references.get(idx).copied())
                        } else {
                            None
                        };
                        esm_references.push(esm_ref);
                    }
                    analysis.add_code_gen(ModuleHotReferenceCodeGen::new(
                        references,
                        esm_references,
                        ast_path.to_vec().into(),
                    ));
                } else if first_arg.is_unknown() {
                    let (args_str, hints) = explain_args(args);
                    let method = if is_accept { "accept" } else { "decline" };
                    let error_code = if is_accept {
                        errors::failed_to_analyze::ecmascript::MODULE_HOT_ACCEPT
                    } else {
                        errors::failed_to_analyze::ecmascript::MODULE_HOT_DECLINE
                    };
                    handler.span_warn_with_code(
                        span,
                        &format!(
                            "module.hot.{method}({args_str}) is not statically analyzable{hints}",
                        ),
                        DiagnosticId::Error(error_code.to_string()),
                    )
                }
            }
        }
        _ => {}
    };
    Ok(())
}

/// Extracts dependency strings from the first argument of module.hot.accept/decline.
/// Returns None if the argument is not a string or array of strings (e.g., it's a function
/// for self-accept).
fn extract_hot_dep_strings(arg: &JsValue) -> Option<Vec<RcStr>> {
    // Single string: module.hot.accept('./dep', cb)
    if let Some(s) = arg.as_str() {
        return Some(vec![s.into()]);
    }
    // Array of strings: module.hot.accept(['./dep-a', './dep-b'], cb)
    if let JsValue::Array { items, .. } = arg {
        let mut deps = Vec::new();
        for item in items {
            deps.push(item.as_str()?.into());
        }
        return Some(deps);
    }
    None
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
        let has_member = state.free_var_references_members.contains_key(prop).await?;
        let is_prop_cache = prop == "cache";

        // This isn't pretty, but we cannot await the future twice in the two branches below.
        let obj = if has_member || is_prop_cache {
            Some(link_obj.await?)
        } else {
            None
        };

        if has_member {
            let obj = obj.as_ref().unwrap();
            if let Some((mut name, false)) = obj.get_definable_name(Some(state.var_graph)) {
                name.0.push(DefinableNameSegmentRef::Name(prop));
                if let Some(value) = state
                    .compile_time_info_ref
                    .free_var_references
                    .get(&name)
                    .await?
                {
                    handle_free_var_reference(ast_path, &value, span, state, analysis).await?;
                    return Ok(());
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
    if let Some((mut name, false)) = arg.get_definable_name(Some(state.var_graph)) {
        name.0.push(DefinableNameSegmentRef::TypeOf);
        if let Some(value) = state
            .compile_time_info_ref
            .free_var_references
            .get(&name)
            .await?
        {
            handle_free_var_reference(ast_path, &value, span, state, analysis).await?;
            return Ok(());
        }
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
    if let Some((name, _)) = var.get_definable_name(None)
        && let Some(value) = state
            .compile_time_info_ref
            .free_var_references
            .get(&name)
            .await?
    {
        handle_free_var_reference(ast_path, &value, span, state, analysis).await?;
        return Ok(());
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
                        state.module,
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
                        export.clone().map(ModulePart::export),
                        // TODO This could be optimized. E.g. referencing `Buffer` in some top
                        // level function could set ImportUsage properly here
                        ImportUsage::TopLevel,
                        state.import_externals,
                        state.tree_shaking_mode,
                        None,
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
            let source_path = (*state.source).ident().await?.path.clone();
            let source_path = match kind {
                InputRelativeConstant::DirName => source_path.parent(),
                InputRelativeConstant::FileName => source_path,
            };
            analysis.add_code_gen(ConstantValueCodeGen::new(
                as_abs_path(source_path).into(),
                ast_path.to_vec().into(),
            ));
        }
        FreeVarReference::ReportUsage {
            message,
            severity,
            inner,
        } => {
            state.handler.emit_with_code(
                &span.into(),
                message,
                DiagnosticId::Error(
                    errors::failed_to_analyze::ecmascript::FREE_VAR_REFERENCE.to_string(),
                ),
                match severity {
                    IssueSeverity::Bug => Level::Bug,
                    IssueSeverity::Fatal => Level::Fatal,
                    IssueSeverity::Error => Level::Error,
                    IssueSeverity::Warning => Level::Warning,
                    IssueSeverity::Hint => Level::Help,
                    IssueSeverity::Info | IssueSeverity::Note => Level::Note,
                    IssueSeverity::Suggestion => Level::Cancelled,
                },
            );

            if let Some(inner) = inner {
                return Box::pin(handle_free_var_reference(
                    ast_path, inner, span, state, analysis,
                ))
                .await;
            }
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
    args: &[JsValue],
    error_mode: ResolveErrorMode,
) -> Result<()> {
    match args {
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
                error_mode,
            )
            .await?;
        }
        [JsValue::Array { items: deps, .. }, _] => {
            analyze_amd_define_with_deps(
                source, analysis, origin, handler, span, ast_path, None, deps, error_mode,
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
                error_mode,
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
                error_mode,
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
                error_mode,
            ));
        }
        [JsValue::Object { .. }] => {
            analysis.add_code_gen(AmdDefineWithDependenciesCodeGen::new(
                vec![],
                origin,
                ast_path.to_vec().into(),
                AmdDefineFactoryType::Value,
                issue_source(source, span),
                error_mode,
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
                error_mode,
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
    error_mode: ResolveErrorMode,
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
                        error_mode,
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
        error_mode,
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
    compile_time_info_ref: &CompileTimeInfo,
    var_graph: &VarGraph,
    attributes: &ImportAttributes,
    allow_project_root_tracing: bool,
) -> Result<(JsValue, bool)> {
    let (mut v, modified) = value_visitor_inner(
        origin,
        v,
        compile_time_info,
        compile_time_info_ref,
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
    compile_time_info_ref: &CompileTimeInfo,
    var_graph: &VarGraph,
    attributes: &ImportAttributes,
    allow_project_root_tracing: bool,
) -> Result<(JsValue, bool)> {
    let ImportAttributes { ignore, .. } = *attributes;
    if let Some((name, _)) = v.get_definable_name(Some(var_graph))
        && let Some(value) = compile_time_info_ref.defines.get(&name).await?
    {
        return Ok(((&*value).try_into()?, true));
    }
    let value = match v {
        JsValue::Call(_, call)
            if matches!(
                call.callee(),
                JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve)
            ) =>
        {
            let (_, args) = call.into_parts();
            require_resolve_visitor(origin, args).await?
        }
        JsValue::Call(_, ref call)
            if matches!(
                call.callee(),
                JsValue::WellKnownFunction(WellKnownFunctionKind::ImportMetaGlob)
            ) =>
        {
            // import.meta.glob() result is handled by the effect handler;
            // in value_visitor_inner we just return unknown.
            v.into_unknown(false, rcstr!("import.meta.glob()"))
        }
        JsValue::Call(_, call)
            if matches!(
                call.callee(),
                JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContext)
            ) =>
        {
            let (_, args) = call.into_parts();
            require_context_visitor(origin, args).await?
        }
        JsValue::Call(_, ref call)
            if matches!(
                call.callee(),
                JsValue::WellKnownFunction(
                    WellKnownFunctionKind::RequireContextRequire(..)
                        | WellKnownFunctionKind::RequireContextRequireKeys(..)
                        | WellKnownFunctionKind::RequireContextRequireResolve(..),
                )
            ) =>
        {
            // TODO: figure out how to do static analysis without invalidating the whole
            // analysis when a new file gets added
            v.into_unknown(
                true,
                rcstr!("require.context() static analysis is currently limited"),
            )
        }
        JsValue::Call(_, ref call)
            if matches!(
                call.callee(),
                JsValue::WellKnownFunction(WellKnownFunctionKind::CreateRequire)
            ) =>
        {
            if let [
                JsValue::Member(
                    _,
                    box JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta),
                    box JsValue::Constant(super::analyzer::ConstantValue::Str(prop)),
                ),
            ] = call.args()
                && prop.as_str() == "url"
            {
                // `createRequire(import.meta.url)`
                JsValue::WellKnownFunction(WellKnownFunctionKind::Require)
            } else if let [JsValue::Url(rel, JsValueUrlKind::Relative)] = call.args() {
                // `createRequire(new URL("<rel>", import.meta.url))`
                JsValue::WellKnownFunction(WellKnownFunctionKind::RequireFrom(Box::new(
                    rel.clone(),
                )))
            } else {
                v.into_unknown(true, rcstr!("createRequire() non constant"))
            }
        }
        JsValue::New(_, ref call)
            if matches!(
                call.callee(),
                JsValue::WellKnownFunction(WellKnownFunctionKind::URLConstructor)
            ) =>
        {
            if let [
                JsValue::Constant(super::analyzer::ConstantValue::Str(url)),
                JsValue::Member(
                    _,
                    box JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta),
                    box JsValue::Constant(super::analyzer::ConstantValue::Str(prop)),
                ),
            ] = call.args()
            {
                if prop.as_str() == "url" {
                    JsValue::Url(url.clone(), JsValueUrlKind::Relative)
                } else {
                    v.into_unknown(true, rcstr!("new URL() non constant"))
                }
            } else {
                v.into_unknown(true, rcstr!("new non constant"))
            }
        }
        JsValue::WellKnownFunction(
            WellKnownFunctionKind::PathJoin
            | WellKnownFunctionKind::PathResolve(_)
            | WellKnownFunctionKind::FsReadMethod(_)
            | WellKnownFunctionKind::FsReadDir
            | WellKnownFunctionKind::ChildProcessSpawnMethod(_)
            | WellKnownFunctionKind::ChildProcessFork,
        ) => {
            if ignore {
                return Ok((
                    JsValue::unknown(v, true, rcstr!("ignored well known function")),
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
                rcstr!("ignored require"),
            ),
            "import" => JsValue::unknown_if(
                ignore,
                JsValue::WellKnownFunction(WellKnownFunctionKind::Import),
                true,
                rcstr!("ignored import"),
            ),
            "Worker" => JsValue::unknown_if(
                ignore,
                JsValue::WellKnownFunction(WellKnownFunctionKind::WorkerConstructor),
                true,
                rcstr!("ignored Worker constructor"),
            ),
            "SharedWorker" => JsValue::unknown_if(
                ignore,
                JsValue::WellKnownFunction(WellKnownFunctionKind::SharedWorkerConstructor),
                true,
                rcstr!("ignored SharedWorker constructor"),
            ),
            "define" => JsValue::WellKnownFunction(WellKnownFunctionKind::Define),
            "URL" => JsValue::WellKnownFunction(WellKnownFunctionKind::URLConstructor),
            "process" => JsValue::WellKnownObject(WellKnownObjectKind::NodeProcessModule),
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
            .unwrap_or_else(|| {
                v.into_unknown(true, rcstr!("cross module analyzing is not yet supported"))
            }),
        JsValue::Argument(..) => v.into_unknown(
            true,
            rcstr!("cross function analyzing is not yet supported"),
        ),
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
            ResolveErrorMode::Warn,
        )
        .to_resolved()
        .await?;
        let mut values =
            resolved
                .await?
                .primary_sources()
                .map(|source| async move {
                    Ok(require_resolve(source.ident().await?.path.clone()).into())
                })
                .try_join()
                .await?;

        match values.len() {
            0 => JsValue::unknown(
                JsValue::call_from_parts(
                    JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve),
                    args,
                ),
                false,
                rcstr!("unresolvable request"),
            ),
            1 => values.pop().unwrap(),
            _ => JsValue::alternatives(values),
        }
    } else {
        JsValue::unknown(
            JsValue::call_from_parts(
                JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve),
                args,
            ),
            true,
            rcstr!("only a single argument is supported"),
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
                JsValue::call_from_parts(
                    JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContext),
                    args,
                ),
                true,
                PrettyPrintError(&err).to_string().into(),
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
        ResolveErrorMode::Warn,
    );

    Ok(JsValue::WellKnownFunction(
        WellKnownFunctionKind::RequireContextRequire(Box::new(
            RequireContextValue::from_context_map(map).await?,
        )),
    ))
}

#[derive(Hash, Debug, Clone, Eq, PartialEq, TraceRawVcs, Encode, Decode)]
pub struct AstPath(
    #[bincode(with_serde)]
    #[turbo_tasks(trace_ignore)]
    Vec<AstParentKind>,
);

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

pub static TURBOPACK_HELPER: LazyLock<Atom> = LazyLock::new(|| atom!("__turbopack-helper__"));
pub static TURBOPACK_HELPER_WTF8: LazyLock<Wtf8Atom> =
    LazyLock::new(|| atom!("__turbopack-helper__").into());

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
            &box JsValue::WellKnownObject(WellKnownObjectKind::NodeProcessArgv),
            &box JsValue::Constant(JsConstantValue::Num(ConstantNumber(num))),
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
