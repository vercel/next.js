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
pub mod service_worker;
pub mod type_issue;
pub mod typescript;
pub mod unreachable;
pub mod util;
pub mod worker;

#[cfg(feature = "sync")]
use std::cell::OnceCell;
#[cfg(not(feature = "sync"))]
use std::future::Future;
use std::{
    mem::{replace, take},
    ops::Deref,
    sync::{Arc, LazyLock},
};

use anyhow::Result;
use bincode::{Decode, Encode};
use bumpalo::boxed::Box as BumpBox;
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
#[cfg(not(feature = "sync"))]
use tokio::sync::OnceCell;
use turbo_rcstr::{RcStr, rcstr};
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, PrettyPrintError, ReadRef, ResolvedVc, TaskInput,
    Upcast, ValueToString, Vc, trace::TraceRawVcs, turbofmt,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
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
        Bump, BumpVec, ConstantNumber, ConstantString, ConstantValue as JsConstantValue, JsValue,
        JsValueUrlKind, ObjectPart, RequireContextValue, ThreadLocal, WellKnownFunctionKind,
        WellKnownObjectKind,
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

/// Runs `$body` (or evaluates `$e`) inside `$span`. The async build instruments an
/// async block and awaits it — identical to the previous
/// `async { .. }.instrument(span).await` — while the sync build simply enters the span
/// for the duration of the now-synchronous body.
macro_rules! instrumented {
    ($span:expr, $body:block) => {{
        #[cfg(not(feature = "sync"))]
        let __result = tracing::Instrument::instrument(async { $body }, $span).await;
        #[cfg(feature = "sync")]
        let __result = {
            let __enter = $span.entered();
            $body
        };
        __result
    }};
    ($span:expr, $e:expr) => {{
        #[cfg(not(feature = "sync"))]
        let __result = tracing::Instrument::instrument($e, $span).await;
        #[cfg(feature = "sync")]
        let __result = {
            let __enter = $span.entered();
            $e
        };
        __result
    }};
}

/// File-local companion to `turbo_tasks::dual_fn!` for signatures the shared macro
/// cannot parse (lifetime parameters and inline bounds). The generic parameter list is
/// given in square brackets and spliced verbatim; the body is written once,
/// mode-agnostically (every await point through `turbo_tasks::read!`).
macro_rules! dual_fn_lt {
    (
        $(#[$attr:meta])*
        $vis:vis fn $name:ident [$($gen:tt)*] ($($args:tt)*) -> $ret:ty $body:block
    ) => {
        #[cfg(not(feature = "sync"))]
        $(#[$attr])*
        $vis async fn $name <$($gen)*> ($($args)*) -> $ret $body

        #[cfg(feature = "sync")]
        $(#[$attr])*
        $vis fn $name <$($gen)*> ($($args)*) -> $ret $body
    };
}

/// Like [`dual_fn_lt!`], but with fully separate async/sync signatures (for functions
/// whose generics, `where` clauses, or argument types differ per mode — e.g. an
/// `impl Future` argument that becomes a plain `Result` under sync). The single body
/// must be mode-agnostic (every await point through `turbo_tasks::read!`).
macro_rules! dual_fn_sig {
    (
        $(#[$attr:meta])*
        async: $vis:vis fn $name:ident [$($agen:tt)*] ($($aargs:tt)*) -> $aret:ty
            where [$($awhere:tt)*];
        sync: fn [$($sgen:tt)*] ($($sargs:tt)*) -> $sret:ty where [$($swhere:tt)*];
        $body:block
    ) => {
        #[cfg(not(feature = "sync"))]
        $(#[$attr])*
        $vis async fn $name <$($agen)*> ($($aargs)*) -> $aret where $($awhere)* $body

        #[cfg(feature = "sync")]
        $(#[$attr])*
        $vis fn $name <$($sgen)*> ($($sargs)*) -> $sret where $($swhere)* $body
    };
}

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
            turbo_tasks::read!(self.esm_references)?
                .iter()
                .map(|r| ResolvedVc::upcast(*r))
                .chain(self.references.iter().copied())
                .collect(),
        ))
    }

    #[turbo_tasks::function]
    pub async fn local_references(&self) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(
            turbo_tasks::read!(self.esm_local_references)?
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

    dual_fn_sig! {
        async: pub fn add_esm_reference_free_var [F, Fut] (
            &mut self,
            request: RcStr,
            on_insert: F,
        ) -> Result<ResolvedVc<EsmAssetReference>>
            where [
                F: FnOnce() -> Fut,
                Fut: Future<Output = Result<ResolvedVc<EsmAssetReference>>>,
            ];
        sync: fn [F] (
            &mut self,
            request: RcStr,
            on_insert: F,
        ) -> Result<ResolvedVc<EsmAssetReference>>
            where [F: FnOnce() -> Result<ResolvedVc<EsmAssetReference>>];
        {
            Ok(match self.esm_references_free_var.entry(request) {
                Entry::Occupied(e) => *e.get(),
                Entry::Vacant(e) => *e.insert(turbo_tasks::read!(on_insert())?),
            })
        }
    }

    turbo_tasks::dual_fn! {
    /// Builds the final analysis result. Resolves internal Vcs.
    pub fn build(
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
}

struct AnalysisState<'a> {
    handler: &'a Handler,
    module: ResolvedVc<EcmascriptModuleAsset>,
    source: ResolvedVc<Box<dyn Source>>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    origin_path: FileSystemPath,
    compile_time_info: ResolvedVc<CompileTimeInfo>,
    free_var_references_members: ResolvedVc<FreeVarReferencesMembers>,
    compile_time_info_ref: ReadRef<CompileTimeInfo>,
    arena: &'a ThreadLocal<Bump>,
    var_graph: VarGraph<'a>,
    /// Whether to allow tracing to reference files from the project root. This is used to prevent
    /// random node_modules packages from tracing the entire project due to some dynamic
    /// `path.join(foo, bar)` call.
    allow_project_root_tracing: bool,
    /// This is the current state of known values of function
    /// arguments.
    fun_args_values: Mutex<FxHashMap<u32, BumpVec<'a, JsValue<'a>>>>,
    var_cache: Mutex<FxHashMap<Id, JsValue<'a>>>,
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

impl<'a> AnalysisState<'a> {
    turbo_tasks::dual_fn! {
    /// Links a value to the graph, returning the linked value.
    fn link_value(
        &self,
        value: JsValue<'a>,
        attributes: &ImportAttributes,
    ) -> Result<JsValue<'a>> {
        Ok(turbo_tasks::read!(link(
            self.arena,
            &self.var_graph,
            value,
            &|value| early_value_visitor(self.arena, value),
            &|value| {
                value_visitor(
                    self.arena,
                    *self.origin,
                    &self.origin_path,
                    value,
                    *self.compile_time_info,
                    &self.compile_time_info_ref,
                    &self.var_graph,
                    attributes,
                    self.allow_project_root_tracing,
                )
            },
            &self.fun_args_values,
            &self.var_cache,
        ))
        ?
        .0)
    }
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
        name = display(turbo_tasks::read!(module.ident().to_string())?)
    );
    let result = instrumented!(span, analyze_ecmascript_module_internal(module, part));

    match result {
        Ok(result) => Ok(result),
        // ast-grep-ignore: no-context-turbofmt
        Err(err) => Err(err.context(turbo_tasks::read!(turbofmt!(
            "failed to analyze ecmascript module '{}'",
            module.ident()
        ))?)),
    }
}

turbo_tasks::dual_fn! {
fn analyze_ecmascript_module_internal(
    module: ResolvedVc<EcmascriptModuleAsset>,
    part: Option<ModulePart>,
) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
    let raw_module = turbo_tasks::read!(module)?;

    let source = raw_module.source;
    let ty = raw_module.ty;
    let options = raw_module.options;
    let options = turbo_tasks::read!(options)?;
    let import_externals = options.import_externals;
    let analyze_mode = options.analyze_mode;

    let origin = ResolvedVc::upcast::<Box<dyn ResolveOrigin>>(module);
    let origin_ref = turbo_tasks::read!(origin.into_trait_ref())?;
    let origin_path = origin_ref.origin_path();
    let path = &origin_path;
    let mut analysis = AnalyzeEcmascriptModuleResultBuilder::new(analyze_mode);
    #[cfg(debug_assertions)]
    {
        analysis.ident = turbo_tasks::read!(source.ident().to_string().owned())?;
    }

    let inner_assets = if let Some(assets) = raw_module.inner_assets {
        Some(turbo_tasks::read!(assets)?)
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
    } = *turbo_tasks::read!(module.determine_module_type())?;

    if let Some(package_json) = referenced_package_json {
        let span = tracing::trace_span!("package.json reference");
        instrumented!(span, {
            analysis.add_reference(
                turbo_tasks::read!(PackageJsonReference::new(package_json.clone())
                    .to_resolved())
                    ?,
            );
            anyhow::Ok(())
        })?;
    }

    if analyze_types {
        let span = tracing::trace_span!("tsconfig reference");
        instrumented!(span, {
            match &*turbo_tasks::read!(find_context_file(path.parent(), tsconfig(), false))? {
                FindContextFileResult::Found(tsconfig, _) => {
                    analysis.add_reference(
                        turbo_tasks::read!(TsConfigReference::new(*origin, tsconfig.clone())
                            .to_resolved())
                            ?,
                    );
                }
                FindContextFileResult::NotFound(_) => {}
            };
            anyhow::Ok(())
        })?;
    }

    let EcmascriptExportsAnalysis {
        exports: _,
        import_references,
        esm_reexport_reference_idxs,
        esm_evaluation_reference_idxs,
        // This reads the ParseResult, so it has to happen before the final_read_hint.
    } = &*turbo_tasks::read!(compute_ecmascript_module_exports(*module, part))?;

    let parsed = if !analyze_mode.is_code_gen() {
        // We are never code-gening the module, so we can drop the AST after the analysis.
        turbo_tasks::read!(parsed.final_read_hint())?
    } else {
        turbo_tasks::read!(parsed)?
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
        return turbo_tasks::read!(analysis.build(Default::default(), false));
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
    let compile_time_info = turbo_tasks::read!(compile_time_info_for_module_options(
        *raw_module.compile_time_info,
        is_esm,
        options.enable_typeof_window_inlining,
    )
    .to_resolved())
    ?;

    let pos = program.span().lo;
    if analyze_types {
        let span = tracing::trace_span!("type references");
        instrumented!(span, {
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
                                turbo_tasks::read!(TsReferencePathAssetReference::new(*origin, path.into())
                                    .to_resolved())
                                    ?,
                            );
                        } else if let Some(m) = REFERENCE_TYPES.captures(text) {
                            let types = &m[1];
                            analysis.add_reference(
                                turbo_tasks::read!(TsReferenceTypeAssetReference::new(*origin, types.into())
                                    .to_resolved())
                                    ?,
                            );
                        }
                    }
                }
            }
            anyhow::Ok(())
        })?;
    }

    if options.extract_source_map {
        let span = tracing::trace_span!("source map reference");
        instrumented!(span, {
            if let Some((source_map, reference)) =
                turbo_tasks::read!(parse_source_map_comment(source, source_mapping_url.as_deref(), &origin_path))
                    ?
            {
                analysis.set_source_map(source_map);
                if let Some(reference) = reference {
                    analysis.add_reference(reference);
                }
            }
            anyhow::Ok(())
        })?;
    }

    let (emitter, collector) = IssueEmitter::new(source, source_map.clone(), None);
    let handler = Handler::with_emitter(true, false, Box::new(emitter));

    let supports_block_scoping = *turbo_tasks::read!(compile_time_info
        .environment()
        .runtime_versions()
        .supports_block_scoping())
        ?;

    // TODO: we can do this when constructing the var graph
    let span = tracing::trace_span!("async module handling");
    instrumented!(span, {
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
            turbo_tasks::read!(AnalyzeIssue::new(
                IssueSeverity::Error,
                source.ident(),
                Vc::cell(rcstr!("unexpected top level await")),
                StyledString::Text(rcstr!("top level await is only supported in ESM modules."))
                    .cell(),
                None,
                Some(issue_source(source, span)),
            )
            .to_resolved())
            ?
            .emit();
        }
        anyhow::Ok(())
    })?;

    // The arena that owns every `JsValue` built during this analysis. Borrowed once here so all
    // uses share a single (covariant) reference lifetime; it is freed when the function returns.
    let arena = ThreadLocal::new();
    let arena = &arena;
    let mut var_graph = {
        let _span = tracing::trace_span!("analyze variable values").entered();
        let mut graph = None;
        set_handler_and_globals(&handler, globals, || {
            graph = Some(create_graph(
                arena.get_or_default(),
                program,
                eval_context,
                analyze_mode,
                supports_block_scoping,
            ));
        });
        graph.unwrap()
    };

    let span = tracing::trace_span!("effects processing");
    instrumented!(span, {
        analysis.code_gens.extend(take(&mut var_graph.code_gens));
        let effects = take(&mut var_graph.effects);
        let compile_time_info_ref = turbo_tasks::read!(compile_time_info)?;

        let mut analysis_state = AnalysisState {
            arena,
            handler: &handler,
            module,
            source,
            origin,
            origin_path: origin_path.clone(),
            compile_time_info,
            free_var_references_members: turbo_tasks::read!(compile_time_info_ref
                .free_var_references
                .members()
                .to_resolved())
                ?,
            compile_time_info_ref,
            var_graph,
            allow_project_root_tracing: !turbo_tasks::read!(source.ident())?.path.is_in_node_modules(),
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

        enum Action<'a> {
            Effect(Effect<'a>),
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

            let add_effects = |effects: BumpVec<'_, _>| {
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

                    analysis.add_code_gen(Unreachable::new(AstPathRange::StartAfter(
                        start_ast_path.to_vec(),
                    )));
                }
                Effect::Conditional {
                    mut condition,
                    kind,
                    ast_path: condition_ast_path,
                    span: _,
                } => {
                    // Don't replace condition with it's truth-y value, if it has side effects
                    // (e.g. function calls)
                    let condition_has_side_effects = condition.has_side_effects();

                    let condition = turbo_tasks::read!(analysis_state
                        .link_value(take(&mut *condition), ImportAttributes::empty_ref()))
                        ?;

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
                            queue_stack.get_mut().extend(
                                BumpVec::from($block.effects)
                                    .into_iter()
                                    .map(Action::Effect)
                                    .rev(),
                            )
                        };
                    }
                    match BumpBox::into_inner(kind) {
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
                                    for then in BumpVec::from(then) {
                                        active!(then);
                                    }
                                    for r#else in BumpVec::from(r#else) {
                                        inactive!(r#else);
                                    }
                                }
                                Some(false) => {
                                    condition!(ConstantConditionValue::Falsy);
                                    for then in BumpVec::from(then) {
                                        inactive!(then);
                                    }
                                    for r#else in BumpVec::from(r#else) {
                                        active!(r#else);
                                    }
                                }
                                None => {
                                    for then in BumpVec::from(then) {
                                        active!(then);
                                    }
                                    for r#else in BumpVec::from(r#else) {
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
                    mut func,
                    args,
                    ast_path,
                    span,
                    in_try,
                    new,
                } => {
                    let func = turbo_tasks::read!(analysis_state
                        .link_value(take(&mut *func), eval_context.imports.get_attributes(span)))
                        ?;

                    turbo_tasks::read!(handle_call(
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
                    ))
                    ?;
                }
                Effect::DynamicImport {
                    args,
                    ast_path,
                    span,
                    in_try,
                    export_usage,
                } => {
                    turbo_tasks::read!(handle_dynamic_import(
                        &ast_path,
                        span,
                        args,
                        &analysis_state,
                        &add_effects,
                        &mut analysis,
                        in_try,
                        eval_context.imports.get_attributes(span),
                        export_usage,
                    ))
                    ?;
                }
                Effect::MemberCall {
                    mut obj,
                    mut prop,
                    mut args,
                    ast_path,
                    span,
                    in_try,
                    new,
                } => {
                    let func = turbo_tasks::read!(analysis_state
                        .link_value(
                            JsValue::member(
                                arena.get_or_default(),
                                obj.clone_in(arena.get_or_default()),
                                take(&mut *prop),
                            ),
                            eval_context.imports.get_attributes(span),
                        ))
                        ?;

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
                        } = turbo_tasks::read!(analysis_state
                            .link_value(take(&mut *obj), eval_context.imports.get_attributes(span)))
                            ?
                    {
                        *value = turbo_tasks::read!(analysis_state
                            .link_value(take(value), ImportAttributes::empty_ref()))
                            ?;
                        if let JsValue::Function(_, func_ident, _) = value {
                            let mut closure_arg = JsValue::alternatives(take(values));
                            if mutable {
                                closure_arg.add_unknown_mutations(arena.get_or_default(), true);
                            }
                            analysis_state.fun_args_values.get_mut().insert(
                                *func_ident,
                                BumpVec::from_iter_in(arena.get_or_default(), [closure_arg]),
                            );
                            queue_stack.get_mut().push(Action::LeaveScope(*func_ident));
                            queue_stack.get_mut().extend(
                                BumpVec::from(replace(
                                    &mut block.effects,
                                    BumpVec::new().into_boxed_slice(),
                                ))
                                .into_iter()
                                .map(Action::Effect)
                                .rev(),
                            );
                            continue;
                        }
                    }

                    turbo_tasks::read!(handle_call(
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
                    ))
                    ?;
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
                            ast_path.to_vec().into(),
                        ));
                        continue;
                    }

                    if options.enable_exports_info_inlining && var == "__webpack_exports_info__" {
                        if analysis_state.first_webpack_exports_info {
                            analysis_state.first_webpack_exports_info = false;
                            analysis.add_code_gen(ExportsInfoBinding::new());
                        }
                        analysis.add_code_gen(ExportsInfoRef::new(ast_path.to_vec().into()));
                        continue;
                    }

                    // FreeVar("require") might be turbopackIgnore-d
                    if !turbo_tasks::read!(analysis_state
                        .link_value(
                            JsValue::FreeVar(var.clone()),
                            eval_context.imports.get_attributes(span),
                        ))
                        ?
                        .is_unknown()
                    {
                        // Call handle free var
                        turbo_tasks::read!(handle_free_var(
                            &ast_path,
                            JsValue::FreeVar(var),
                            span,
                            &analysis_state,
                            &mut analysis,
                        ))
                        ?;
                    }
                }
                Effect::Member {
                    mut obj,
                    mut prop,
                    ast_path,
                    span,
                } => {
                    debug_assert!(
                        analyze_mode.is_code_gen(),
                        "unexpected Effect::Member in tracing mode"
                    );

                    // Intentionally not awaited because `handle_member` reads this only when needed
                    let obj =
                        analysis_state.link_value(take(&mut *obj), ImportAttributes::empty_ref());

                    let prop = turbo_tasks::read!(analysis_state
                        .link_value(take(&mut *prop), ImportAttributes::empty_ref()))
                        ?;

                    turbo_tasks::read!(handle_member(&ast_path, obj, prop, span, &analysis_state, &mut analysis))
                        ?;
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
                        let chunking_type = turbo_tasks::read!(r)?.chunking_type();
                        analysis.add_reference_code_gen(
                            EsmModuleIdAssetReference::new(*r, chunking_type),
                            ast_path.to_vec().into(),
                        )
                    } else {
                        if matches!(
                            options.tree_shaking_mode,
                            Some(TreeShakingMode::ReexportsOnly)
                        ) {
                            // TODO move this logic into Effect creation itself and don't create new
                            // references after the fact here.
                            let original_reference = turbo_tasks::read!(r)?;
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
                                            original_reference
                                                .rewrite_for_export(ModulePart::export(
                                                    export.clone(),
                                                ))
                                                .resolved_cell()
                                        },
                                    );
                                analysis.add_code_gen(EsmBinding::new_keep_this(
                                    named_reference,
                                    Some(export),
                                    ast_path.to_vec().into(),
                                ));
                                continue;
                            }
                        }

                        analysis.add_esm_reference(esm_reference_index);
                        analysis.add_code_gen(EsmBinding::new(
                            *r,
                            export,
                            ast_path.to_vec().into(),
                        ));
                    }
                }
                Effect::TypeOf {
                    mut arg,
                    ast_path,
                    span,
                } => {
                    debug_assert!(
                        analyze_mode.is_code_gen(),
                        "unexpected Effect::TypeOf in tracing mode"
                    );
                    let arg = turbo_tasks::read!(analysis_state
                        .link_value(take(&mut *arg), ImportAttributes::empty_ref()))
                        ?;
                    turbo_tasks::read!(handle_typeof(&ast_path, arg, span, &analysis_state, &mut analysis))?;
                }
                Effect::ImportMeta { ast_path, span: _ } => {
                    debug_assert!(
                        analyze_mode.is_code_gen(),
                        "unexpected Effect::ImportMeta in tracing mode"
                    );
                    if analysis_state.first_import_meta {
                        analysis_state.first_import_meta = false;
                        analysis.add_code_gen(ImportMetaBinding::new(
                            turbo_tasks::read!(source.ident())?.path.clone(),
                            analysis_state
                                .compile_time_info_ref
                                .hot_module_replacement_enabled,
                        ));
                    }

                    analysis.add_code_gen(ImportMetaRef::new(ast_path.to_vec().into()));
                }
            }
        }
        anyhow::Ok(())
    })?;

    analysis.set_successful(true);

    turbo_tasks::read!(collector.emit(false))?;

    turbo_tasks::read!(analysis
        .build(
            import_references,
            matches!(
                options.tree_shaking_mode,
                Some(TreeShakingMode::ReexportsOnly)
            ),
        ))

}
}

#[turbo_tasks::function]
async fn compile_time_info_for_module_options(
    compile_time_info: Vc<CompileTimeInfo>,
    is_esm: bool,
    enable_typeof_window_inlining: Option<TypeofWindow>,
) -> Result<Vc<CompileTimeInfo>> {
    let compile_time_info = turbo_tasks::read!(compile_time_info)?;
    let free_var_references = compile_time_info.free_var_references;
    let defines = compile_time_info.defines;

    let mut free_var_references = turbo_tasks::read!(free_var_references.owned())?;
    let mut defines = turbo_tasks::read!(defines.owned())?;

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

dual_fn_lt! {
fn handle_call ['a, G: Fn(BumpVec<'a, Effect<'a>>) + Send + Sync] (
    ast_path: &[AstParentKind],
    span: Span,
    func: JsValue<'a>,
    args: BumpVec<'a, EffectArg<'a>>,
    state: &AnalysisState<'a>,
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
                add_effects(BumpVec::from(BumpBox::into_inner(block).effects));
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
    #[cfg(not(feature = "sync"))]
    let linked_args = || async {
        linked_args_cache
            .get_or_try_init(|| async {
                unlinked_args
                    .iter()
                    .map(|arg| arg.clone_in(state.arena.get_or_default()))
                    .map(|arg| state.link_value(arg, ImportAttributes::empty_ref()))
                    .try_join()
                    .await
            })
            .await
    };
    #[cfg(feature = "sync")]
    let linked_args = || -> Result<&Vec<JsValue<'a>>> {
        if linked_args_cache.get().is_none() {
            let mut linked = Vec::with_capacity(unlinked_args.len());
            for arg in unlinked_args.iter() {
                let arg = arg.clone_in(state.arena.get_or_default());
                linked.push(turbo_tasks::read!(
                    state.link_value(arg, ImportAttributes::empty_ref())
                )?);
            }
            let _ = linked_args_cache.set(linked);
        }
        Ok(linked_args_cache.get().unwrap())
    };

    match func {
        JsValue::Alternatives {
            total_nodes: _,
            values,
            logical_property: _,
        } => {
            for alt in values {
                if let JsValue::WellKnownFunction(wkf) = alt {
                    turbo_tasks::read!(handle_well_known_function_call(
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
                    ))
                    ?;
                }
            }
        }
        JsValue::WellKnownFunction(wkf) => {
            turbo_tasks::read!(handle_well_known_function_call(
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
            ))
            ?;
        }
        _ => {}
    }

    Ok(())
}
}

dual_fn_lt! {
fn handle_dynamic_import ['a, G: Fn(BumpVec<'a, Effect<'a>>) + Send + Sync] (
    ast_path: &[AstParentKind],
    span: Span,
    args: BumpVec<'a, EffectArg<'a>>,
    state: &AnalysisState<'a>,
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
                add_effects(BumpVec::from(BumpBox::into_inner(block).effects));
                value
            }
            EffectArg::Spread => {
                JsValue::unknown_empty(true, rcstr!("spread is not supported yet"))
            }
        })
        .collect();

    #[cfg(not(feature = "sync"))]
    let linked_args = turbo_tasks::read!(unlinked_args
        .iter()
        .map(|arg| arg.clone_in(state.arena.get_or_default()))
        .map(|arg| state.link_value(arg, ImportAttributes::empty_ref()))
        .try_join())
        ?;
    #[cfg(feature = "sync")]
    let linked_args = {
        let mut linked = Vec::with_capacity(unlinked_args.len());
        for arg in unlinked_args.iter() {
            let arg = arg.clone_in(state.arena.get_or_default());
            linked.push(turbo_tasks::read!(
                state.link_value(arg, ImportAttributes::empty_ref())
            )?);
        }
        linked
    };

    turbo_tasks::read!(handle_dynamic_import_with_linked_args(
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
    ))

}
}

turbo_tasks::dual_fn! {
fn handle_dynamic_import_with_linked_args(
    ast_path: &[AstParentKind],
    span: Span,
    linked_args: &[JsValue<'_>],
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
            turbo_tasks::read!(EsmAsyncAssetReference::new(
                origin,
                turbo_tasks::read!(Request::parse(pat).to_resolved())?,
                issue_source(source, span),
                import_annotations,
                error_mode,
                import_externals,
                export_usage,
                resolve_override,
            ))
            ?,
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
}

turbo_tasks::dual_fn! {
/// Computes the directory that `fs.readFileSync("./foo")`-style relative accesses are
/// traced against.
///
/// readFileSync("./foo") should always be relative to the project root, but this is
/// dangerous inside of node_modules as it can cause a lot of false positives in the
/// tracing, if some package does `path.join(dynamic)`, it would include
/// everything from the project root as well.
///
/// Also, when there's no cwd set (i.e. in a tracing-specific module context, as we
/// shouldn't assume a `process.cwd()` for all of node_modules), fallback to
/// the source file directory. This still allows relative file accesses, just
/// not from the project root.
fn traced_project_dir(
    state: &AnalysisState<'_>,
    compile_time_info: ResolvedVc<CompileTimeInfo>,
    source: ResolvedVc<Box<dyn Source>>,
) -> Result<FileSystemPath> {
    if state.allow_project_root_tracing
        && let Some(cwd) = turbo_tasks::read!(compile_time_info.environment().cwd().owned())?
    {
        Ok(cwd)
    } else {
        Ok(turbo_tasks::read!(source.ident())?.path.parent())
    }
}
}

dual_fn_sig! {
    async: fn handle_well_known_function_call ['a, 'l, F, Fut] (
        func: WellKnownFunctionKind<'a>,
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
        state: &AnalysisState<'a>,
        collect_affecting_sources: bool,
        tracing_only: bool,
        attributes: &ImportAttributes,
    ) -> Result<()>
        where [
            'a: 'l,
            F: Fn() -> Fut,
            Fut: Future<Output = Result<&'l Vec<JsValue<'a>>>>,
        ];
    sync: fn ['a, 'l, F] (
        func: WellKnownFunctionKind<'a>,
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
        state: &AnalysisState<'a>,
        collect_affecting_sources: bool,
        tracing_only: bool,
        attributes: &ImportAttributes,
    ) -> Result<()>
        where [
            'a: 'l,
            F: Fn() -> Result<&'l Vec<JsValue<'a>>>,
        ];
{
    fn explain_args(args: &[JsValue<'_>]) -> (String, String) {
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

    let get_issue_source =
        || IssueSource::from_swc_offsets(source, span.lo.to_u32(), span.hi.to_u32());
    if new {
        match func {
            WellKnownFunctionKind::URLConstructor => {
                let args = turbo_tasks::read!(linked_args())?;
                if let [url, JsValue::Member(_, member_obj, member_prop)] = &args[..]
                    && let JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta) = &**member_obj
                    && let JsValue::Constant(super::analyzer::ConstantValue::Str(meta_prop)) =
                        &**member_prop
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
                            turbo_tasks::read!(Request::parse(pat).to_resolved())?,
                            *turbo_tasks::read!(compile_time_info.environment().rendering())?,
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
                let args = turbo_tasks::read!(linked_args())?;
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

                    if *turbo_tasks::read!(compile_time_info.environment().rendering())? == Rendering::Client {
                        let error_mode = if in_try {
                            ResolveErrorMode::Warn
                        } else {
                            ResolveErrorMode::Error
                        };
                        analysis.add_reference_code_gen(
                            WorkerAssetReference::new_web_worker(
                                origin,
                                turbo_tasks::read!(Request::parse(pat).to_resolved())?,
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
                let args = turbo_tasks::read!(linked_args())?;
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
                        turbo_tasks::read!(origin.into_trait_ref())?.origin_path().parent()
                    } else {
                        turbo_tasks::read!(traced_project_dir(state, compile_time_info, source))?
                    };
                    analysis.add_reference_code_gen(
                        WorkerAssetReference::new_node_worker_thread(
                            origin,
                            context_dir,
                            turbo_tasks::read!(Pattern::new(pat).to_resolved())?,
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
            let args = turbo_tasks::read!(linked_args())?;
            let export_usage = match &attributes.export_names {
                Some(names) if names.is_empty() => ExportUsage::Evaluation,
                Some(names) => ExportUsage::PartialNamespaceObject(names.clone()),
                None => ExportUsage::All,
            };
            turbo_tasks::read!(handle_dynamic_import_with_linked_args(
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
            ))
            ?;
        }
        WellKnownFunctionKind::Require => {
            let args = turbo_tasks::read!(linked_args())?;
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
                        turbo_tasks::read!(Request::parse(pat).to_resolved())?,
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
            let args = turbo_tasks::read!(linked_args())?;
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
                let origin_ref = turbo_tasks::read!(origin.into_trait_ref())?;
                let origin = ResolvedVc::upcast(
                    turbo_tasks::read!(PlainResolveOrigin::new(
                        *origin_ref.asset_context(),
                        origin_ref
                            .origin_path()
                            .parent()
                            .join(rel.as_str())?
                            .join("_")?,
                    )
                    .to_resolved())
                    ?,
                );

                analysis.add_reference_code_gen(
                    CjsRequireAssetReference::new(
                        origin,
                        turbo_tasks::read!(Request::parse(pat).to_resolved())?,
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
            turbo_tasks::read!(analyze_amd_define(
                source,
                analysis,
                origin,
                handler,
                span,
                ast_path,
                turbo_tasks::read!(linked_args())?,
                error_mode,
            ))
            ?;
        }

        WellKnownFunctionKind::RequireResolve => {
            let args = turbo_tasks::read!(linked_args())?;
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
                        turbo_tasks::read!(Request::parse(pat).to_resolved())?,
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
            let args = turbo_tasks::read!(linked_args())?;
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
            let args = turbo_tasks::read!(linked_args())?;
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
                turbo_tasks::read!(RequireContextAssetReference::new(
                    source,
                    origin,
                    options.dir,
                    options.include_subdirs,
                    options.filter.cell(),
                    Some(issue_source(source, span)),
                    error_mode,
                ))
                ?,
                ast_path.to_vec().into(),
            );
        }

        WellKnownFunctionKind::FsReadMethod(name) if analysis.analyze_mode.is_tracing_assets() => {
            let args = turbo_tasks::read!(linked_args())?;
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
                    turbo_tasks::read!(FileSourceReference::new(
                        turbo_tasks::read!(traced_project_dir(state, compile_time_info, source))?,
                        Pattern::new(pat),
                        collect_affecting_sources,
                        get_issue_source(),
                    )
                    .to_resolved())
                    ?,
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
            let args = turbo_tasks::read!(linked_args())?;
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
                    turbo_tasks::read!(DirAssetReference::new(
                        turbo_tasks::read!(traced_project_dir(state, compile_time_info, source))?,
                        Pattern::new(pat),
                        get_issue_source(),
                    )
                    .to_resolved())
                    ?,
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
            let parent_path = turbo_tasks::read!(origin.into_trait_ref())?.origin_path().parent();
            let args = turbo_tasks::read!(linked_args())?;

            let linked_func_call = turbo_tasks::read!(state
                .link_value(
                    JsValue::call_from_parts(
                        state.arena.get_or_default(),
                        JsValue::WellKnownFunction(WellKnownFunctionKind::PathResolve(
                            state
                                .arena
                                .get_or_default()
                                .alloc(parent_path.path.as_str().into()),
                        )),
                        BumpVec::from_iter_in(
                            state.arena.get_or_default(),
                            args.iter()
                                .map(|a| a.clone_in(state.arena.get_or_default())),
                        ),
                    ),
                    ImportAttributes::empty_ref(),
                ))
                ?;

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
                turbo_tasks::read!(DirAssetReference::new(
                    turbo_tasks::read!(traced_project_dir(state, compile_time_info, source))?,
                    Pattern::new(pat),
                    get_issue_source(),
                )
                .to_resolved())
                ?,
            );
            return Ok(());
        }
        WellKnownFunctionKind::PathJoin if analysis.analyze_mode.is_tracing_assets() => {
            // ignore path.join in `node-gyp`, it will includes too many files
            if turbo_tasks::read!(source
                .ident())
                ?
                .path
                .path
                .contains("node_modules/node-gyp")
            {
                return Ok(());
            }
            let args = turbo_tasks::read!(linked_args())?;
            let linked_func_call = turbo_tasks::read!(state
                .link_value(
                    JsValue::call_from_parts(
                        state.arena.get_or_default(),
                        JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
                        BumpVec::from_iter_in(
                            state.arena.get_or_default(),
                            args.iter()
                                .map(|a| a.clone_in(state.arena.get_or_default())),
                        ),
                    ),
                    ImportAttributes::empty_ref(),
                ))
                ?;
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
                turbo_tasks::read!(DirAssetReference::new(
                    turbo_tasks::read!(traced_project_dir(state, compile_time_info, source))?,
                    Pattern::new(pat),
                    get_issue_source(),
                )
                .to_resolved())
                ?,
            );
            return Ok(());
        }
        WellKnownFunctionKind::ChildProcessSpawnMethod(name)
            if analysis.analyze_mode.is_tracing_assets() =>
        {
            let args = turbo_tasks::read!(linked_args())?;

            // Is this specifically `spawn(process.argv[0], ['-e', ...])`?
            if is_invoking_node_process_eval(args) {
                return Ok(());
            }

            if !args.is_empty() {
                let mut show_dynamic_warning = false;
                let pat = js_value_to_pattern(&args[0]);
                if pat.is_match_ignore_dynamic("node") && args.len() >= 2 {
                    let first_arg = JsValue::member(
                        state.arena.get_or_default(),
                        args[1].clone_in(state.arena.get_or_default()),
                        0_f64.into(),
                    );
                    let first_arg = turbo_tasks::read!(state
                        .link_value(first_arg, ImportAttributes::empty_ref()))
                        ?;
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
                            turbo_tasks::read!(CjsAssetReference::new(
                                *origin,
                                Request::parse(pat),
                                issue_source(source, span),
                                error_mode,
                            )
                            .to_resolved())
                            ?,
                        );
                    }
                }
                let dynamic = !pat.has_constant_parts();
                if dynamic {
                    show_dynamic_warning = true;
                }
                if !dynamic || !ignore_dynamic_requests {
                    analysis.add_reference(
                        turbo_tasks::read!(FileSourceReference::new(
                            turbo_tasks::read!(traced_project_dir(state, compile_time_info, source))?,
                            Pattern::new(pat),
                            collect_affecting_sources,
                            IssueSource::from_swc_offsets(
                                source,
                                span.lo.to_u32(),
                                span.hi.to_u32(),
                            ),
                        )
                        .to_resolved())
                        ?,
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
            let args = turbo_tasks::read!(linked_args())?;
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
                    turbo_tasks::read!(CjsAssetReference::new(
                        *origin,
                        Request::parse(pat),
                        issue_source(source, span),
                        error_mode,
                    )
                    .to_resolved())
                    ?,
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

            let args = turbo_tasks::read!(linked_args())?;
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
                    turbo_tasks::read!(NodePreGypConfigReference::new(
                        turbo_tasks::read!(origin.into_trait_ref())?.origin_path().parent(),
                        Pattern::new(pat),
                        compile_time_info.environment().compile_target(),
                        collect_affecting_sources,
                    )
                    .to_resolved())
                    ?,
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

            let args = turbo_tasks::read!(linked_args())?;
            if args.len() == 1 {
                let first_arg = turbo_tasks::read!(state
                    .link_value(
                        args[0].clone_in(state.arena.get_or_default()),
                        ImportAttributes::empty_ref(),
                    ))
                    ?;
                if let Some(s) = first_arg.as_str() {
                    // TODO this resolving should happen within Vc<NodeGypBuildReference>
                    let current_context = turbo_tasks::read!(turbo_tasks::read!(origin
                        .into_trait_ref())
                        ?
                        .origin_path()
                        .root())
                        ?
                        .join(s.trim_start_matches("/ROOT/"))?;
                    analysis.add_reference(
                        turbo_tasks::read!(NodeGypBuildReference::new(
                            current_context,
                            collect_affecting_sources,
                            compile_time_info.environment().compile_target(),
                        )
                        .to_resolved())
                        ?,
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

            let args = turbo_tasks::read!(linked_args())?;
            if args.len() == 1 {
                let first_arg = turbo_tasks::read!(state
                    .link_value(
                        args[0].clone_in(state.arena.get_or_default()),
                        ImportAttributes::empty_ref(),
                    ))
                    ?;
                if let Some(s) = first_arg.as_str() {
                    analysis.add_reference(
                        turbo_tasks::read!(NodeBindingsReference::new(
                            turbo_tasks::read!(origin.into_trait_ref())?.origin_path(),
                            s.into(),
                            collect_affecting_sources,
                        )
                        .to_resolved())
                        ?,
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
            let args = turbo_tasks::read!(linked_args())?;
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
                                let linked_func_call = turbo_tasks::read!(state
                                    .link_value(
                                        JsValue::call_from_iter(
                                            state.arena.get_or_default(),
                                            JsValue::WellKnownFunction(
                                                WellKnownFunctionKind::PathJoin,
                                            ),
                                            [
                                                JsValue::FreeVar(atom!("__dirname")),
                                                pkg_or_dir.clone_in(state.arena.get_or_default()),
                                            ],
                                        ),
                                        ImportAttributes::empty_ref(),
                                    ))
                                    ?;
                                js_value_to_pattern(&linked_func_call)
                            };
                            analysis.add_reference(
                                turbo_tasks::read!(DirAssetReference::new(
                                    turbo_tasks::read!(traced_project_dir(state, compile_time_info, source))?,
                                    Pattern::new(abs_pattern),
                                    get_issue_source(),
                                )
                                .to_resolved())
                                ?,
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
                                    turbo_tasks::read!(CjsAssetReference::new(
                                        *origin,
                                        Request::parse(pat),
                                        issue_source(source, span),
                                        error_mode,
                                    )
                                    .to_resolved())
                                    ?,
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
            let args = turbo_tasks::read!(linked_args())?;
            if let Some(p) = args.first().and_then(|arg| arg.as_str()) {
                let abs_pattern = if p.starts_with("/ROOT/") {
                    Pattern::Constant(format!("{p}/intl").into())
                } else {
                    let linked_func_call = turbo_tasks::read!(state
                        .link_value(
                            JsValue::call_from_iter(
                                state.arena.get_or_default(),
                                JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
                                [
                                    JsValue::FreeVar(atom!("__dirname")),
                                    p.into(),
                                    atom!("intl").into(),
                                ],
                            ),
                            ImportAttributes::empty_ref(),
                        ))
                        ?;
                    js_value_to_pattern(&linked_func_call)
                };
                analysis.add_reference(
                    turbo_tasks::read!(DirAssetReference::new(
                        turbo_tasks::read!(traced_project_dir(state, compile_time_info, source))?,
                        Pattern::new(abs_pattern),
                        get_issue_source(),
                    )
                    .to_resolved())
                    ?,
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
            let args = turbo_tasks::read!(linked_args())?;
            if args.len() == 2 && args.get(1).and_then(|arg| arg.as_str()).is_some() {
                let error_mode = if in_try {
                    ResolveErrorMode::Warn
                } else {
                    ResolveErrorMode::Error
                };
                analysis.add_reference(
                    turbo_tasks::read!(CjsAssetReference::new(
                        *origin,
                        Request::parse(js_value_to_pattern(&args[1])),
                        issue_source(source, span),
                        error_mode,
                    )
                    .to_resolved())
                    ?,
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
            let args = turbo_tasks::read!(linked_args())?;
            if args.len() == 2
                && let Some(JsValue::Object { parts, .. }) = args.get(1)
            {
                let context_dir = turbo_tasks::read!(traced_project_dir(state, compile_time_info, source))?;
                // Collected eagerly so no closure-carrying iterator is held across the
                // await points below (the async build cannot prove those higher-ranked
                // closure bounds for the generated future).
                let include_dirs: Vec<&str> = parts
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
                    .collect();
                for dir in include_dirs {
                    let resolved_dir_ref = turbo_tasks::read!(DirAssetReference::new(
                        context_dir.clone(),
                        Pattern::new(Pattern::Constant(dir.into())),
                        get_issue_source(),
                    )
                    .to_resolved())
                    ?;
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
            let args = turbo_tasks::read!(linked_args())?;
            if let Some(first_arg) = args.first() {
                if let Some(dep_strings) = extract_hot_dep_strings(first_arg) {
                    let mut references = Vec::new();
                    let mut esm_references = Vec::new();
                    for dep_str in &dep_strings {
                        let request = turbo_tasks::read!(Request::parse_string(dep_str.clone()).to_resolved())?;
                        let reference = turbo_tasks::read!(ModuleHotReferenceAssetReference::new(
                            *origin,
                            *request,
                            issue_source(source, span),
                            error_mode,
                            state.is_esm,
                        )
                        .to_resolved())
                        ?;
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
}

/// Extracts dependency strings from the first argument of module.hot.accept/decline.
/// Returns None if the argument is not a string or array of strings (e.g., it's a function
/// for self-accept).
fn extract_hot_dep_strings(arg: &JsValue<'_>) -> Option<Vec<RcStr>> {
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

dual_fn_sig! {
    async: fn handle_member ['a] (
        ast_path: &[AstParentKind],
        link_obj: impl Future<Output = Result<JsValue<'a>>> + Send + Sync,
        prop: JsValue<'a>,
        span: Span,
        state: &AnalysisState<'a>,
        analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
    ) -> Result<()>
        where [];
    // Under sync, `link_value` runs eagerly at the call site, so the "lazy" object link
    // arrives as an already-computed `Result` (`read!` reads it by identity).
    sync: fn ['a] (
        ast_path: &[AstParentKind],
        link_obj: Result<JsValue<'a>>,
        prop: JsValue<'a>,
        span: Span,
        state: &AnalysisState<'a>,
        analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
    ) -> Result<()>
        where [];
{
    if let Some(prop) = prop.as_str() {
        let has_member = turbo_tasks::read!(state.free_var_references_members.contains_key(prop))?;
        let is_prop_cache = prop == "cache";

        // This isn't pretty, but we cannot await the future twice in the two branches below.
        let obj = if has_member || is_prop_cache {
            Some(turbo_tasks::read!(link_obj)?)
        } else {
            None
        };

        if has_member {
            let obj = obj.as_ref().unwrap();
            if let Some((mut name, false)) = obj.get_definable_name(Some(&state.var_graph)) {
                name.0.push(DefinableNameSegmentRef::Name(prop));
                if let Some(value) = turbo_tasks::read!(state
                    .compile_time_info_ref
                    .free_var_references
                    .get(&name))
                    ?
                {
                    turbo_tasks::read!(handle_free_var_reference(ast_path, &value, span, state, analysis))?;
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
}

dual_fn_lt! {
fn handle_typeof ['a] (
    ast_path: &[AstParentKind],
    arg: JsValue<'a>,
    span: Span,
    state: &AnalysisState<'a>,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
) -> Result<()> {
    if let Some((mut name, false)) = arg.get_definable_name(Some(&state.var_graph)) {
        name.0.push(DefinableNameSegmentRef::TypeOf);
        if let Some(value) = turbo_tasks::read!(state
            .compile_time_info_ref
            .free_var_references
            .get(&name))
            ?
        {
            turbo_tasks::read!(handle_free_var_reference(ast_path, &value, span, state, analysis))?;
            return Ok(());
        }
    }

    Ok(())
}
}

dual_fn_lt! {
fn handle_free_var ['a] (
    ast_path: &[AstParentKind],
    var: JsValue<'a>,
    span: Span,
    state: &AnalysisState<'a>,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
) -> Result<()> {
    if let Some((name, _)) = var.get_definable_name(None)
        && let Some(value) = turbo_tasks::read!(state
            .compile_time_info_ref
            .free_var_references
            .get(&name))
            ?
    {
        turbo_tasks::read!(handle_free_var_reference(ast_path, &value, span, state, analysis))?;
        return Ok(());
    }

    Ok(())
}
}

turbo_tasks::dual_fn! {
fn handle_free_var_reference(
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
            let esm_reference = turbo_tasks::read!(analysis
                .add_esm_reference_free_var(request.clone(), || free_var_esm_reference(
                    state,
                    request.clone(),
                    lookup_path.as_ref(),
                    export.clone(),
                    span,
                )))
                ?;

            analysis.add_code_gen(EsmBinding::new(
                esm_reference,
                export.clone(),
                ast_path.to_vec().into(),
            ));
        }
        FreeVarReference::InputRelative(kind) => {
            let source_path = turbo_tasks::read!((*state.source).ident())?.path.clone();
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
                // Recursion: the async build must box the recursive future; the sync
                // build simply recurses.
                #[cfg(not(feature = "sync"))]
                return Box::pin(handle_free_var_reference(
                    ast_path, inner, span, state, analysis,
                ))
                .await;
                #[cfg(feature = "sync")]
                return handle_free_var_reference(ast_path, inner, span, state, analysis);
            }
        }
    }
    Ok(true)
}
}

turbo_tasks::dual_fn! {
/// Creates the ad-hoc ESM reference backing a [`FreeVarReference::EcmaScriptModule`].
///
/// There would be no import in the first place if you don't reference the given
/// free var (e.g. `process`). This means that it's also fine to remove the
/// import again if the variable reference turns out be dead code in some later
/// stage of the build, thus mark the import call as /*@__PURE__*/.
fn free_var_esm_reference(
    state: &AnalysisState<'_>,
    request: RcStr,
    lookup_path: Option<&FileSystemPath>,
    export: Option<RcStr>,
    span: Span,
) -> Result<ResolvedVc<EsmAssetReference>> {
    Ok(turbo_tasks::read!(EsmAssetReference::new_pure(
        state.module,
        if let Some(lookup_path) = lookup_path {
            ResolvedVc::upcast(
                turbo_tasks::read!(PlainResolveOrigin::new(
                    *turbo_tasks::read!(state.origin.into_trait_ref())?.asset_context(),
                    lookup_path.clone(),
                )
                .to_resolved())
                ?,
            )
        } else {
            state.origin
        },
        request,
        IssueSource::from_swc_offsets(
            state.source,
            span.lo.to_u32(),
            span.hi.to_u32(),
        ),
        Default::default(),
        export.map(ModulePart::export),
        // TODO This could be optimized. E.g. referencing `Buffer` in some top
        // level function could set ImportUsage properly here
        ImportUsage::TopLevel,
        state.import_externals,
        state.tree_shaking_mode,
        None,
    ))
    ?
    .resolved_cell())
}
}

fn issue_source(source: ResolvedVc<Box<dyn Source>>, span: Span) -> IssueSource {
    IssueSource::from_swc_offsets(source, span.lo.to_u32(), span.hi.to_u32())
}

turbo_tasks::dual_fn! {
fn analyze_amd_define(
    source: ResolvedVc<Box<dyn Source>>,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    handler: &Handler,
    span: Span,
    ast_path: &[AstParentKind],
    args: &[JsValue<'_>],
    error_mode: ResolveErrorMode,
) -> Result<()> {
    match args {
        [JsValue::Constant(id), JsValue::Array { items: deps, .. }, _] if id.as_str().is_some() => {
            turbo_tasks::read!(analyze_amd_define_with_deps(
                source,
                analysis,
                origin,
                handler,
                span,
                ast_path,
                id.as_str(),
                deps,
                error_mode,
            ))
            ?;
        }
        [JsValue::Array { items: deps, .. }, _] => {
            turbo_tasks::read!(analyze_amd_define_with_deps(
                source, analysis, origin, handler, span, ast_path, None, deps, error_mode,
            ))
            ?;
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
}

turbo_tasks::dual_fn! {
fn analyze_amd_define_with_deps(
    source: ResolvedVc<Box<dyn Source>>,
    analysis: &mut AnalyzeEcmascriptModuleResultBuilder,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    handler: &Handler,
    span: Span,
    ast_path: &[AstParentKind],
    id: Option<&str>,
    deps: &[JsValue<'_>],
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
                    let request = turbo_tasks::read!(Request::parse_string(dep.into()).to_resolved())?;
                    let reference = turbo_tasks::read!(AmdDefineAssetReference::new(
                        *origin,
                        *request,
                        issue_source(source, span),
                        error_mode,
                    )
                    .to_resolved())
                    ?;
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

dual_fn_lt! {
fn early_value_visitor ['a] (
    _arena: &'a ThreadLocal<Bump>,
    mut v: JsValue<'a>,
) -> Result<(JsValue<'a>, bool)> {
    let modified = early_replace_builtin(&mut v);
    Ok((v, modified))
}
}

dual_fn_lt! {
fn value_visitor ['a] (
    arena: &'a ThreadLocal<Bump>,
    origin: Vc<Box<dyn ResolveOrigin>>,
    origin_path: &FileSystemPath,
    v: JsValue<'a>,
    compile_time_info: Vc<CompileTimeInfo>,
    compile_time_info_ref: &CompileTimeInfo,
    var_graph: &VarGraph<'a>,
    attributes: &ImportAttributes,
    allow_project_root_tracing: bool,
) -> Result<(JsValue<'a>, bool)> {
    let (mut v, modified) = turbo_tasks::read!(value_visitor_inner(
        arena,
        origin,
        origin_path,
        v,
        compile_time_info,
        compile_time_info_ref,
        var_graph,
        attributes,
        allow_project_root_tracing,
    ))
    ?;
    v.normalize_shallow(arena.get_or_default());
    Ok((v, modified))
}
}

dual_fn_lt! {
fn value_visitor_inner ['a] (
    arena: &'a ThreadLocal<Bump>,
    origin: Vc<Box<dyn ResolveOrigin>>,
    origin_path: &FileSystemPath,
    v: JsValue<'a>,
    compile_time_info: Vc<CompileTimeInfo>,
    compile_time_info_ref: &CompileTimeInfo,
    var_graph: &VarGraph<'a>,
    attributes: &ImportAttributes,
    allow_project_root_tracing: bool,
) -> Result<(JsValue<'a>, bool)> {
    let ImportAttributes { ignore, .. } = *attributes;
    if let Some((name, _)) = v.get_definable_name(Some(var_graph))
        && let Some(value) = turbo_tasks::read!(compile_time_info_ref.defines.get(&name))?
    {
        return Ok((
            JsValue::from_compile_time_define_value_in(arena.get_or_default(), &value)?,
            true,
        ));
    }
    let value = match v {
        JsValue::Call(_, call)
            if matches!(
                call.callee(),
                JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve)
            ) =>
        {
            let (_, args) = call.into_parts();
            turbo_tasks::read!(require_resolve_visitor(arena, origin, args))?
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
            turbo_tasks::read!(require_context_visitor(arena, origin, origin_path, args))?
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
            if let [JsValue::Member(_, member_obj, member_prop)] = call.args()
                && let JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta) = &**member_obj
                && let JsValue::Constant(super::analyzer::ConstantValue::Str(prop)) = &**member_prop
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
                JsValue::Member(_, member_obj, member_prop),
            ] = call.args()
                && let JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta) = &**member_obj
                && let JsValue::Constant(super::analyzer::ConstantValue::Str(prop)) = &**member_prop
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
            "__dirname" => as_abs_path(origin_path.parent()).into(),
            "__filename" => as_abs_path(origin_path.clone()).into(),

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
        JsValue::Module(ref mv) => turbo_tasks::read!(compile_time_info
            .environment()
            .node_externals())
            ?
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
                turbo_tasks::read!(replace_well_known(arena, v, compile_time_info, allow_project_root_tracing))?;
            modified = replace_builtin(arena.get_or_default(), &mut v) || modified;
            modified = modified || v.make_nested_operations_unknown();
            return Ok((v, modified));
        }
    };
    Ok((value, true))
}
}

dual_fn_lt! {
fn require_resolve_visitor ['a] (
    arena: &'a ThreadLocal<Bump>,
    origin: Vc<Box<dyn ResolveOrigin>>,
    args: BumpVec<'a, JsValue<'a>>,
) -> Result<JsValue<'a>> {
    Ok(if args.len() == 1 {
        let pat = js_value_to_pattern(&args[0]);
        let request = Request::parse(pat.clone());
        let resolved = turbo_tasks::read!(cjs_resolve_source(
            origin,
            request,
            CommonJsReferenceSubType::Undefined,
            None,
            ResolveErrorMode::Warn,
        )
        .to_resolved())
        ?;
        let resolved_ref = turbo_tasks::read!(resolved)?;
        let mut values: Vec<JsValue<'a>> =
            turbo_tasks::parallel!(resolved_ref.primary_sources().map(|source| source.ident()))?
                .into_iter()
                .map(|ident| require_resolve(ident.path.clone()).into())
                .collect();

        match values.len() {
            0 => JsValue::unknown(
                JsValue::call_from_parts(
                    arena.get_or_default(),
                    JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve),
                    args,
                ),
                false,
                rcstr!("unresolvable request"),
            ),
            1 => values.pop().unwrap(),
            _ => JsValue::alternatives(BumpVec::from_iter_in(arena.get_or_default(), values)),
        }
    } else {
        JsValue::unknown(
            JsValue::call_from_parts(
                arena.get_or_default(),
                JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve),
                args,
            ),
            true,
            rcstr!("only a single argument is supported"),
        )
    })
}
}

dual_fn_lt! {
fn require_context_visitor ['a] (
    arena: &'a ThreadLocal<Bump>,
    origin: Vc<Box<dyn ResolveOrigin>>,
    origin_path: &FileSystemPath,
    args: BumpVec<'a, JsValue<'a>>,
) -> Result<JsValue<'a>> {
    let options = match parse_require_context(&args) {
        Ok(options) => options,
        Err(err) => {
            return Ok(JsValue::unknown(
                JsValue::call_from_parts(
                    arena.get_or_default(),
                    JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContext),
                    args,
                ),
                true,
                PrettyPrintError(&err).to_string().into(),
            ));
        }
    };

    let dir = origin_path.parent().join(options.dir.as_str())?;

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
            turbo_tasks::read!(RequireContextValue::from_context_map(map))?,
        )),
    ))
}
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
fn is_invoking_node_process_eval(args: &[JsValue<'_>]) -> bool {
    if args.len() < 2 {
        return false;
    }

    if let JsValue::Member(_, obj, constant) = &args[0] {
        // Is the first argument to spawn `process.argv[]`?
        if let (
            JsValue::WellKnownObject(WellKnownObjectKind::NodeProcessArgv),
            JsValue::Constant(JsConstantValue::Num(ConstantNumber(num))),
        ) = (&**obj, &**constant)
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
