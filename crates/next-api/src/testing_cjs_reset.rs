//! Resettable ESM imports and a separately held compiled CommonJS require graph.
//! Certificates come from actual executable references, never source-text edges.
use std::collections::{HashMap, HashSet};

use anyhow::Result;
use async_trait::async_trait;
use next_core::{get_next_package, util::file_content_rope};
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{ClassMember, Expr, ExprStmt, Function, Lit, ModuleItem, Program, Prop, Stmt, Str},
        visit::{VisitMut, VisitMutWith},
    },
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::{File, FileContent, FileSystem, FileSystemPath, VirtualFileSystem};
use turbopack::{
    ModuleAssetContext,
    module_options::{
        ModuleOptionsContext, ModuleRule, ModuleRuleEffect, RuleCondition,
        transition_rule::TransitionRule,
    },
    transition::{FullContextTransition, Transition, TransitionOptions},
};
use turbopack_core::{
    asset::AssetContent,
    context::{AssetContext, ProcessResult},
    ident::Layer,
    module::Module,
    reference::{
        ModuleReference, primary_chunkable_referenced_modules, primary_referenced_modules,
    },
    reference_type::{
        CommonJsReferenceSubType, EcmaScriptModulesReferenceSubType, ReferenceType,
        ReferenceTypeCondition,
    },
    resolve::{
        ResolveErrorMode, ResolveResult,
        options::{ImportMap, ImportMapping},
        origin::PlainResolveOrigin,
        parse::Request,
    },
    source::Source,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::{
    CustomTransformer, EcmascriptInputTransform, EcmascriptInputTransforms, EcmascriptModuleAsset,
    TransformContext, TransformPlugin,
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    cjs_reset_export::{CommonJsResetExportShape, commonjs_reset_export_certificate},
    code_gen::CodeGen,
    module_fragments::part::module::EcmascriptModulePartAsset,
    references::{
        cjs::CjsRequireAssetReference, esm::EsmAsyncAssetReference,
        external_module::CachedExternalModule,
    },
    runtime_functions::TURBOPACK_GLOBAL,
    side_effect_optimization::locals::module::EcmascriptModuleLocalsModule,
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::{
    project::Project,
    testing::{
        canonical_test_source_identity, registration_module_resolve_options, static_mock_plan,
        test_input_error, test_source,
    },
    testing_mock_graph::{
        MockActualSource, mock_registration_source_with_helpers, mock_spec_source_with_imports,
    },
};

type TestModule = ResolvedVc<Box<dyn Module>>;
type TestSource = ResolvedVc<Box<dyn Source>>;

struct CommonJsRequireEdge {
    owner: TestModule,
    reference: ResolvedVc<CjsRequireAssetReference>,
    target: TestModule,
}

pub(crate) struct CommonJsResetRoot {
    pub original: TestModule,
    pub compiled: TestModule,
    pub namespace: TestModule,
}

pub(crate) struct CommonJsResetPreparation {
    pub context: ResolvedVc<ModuleAssetContext>,
    pub source: TestSource,
    pub roots: Vec<CommonJsResetRoot>,
    pub protected: Vec<TestModule>,
    actual_helper: Option<CommonJsActualResetHelper>,
    runtime_targets: Vec<CommonJsRuntimeTarget>,
}

pub(crate) struct CommonJsRuntimeTarget {
    request: String,
    original: TestModule,
    pub compiled: TestModule,
    pub namespace: TestModule,
    original_reference: ResolvedVc<CjsRequireAssetReference>,
}

struct RuntimeOriginal {
    request: String,
    module: TestModule,
}

struct ActualResetTarget {
    local: String,
    original: TestModule,
}

struct ActualResetReadsite {
    owner: TestModule,
    reference: ResolvedVc<EsmAsyncAssetReference>,
    request: ResolvedVc<Request>,
    target: TestModule,
}

struct CommonJsActualResetHelper {
    module: TestModule,
    readsites: Vec<ActualResetReadsite>,
}

async fn commonjs(module: TestModule) -> Result<bool> {
    let Some(placeable) = ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module)
    else {
        return Ok(false);
    };
    Ok(matches!(
        *placeable.get_exports().await?,
        EcmascriptExports::CommonJs(_) | EcmascriptExports::EmptyCommonJs
    ))
}

async fn full_owner(module: TestModule) -> Result<ResolvedVc<EcmascriptModuleAsset>> {
    let ident = module.ident().await?;
    let full = if let Some(full) = ResolvedVc::try_downcast_type::<EcmascriptModuleAsset>(module) {
        full
    } else if let Some(part) = ResolvedVc::try_downcast_type::<EcmascriptModulePartAsset>(module) {
        part.await?.full_module
    } else if let Some(locals) =
        ResolvedVc::try_downcast_type::<EcmascriptModuleLocalsModule>(module)
    {
        locals.await?.module
    } else {
        return Err(test_input_error(
            ident.path.clone(),
            "CommonJS reset certificates require the actual full compiler analysis owner",
        ));
    };
    Ok(full)
}

async fn authored_source(root: &FileSystemPath, module: TestModule) -> Result<TestSource> {
    let ident = module.ident().await?;
    let relative = root.get_path_to(&ident.path).ok_or_else(|| {
        test_input_error(
            ident.path.clone(),
            "CommonJS reset graphs must stay within the Next project",
        )
    })?;
    if relative.split('/').any(|part| part == "node_modules")
        || !ident.query.is_empty()
        || !ident.fragment.is_empty()
        || !commonjs(module).await?
    {
        return Err(test_input_error(
            ident.path.clone(),
            "CommonJS reset require edges need concrete project-local CommonJS targets",
        ));
    }
    let full = full_owner(module).await?;
    let analysis = full.analyze().await?;
    if !analysis.successful
        || analysis
            .code_generation
            .await?
            .code_gens
            .iter()
            .any(|code| matches!(code, CodeGen::DynamicExpression(_)))
    {
        return Err(test_input_error(
            ident.path.clone(),
            "CommonJS reset require edges must resolve exactly one compiled target; compiler \
             analysis retained unresolved executable expressions",
        ));
    }
    let plan = static_mock_plan(&ident.path).await?;
    crate::testing_mock_source::validate_mock_target_source(&plan.source, ident.path.file_name())
        .map_err(|error| test_input_error(ident.path.clone(), error.to_string()))?;
    if !plan.is_empty() {
        return Err(test_input_error(
            ident.path.clone(),
            "CommonJS reset dependencies cannot own module mock operations",
        ));
    }
    (*module.source().await?).ok_or_else(|| {
        test_input_error(
            ident.path.clone(),
            "CommonJS reset targets require actual compiler source identities",
        )
    })
}

async fn require_closure(
    root: &FileSystemPath,
    entries: &[TestModule],
) -> Result<(Vec<TestModule>, Vec<CommonJsRequireEdge>)> {
    let mut queue = entries.to_vec();
    let mut seen = HashSet::new();
    let mut modules = Vec::new();
    let mut edges = Vec::new();
    while let Some(module) = queue.pop() {
        if !seen.insert(module) {
            continue;
        }
        authored_source(root, module).await?;
        modules.push(module);
        for (reference, resolved) in primary_chunkable_referenced_modules(*module, false, false)
            .await?
            .iter()
        {
            let module_path = module.ident().await?.path.clone();
            let reference = ResolvedVc::try_downcast_type::<CjsRequireAssetReference>(*reference)
                .ok_or_else(|| {
                test_input_error(
                    module_path,
                    "CommonJS reset closures support only actual require evaluation edges",
                )
            })?;
            let [target] = resolved.modules.as_slice() else {
                return Err(test_input_error(
                    module.ident().await?.path.clone(),
                    "CommonJS reset require edges must resolve exactly one compiled target",
                ));
            };
            authored_source(root, *target).await?;
            edges.push(CommonJsRequireEdge {
                owner: module,
                reference,
                target: *target,
            });
            queue.push(*target);
        }
    }
    Ok((modules, edges))
}

#[turbo_tasks::value(shared)]
struct NamespaceTransition {
    source: TestSource,
    module: TestModule,
}

#[turbo_tasks::value_impl]
impl Transition for NamespaceTransition {
    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
        _context: Vc<ModuleAssetContext>,
        _reference_type: ReferenceType,
    ) -> Result<Vc<ProcessResult>> {
        let this = self.await?;
        if source.to_resolved().await? != this.source {
            return Err(test_input_error(
                source.ident().await?.path.clone(),
                "CommonJS reset source has conflicting actual compiler identities",
            ));
        }
        Ok(ProcessResult::Module(this.module).cell())
    }
}

async fn with_rules(
    context: ResolvedVc<ModuleAssetContext>,
    rules: Vec<TransitionRule>,
    layer: Layer,
) -> Result<ResolvedVc<ModuleAssetContext>> {
    let base = context.await?;
    let existing = base.transitions.await?;
    let mut all = existing.transition_rules.clone();
    all.extend(rules);
    let transitions = TransitionOptions {
        named_transitions: existing.named_transitions.clone(),
        transition_rules: all,
        ..Default::default()
    }
    .resolved_cell();
    Ok(ModuleAssetContext::new(
        *transitions,
        *base.compile_time_info,
        *base.module_options_context,
        *base.resolve_options_context,
        layer,
    )
    .to_resolved()
    .await?)
}

#[derive(Debug)]
struct StrictDirectCommonJs;

struct DirectCommonJsThis;

impl VisitMut for DirectCommonJsThis {
    fn visit_mut_function(&mut self, _: &mut Function) {}

    fn visit_mut_class_member(&mut self, member: &mut ClassMember) {
        // Computed keys run in the enclosing scope. Field initializers, static
        // blocks, constructors and method bodies own their class/function this.
        match member {
            ClassMember::Method(method) => method.key.visit_mut_with(self),
            ClassMember::ClassProp(property) => property.key.visit_mut_with(self),
            ClassMember::AutoAccessor(accessor) => accessor.key.visit_mut_with(self),
            _ => {}
        }
    }

    fn visit_mut_prop(&mut self, property: &mut Prop) {
        match property {
            Prop::KeyValue(_) | Prop::Assign(_) => property.visit_mut_children_with(self),
            Prop::Getter(getter) => getter.key.visit_mut_with(self),
            Prop::Setter(setter) => setter.key.visit_mut_with(self),
            Prop::Method(method) => method.key.visit_mut_with(self),
            Prop::Shorthand(_) => {}
        }
    }

    fn visit_mut_expr(&mut self, expression: &mut Expr) {
        if let Expr::This(original) = expression {
            // The native context captures the real global object before authored
            // execution. Reading it preserves lexical identity even if authored
            // code shadows or replaces globalThis; require-side factories retain
            // their ordinary module.exports receiver.
            let mut global = Expr::from(TURBOPACK_GLOBAL);
            if let Expr::Member(member) = &mut global {
                member.span = original.span;
            }
            *expression = global;
        } else {
            expression.visit_mut_children_with(self);
        }
    }
}

fn make_direct_strict(program: &mut Program) {
    let directive = || {
        Stmt::Expr(ExprStmt {
            span: DUMMY_SP,
            expr: Box::new(Expr::Lit(Lit::Str(Str {
                span: DUMMY_SP,
                value: "use strict".into(),
                raw: None,
            }))),
        })
    };
    let already_strict = |statement: &Stmt| {
        matches!(statement,
        Stmt::Expr(expression) if matches!(&*expression.expr,
            Expr::Lit(Lit::Str(value)) if value.value == *"use strict"))
    };
    match program {
        Program::Module(module) => {
            if !matches!(module.body.first(), Some(ModuleItem::Stmt(statement)) if already_strict(statement))
            {
                module.body.insert(0, ModuleItem::Stmt(directive()));
            }
        }
        Program::Script(script) => {
            if !script.body.first().is_some_and(already_strict) {
                script.body.insert(0, directive());
            }
        }
    }
}

#[async_trait]
impl CustomTransformer for StrictDirectCommonJs {
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        make_direct_strict(program);
        program.visit_mut_with(&mut DirectCommonJsThis);
        Ok(())
    }
}

#[turbo_tasks::function]
fn strict_direct_plugin() -> Vc<TransformPlugin> {
    Vc::cell(Box::new(StrictDirectCommonJs) as Box<dyn CustomTransformer + Send + Sync>)
}

#[turbo_tasks::function]
async fn strict_direct_options(
    context: Vc<ModuleOptionsContext>,
    roots: Vec<FileSystemPath>,
) -> Result<Vc<ModuleOptionsContext>> {
    let mut options = (*context.await?).clone();
    for (_, nested) in &mut options.rules {
        *nested = strict_direct_options(**nested, roots.clone())
            .to_resolved()
            .await?;
    }
    let empty = ResolvedVc::<EcmascriptInputTransforms>::cell(Vec::new());
    options.module_rules.push(ModuleRule::new_all(
        RuleCondition::any(
            roots
                .into_iter()
                .map(RuleCondition::ResourcePathEquals)
                .collect(),
        ),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: empty,
            main: empty,
            postprocess: ResolvedVc::<EcmascriptInputTransforms>::cell(vec![
                EcmascriptInputTransform::Plugin(strict_direct_plugin().to_resolved().await?),
            ]),
        }],
    ));
    Ok(options.cell())
}

async fn strict_direct_context(
    context: ResolvedVc<ModuleAssetContext>,
    roots: Vec<FileSystemPath>,
) -> Result<ResolvedVc<ModuleAssetContext>> {
    let base = context.await?;
    Ok(ModuleAssetContext::new(
        *base.transitions,
        *base.compile_time_info,
        strict_direct_options(*base.module_options_context, roots),
        *base.resolve_options_context,
        base.layer.clone(),
    )
    .to_resolved()
    .await?)
}

async fn namespace_provider(
    context: ResolvedVc<ModuleAssetContext>,
    module: TestModule,
    identity: &str,
    production_source: Option<FileSystemPath>,
) -> Result<TestModule> {
    let code = "const raw = require('INNER_COMMONJS_RESET_ORIGINAL');\nconst namespace = \
                Object.create(null);\nif (raw !== null && (typeof raw === 'object' || typeof raw \
                === 'function') && !Array.isArray(raw) && !(raw instanceof Promise)) {\nfor \
                (const key in raw) {\nif (key !== 'default') Object.defineProperty(namespace, \
                key, {enumerable:true,configurable:true,get:() => \
                raw[key]});\n}\n}\nObject.defineProperty(namespace, 'default', \
                {value:raw,writable:true,enumerable:true,configurable:true});\nObject.\
                defineProperty(namespace, Symbol.toStringTag, \
                {value:'Module'});\n__turbopack_context__.n(await namespace);\n";
    let source = if let Some(path) = production_source {
        // Production side-effect analysis resolves package context from this
        // actual source filesystem. The generated content keeps a distinct
        // identity and never reads or writes the generated path on disk.
        test_source(
            path.parent()
                .join(&format!(".next-test-commonjs-reset-{identity}"))?,
            Some(rcstr!("next-test-commonjs-reset-namespace")),
            code.to_string(),
        )
        .await?
    } else {
        let path = VirtualFileSystem::new_with_name(rcstr!("next-test-commonjs-reset-namespaces"))
            .root()
            .owned()
            .await?
            .join(identity)?;
        ResolvedVc::upcast(
            VirtualSource::new(
                path,
                AssetContent::file(FileContent::Content(File::from(code)).cell()),
            )
            .to_resolved()
            .await?,
        )
    };
    Ok(context
        .process(
            *source,
            ReferenceType::Internal(ResolvedVc::cell(
                fxindexmap! { rcstr!("INNER_COMMONJS_RESET_ORIGINAL") => module },
            )),
        )
        .module()
        .to_resolved()
        .await?)
}

async fn actual_reset_targets(
    context: ResolvedVc<ModuleAssetContext>,
    source: TestSource,
) -> Result<Vec<ActualResetTarget>> {
    let path = source.ident().await?.path.clone();
    let plan = static_mock_plan(&path).await?;
    if plan.actual_imports.is_empty() {
        return Ok(Vec::new());
    }
    let origin = PlainResolveOrigin::new(*ResolvedVc::upcast(context), path.clone());
    let mut targets = Vec::new();
    for import in &plan.actual_imports {
        let request = Request::parse(RcStr::from(import.request.as_str()).into())
            .to_resolved()
            .await?;
        if !matches!(&*request.await?, Request::Relative { .. }) {
            return Err(test_input_error(
                path.clone(),
                "CommonJS actual-import resets require literal relative compiled targets",
            ));
        }
        let resolved = esm_resolve(
            Vc::upcast(origin),
            *request,
            EcmaScriptModulesReferenceSubType::Import,
            ResolveErrorMode::Error,
            None,
        )
        .await?;
        let modules = resolved.await?.primary_modules().await?;
        if modules.len() != 1
            || modules[0].ident().await?.path == path
            || !commonjs(modules[0]).await?
        {
            return Err(test_input_error(
                path.clone(),
                "CommonJS actual-import resets require one distinct compiled CommonJS root",
            ));
        }
        targets.push(ActualResetTarget {
            local: import.local.clone(),
            original: modules[0],
        });
    }
    Ok(targets)
}

async fn actual_helper_readsites(
    helper: TestModule,
    expected: &[(ResolvedVc<Request>, TestModule)],
) -> Result<Vec<ActualResetReadsite>> {
    let mut queue = vec![helper];
    let mut seen = HashSet::new();
    let mut readsites = Vec::new();
    while let Some(owner) = queue.pop() {
        if !seen.insert(owner) || expected.iter().any(|(_, target)| *target == owner) {
            continue;
        }
        for (reference, resolved) in primary_chunkable_referenced_modules(*owner, false, false)
            .await?
            .iter()
        {
            if let Some(reference) =
                ResolvedVc::try_downcast_type::<EsmAsyncAssetReference>(*reference)
            {
                let request = reference.await?.request;
                let Some((_, target)) = expected.iter().find(|(known, _)| *known == request) else {
                    return Err(test_input_error(
                        owner.ident().await?.path.clone(),
                        "CommonJS actual helper retained an uncertified dynamic request",
                    ));
                };
                if resolved.modules.as_slice() != [*target] {
                    return Err(test_input_error(
                        owner.ident().await?.path.clone(),
                        "CommonJS actual helper changed its exact namespace target",
                    ));
                }
                readsites.push(ActualResetReadsite {
                    owner,
                    reference,
                    request,
                    target: *target,
                });
            }
            queue.extend(resolved.modules.iter().copied());
        }
    }
    if expected.iter().any(|(request, target)| {
        !readsites
            .iter()
            .any(|site| site.target == *target && site.request == *request)
    }) {
        return Err(test_input_error(
            helper.ident().await?.path.clone(),
            "CommonJS actual helpers must retain every certified namespace edge",
        ));
    }
    Ok(readsites)
}

pub(crate) async fn prepare(
    project: ResolvedVc<Project>,
    context: ResolvedVc<ModuleAssetContext>,
    source: TestSource,
    id: &RcStr,
) -> Result<Option<CommonJsResetPreparation>> {
    prepare_commonjs(project, context, source, id, Vec::new()).await
}

/// Inspect through the actual entry's resolver before deriving any new context.
/// Entries without compiled CommonJS runtime targets keep their existing path.
pub(crate) async fn prepare_runtime(
    project: ResolvedVc<Project>,
    context: ResolvedVc<ModuleAssetContext>,
    source: TestSource,
    requests: &[String],
    id: &RcStr,
) -> Result<Option<CommonJsResetPreparation>> {
    if requests.is_empty() {
        return Ok(None);
    }
    let path = source.ident().await?.path.clone();
    let entry = context
        .process(
            *source,
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
        )
        .module()
        .to_resolved()
        .await?;
    let origin = crate::testing_dynamic_mock::runtime_resolve_origin(entry, &path).await?;
    let mut candidates = Vec::new();
    let mut has_commonjs = false;
    for request in requests {
        let parsed = Request::parse(RcStr::from(request.as_str()).into())
            .to_resolved()
            .await?;
        let resolved = esm_resolve(
            *origin,
            *parsed,
            EcmaScriptModulesReferenceSubType::DynamicImport,
            ResolveErrorMode::Ignore,
            None,
        )
        .await?;
        let resolved = resolved.await?;
        let modules = resolved.primary_modules().await?;
        let module = if modules.len() == 1
            && ResolvedVc::try_downcast_type::<CachedExternalModule>(modules[0]).is_none()
            && commonjs(modules[0]).await?
        {
            has_commonjs = true;
            Some(modules[0])
        } else {
            None
        };
        let mut valid = !resolved.is_unresolvable() && resolved.errors().next().is_none();
        for source in resolved.affecting_sources_iter() {
            valid &= source
                .ident()
                .await?
                .path
                .realpath_with_links()
                .await?
                .symlinks
                .is_empty();
        }
        candidates.push((request, parsed, module, valid));
    }
    if !has_commonjs {
        return Ok(None);
    }
    let root = project.project_path().owned().await?;
    let framework = get_next_package(root.clone()).await?;
    let mut originals = Vec::new();
    for (request, parsed, module, valid) in candidates {
        let relative = matches!(&*parsed.await?, Request::Relative { query, fragment, .. } if query.is_empty() && fragment.is_empty());
        let Some(module) = module.filter(|_| valid && relative) else {
            return Err(test_input_error(
                path.clone(),
                "CommonJS runtime entries require only uniquely resolved queryless relative \
                 compiled CommonJS targets",
            ));
        };
        let target = module.ident().await?.path.clone();
        if target == path || framework.get_path_to(&target).is_some() {
            return Err(test_input_error(
                path.clone(),
                "CommonJS runtime targets must be distinct project-local modules",
            ));
        }
        authored_source(&root, module).await?;
        originals.push(RuntimeOriginal {
            request: request.clone(),
            module,
        });
    }
    if !static_mock_plan(&path)
        .await?
        .throw_only_runtime_requests
        .is_empty()
    {
        return Err(test_input_error(
            path,
            "Throw-only runtime factories require an actual certified native target",
        ));
    }
    prepare_commonjs(project, context, source, id, originals).await
}

async fn provider_original_reference(
    namespace: TestModule,
    compiled: TestModule,
) -> Result<ResolvedVc<CjsRequireAssetReference>> {
    let mut references = Vec::new();
    for (reference, resolved) in primary_chunkable_referenced_modules(*namespace, false, false)
        .await?
        .iter()
    {
        if resolved.modules.as_slice() == [compiled]
            && let Some(reference) =
                ResolvedVc::try_downcast_type::<CjsRequireAssetReference>(*reference)
        {
            references.push(reference);
        }
    }
    let [reference] = references.as_slice() else {
        return Err(test_input_error(
            namespace.ident().await?.path.clone(),
            "CommonJS runtime namespace must retain one exact original require edge",
        ));
    };
    Ok(*reference)
}

async fn prepare_commonjs(
    project: ResolvedVc<Project>,
    context: ResolvedVc<ModuleAssetContext>,
    source: TestSource,
    id: &RcStr,
    runtime_originals: Vec<RuntimeOriginal>,
) -> Result<Option<CommonJsResetPreparation>> {
    let root = project.project_path().owned().await?;
    let actual_targets = actual_reset_targets(context, source).await?;
    let entry = context
        .process(
            *source,
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
        )
        .module()
        .to_resolved()
        .await?;
    let framework = get_next_package(root.clone()).await?;
    let mut queue = vec![entry];
    let mut seen = HashSet::new();
    let mut inspected = Vec::new();
    while let Some(module) = queue.pop() {
        if !seen.insert(module) {
            continue;
        }
        let ident = module.ident().await?;
        if framework.get_path_to(&ident.path).is_some()
            || ResolvedVc::try_downcast_type::<CachedExternalModule>(module).is_some()
        {
            continue;
        }
        if commonjs(module).await? {
            authored_source(&root, module).await?;
            inspected.push(module);
        } else {
            queue.extend(primary_referenced_modules(*module).await?.iter().copied());
        }
    }
    for target in &actual_targets {
        authored_source(&root, target.original).await?;
        if !inspected.contains(&target.original) {
            inspected.push(target.original);
        }
    }
    for target in &runtime_originals {
        if !inspected.contains(&target.module) {
            inspected.push(target.module);
        }
    }
    if inspected.is_empty() {
        return Ok(None);
    }
    let (original_modules, original_edges) = require_closure(&root, &inspected).await?;
    // Preserve ordinary leaf-only compilation, including every existing raw format.
    // Actual-import resets still need the certified direct-root namespace when
    // that root has no require descendants to retain.
    if original_edges.is_empty() && runtime_originals.is_empty() && actual_targets.is_empty() {
        return Ok(None);
    }
    let mut export_shapes = Vec::new();
    for module in &inspected {
        let full = full_owner(*module).await?;
        let certificate = commonjs_reset_export_certificate(*full).await?;
        if certificate.module != full || certificate.shape == CommonJsResetExportShape::Unsupported
        {
            return Err(test_input_error(
                module.ident().await?.path.clone(),
                if runtime_originals.is_empty() {
                    "Nonleaf CommonJS reset entries require certified final object or callable \
                     export roots"
                } else {
                    "CommonJS runtime entries require certified final object or callable export \
                     roots"
                },
            ));
        }
        export_shapes.push(certificate.shape);
    }
    let mut sources = HashMap::new();
    for module in &original_modules {
        let source = authored_source(&root, *module).await?;
        if let Some(previous) = sources.insert(source, *module)
            && previous != *module
        {
            return Err(test_input_error(
                module.ident().await?.path.clone(),
                "CommonJS reset sources have conflicting compiler module identities",
            ));
        }
    }
    let base_layer = context.await?.layer.clone();
    let boundary =
        crate::testing_external_modules::runtime_boundary_rule(root.clone(), context).await?;
    let canonical = with_rules(context, vec![boundary], base_layer.clone()).await?;
    let require_layer =
        Layer::new(format!("{}-next-test-commonjs-require-{id}", base_layer.name()).into());
    let require_context = with_rules(canonical, Vec::new(), require_layer).await?;
    let require_transition = ResolvedVc::upcast(
        FullContextTransition::new(*require_context)
            .to_resolved()
            .await?,
    );
    let mut require_rules = Vec::new();
    for edge in &original_edges {
        // Only concrete targets of certified evaluation edges enter the held layer.
        let path = authored_source(&root, edge.target)
            .await?
            .ident()
            .await?
            .path
            .clone();
        require_rules.push(TransitionRule::new(
            RuleCondition::all(vec![
                RuleCondition::ResourcePathEquals(path),
                RuleCondition::ReferenceType(ReferenceTypeCondition::CommonJs(Some(
                    CommonJsReferenceSubType::Undefined,
                ))),
            ]),
            require_transition,
        ));
    }
    // Vite's direct CJS evaluator is strict, while its real require-side loader stays sloppy.
    // Only certified direct roots receive this transform; the held require context above retains
    // the exact authored options, including custom transforms and nested option precedence.
    let mut direct_paths = Vec::new();
    for module in &inspected {
        direct_paths.push(
            authored_source(&root, *module)
                .await?
                .ident()
                .await?
                .path
                .clone(),
        );
    }
    let direct_context = strict_direct_context(canonical, direct_paths).await?;
    let compiled_context = with_rules(direct_context, require_rules, base_layer.clone()).await?;
    let mut compiled = Vec::new();
    for (original, shape) in inspected.iter().zip(&export_shapes) {
        let source = authored_source(&root, *original).await?;
        let module = compiled_context
            .process(
                *source,
                ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
            )
            .module()
            .to_resolved()
            .await?;
        let full = full_owner(module).await?;
        let certificate = commonjs_reset_export_certificate(*full).await?;
        if certificate.module != full
            || certificate.shape != *shape
            || authored_source(&root, module).await? != source
        {
            return Err(test_input_error(
                source.ident().await?.path.clone(),
                "CommonJS reset derived root changed its actual export certificate",
            ));
        }
        compiled.push(module);
    }
    // Re-certify the complete actual derived require closure, including cycle backedges.
    let mut protected = Vec::new();
    for edge in &original_edges {
        let source = authored_source(&root, edge.target).await?;
        let target = require_context
            .process(
                *source,
                ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined),
            )
            .module()
            .to_resolved()
            .await?;
        if original_modules.contains(&target) {
            return Err(test_input_error(
                source.ident().await?.path.clone(),
                "CommonJS require layer did not isolate its actual factory",
            ));
        }
        protected.push(target);
    }
    let (protected, _) = require_closure(&root, &protected).await?;
    let mut all_compiled = compiled.clone();
    all_compiled.extend(protected.iter().copied());
    let (all_derived, derived_edges) = require_closure(&root, &all_compiled).await?;
    if all_derived
        .iter()
        .any(|module| !compiled.contains(module) && !protected.contains(module))
    {
        return Err(test_input_error(
            source.ident().await?.path.clone(),
            "CommonJS derived graph escaped its certified factories",
        ));
    }
    for edge in &derived_edges {
        let owner_source = authored_source(&root, edge.owner).await?;
        let target_source = authored_source(&root, edge.target).await?;
        let mut matched = false;
        for original in &original_edges {
            if authored_source(&root, original.owner).await? == owner_source
                && authored_source(&root, original.target).await? == target_source
            {
                // Force the exact issued reference's resolution, not a textual approximation.
                let resolved = original
                    .reference
                    .resolve_reference()
                    .await?
                    .primary_modules()
                    .await?;
                matched = resolved.as_slice() == [original.target];
                if matched {
                    break;
                }
            }
        }
        if !matched {
            return Err(test_input_error(
                owner_source.ident().await?.path.clone(),
                "CommonJS require layer changed a certified executable edge",
            ));
        }
    }
    let mut roots = Vec::new();
    let mut namespace_rules = Vec::new();
    let production = project.next_mode().await?.is_production();
    for (index, (inspected, compiled)) in inspected.iter().zip(compiled).enumerate() {
        let source = authored_source(&root, *inspected).await?;
        let namespace = namespace_provider(
            canonical,
            compiled,
            &format!("{id}-{index}.mjs"),
            if production {
                Some(source.ident().await?.path.clone())
            } else {
                None
            },
        )
        .await?;
        let transition = NamespaceTransition {
            source,
            module: namespace,
        }
        .resolved_cell();
        namespace_rules.push(TransitionRule::new(
            RuleCondition::all(vec![
                RuleCondition::ResourcePathEquals(source.ident().await?.path.clone()),
                RuleCondition::ReferenceType(ReferenceTypeCondition::EcmaScriptModules(None)),
            ]),
            ResolvedVc::upcast(transition),
        ));
        roots.push(CommonJsResetRoot {
            original: *inspected,
            compiled,
            namespace,
        });
    }
    let context = with_rules(compiled_context, namespace_rules, base_layer).await?;
    let (context, source, actual_helper) = if actual_targets.is_empty() {
        (context, source, None)
    } else {
        let path = source.ident().await?.path.clone();
        let plan = static_mock_plan(&path).await?;
        let original_source = file_content_rope(path.read()).await?.to_str()?.into_owned();
        let original_url = canonical_test_source_identity(project, source).await?;
        let mut aliases = Vec::new();
        let mut assets = fxindexmap! {};
        let mut expected = Vec::new();
        for (index, actual) in actual_targets.iter().enumerate() {
            let root = roots
                .iter()
                .find(|root| root.original == actual.original)
                .ok_or_else(|| {
                    test_input_error(
                        path.clone(),
                        "CommonJS actual target lost its exact original root certificate",
                    )
                })?;
            let alias = format!("INNER_COMMONJS_ACTUAL_RESET_{index}");
            assets.insert(RcStr::from(alias.as_str()), root.namespace);
            expected.push((
                Request::parse(RcStr::from(alias.as_str()).into())
                    .to_resolved()
                    .await?,
                root.namespace,
            ));
            aliases.push(alias);
        }
        let helper_source = test_source(
            path.clone(),
            Some(rcstr!("next-test-commonjs-actual-reset-helper")),
            mock_registration_source_with_helpers(
                "",
                &original_url,
                &original_source,
                &[],
                &[],
                &actual_targets
                    .iter()
                    .zip(&aliases)
                    .map(|(target, alias)| MockActualSource {
                        local: &target.local,
                        original_request: alias,
                        cache: false,
                    })
                    .collect::<Vec<_>>(),
                &[],
                &[],
            )?,
        )
        .await?;
        let helper = canonical
            .process(
                *helper_source,
                ReferenceType::Internal(ResolvedVc::cell(assets)),
            )
            .module()
            .to_resolved()
            .await?;
        let readsites = actual_helper_readsites(helper, &expected).await?;
        let (bridge, rule) = crate::testing_external_modules::resolved_module_bridge(
            helper,
            &format!("{id}/commonjs-actual-reset-helper.mjs"),
        )
        .await?;
        let helper_request = format!("next-test-commonjs-actual-reset:{id}");
        let mut imports = ImportMap::empty();
        imports.insert_exact_alias(
            helper_request.clone(),
            ImportMapping::Direct(ResolveResult::source(bridge).resolved_cell()).resolved_cell(),
        );
        let layer = context.await?.layer.clone();
        let context = with_rules(context, vec![rule], layer).await?;
        let base = context.await?;
        let context = ModuleAssetContext::new(
            *base.transitions,
            *base.compile_time_info,
            *base.module_options_context,
            registration_module_resolve_options(*base.resolve_options_context, imports.cell()),
            base.layer.clone(),
        )
        .to_resolved()
        .await?;
        let source = test_source(
            path,
            None,
            mock_spec_source_with_imports(
                &original_url,
                &original_source,
                &plan.source,
                &helper_request,
                &actual_targets
                    .iter()
                    .map(|target| target.local.clone())
                    .collect::<Vec<_>>(),
            )?,
        )
        .await?;
        (
            context,
            source,
            Some(CommonJsActualResetHelper {
                module: helper,
                readsites,
            }),
        )
    };
    let mut runtime_targets = Vec::new();
    for original in runtime_originals {
        let original_path = original.module.ident().await?.path.clone();
        let root = roots
            .iter()
            .find(|root| root.original == original.module)
            .ok_or_else(|| {
                test_input_error(
                    original_path,
                    "CommonJS runtime target lost its original module certificate",
                )
            })?;
        runtime_targets.push(CommonJsRuntimeTarget {
            request: original.request,
            original: root.original,
            compiled: root.compiled,
            namespace: root.namespace,
            original_reference: provider_original_reference(root.namespace, root.compiled).await?,
        });
    }
    Ok(Some(CommonJsResetPreparation {
        context,
        source,
        roots,
        protected,
        actual_helper,
        runtime_targets,
    }))
}

impl CommonJsResetPreparation {
    pub(crate) async fn runtime_target(
        &self,
        request: &str,
        module: TestModule,
    ) -> Result<Option<&CommonJsRuntimeTarget>> {
        let Some(target) = self
            .runtime_targets
            .iter()
            .find(|target| target.request == request)
        else {
            return Ok(None);
        };
        let full = full_owner(target.original).await?;
        let certificate = commonjs_reset_export_certificate(*full).await?;
        let placeable = ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module);
        if module != target.namespace
            || certificate.module != full
            || certificate.shape == CommonJsResetExportShape::Unsupported
            || placeable.is_none()
            || provider_original_reference(module, target.compiled).await?
                != target.original_reference
            || target
                .original_reference
                .resolve_reference()
                .await?
                .primary_modules()
                .await?
                .as_slice()
                != [target.compiled]
        {
            return Err(test_input_error(
                target.original.ident().await?.path.clone(),
                "CommonJS runtime request lost its exact original/provider compiler graph",
            ));
        }
        let placeable = placeable.expect("checked namespace placeable");
        if !matches!(
            *placeable.get_exports().await?,
            EcmascriptExports::DynamicNamespace
        ) {
            return Err(test_input_error(
                target.original.ident().await?.path.clone(),
                "CommonJS runtime target must retain its published namespace",
            ));
        }
        Ok(Some(target))
    }

    pub(crate) fn runtime_seeds(&self) -> Vec<TestModule> {
        self.runtime_targets
            .iter()
            .flat_map(|target| [target.compiled, target.namespace])
            .collect()
    }
    pub(crate) async fn validate_owner(&self, entry: TestModule) -> Result<()> {
        let mut queue = vec![entry];
        let mut seen = HashSet::new();
        while let Some(module) = queue.pop() {
            if !seen.insert(module) || self.protected.contains(&module) {
                continue;
            }
            for (reference, resolved) in primary_chunkable_referenced_modules(*module, false, false)
                .await?
                .iter()
            {
                if ResolvedVc::try_downcast_type::<CjsRequireAssetReference>(*reference).is_some()
                    && resolved
                        .modules
                        .iter()
                        .any(|target| self.protected.contains(target))
                    && !self.roots.iter().any(|root| root.compiled == module)
                {
                    return Err(test_input_error(
                        module.ident().await?.path.clone(),
                        "CommonJS held require edges must belong to the certified compiled root",
                    ));
                }
                queue.extend(resolved.modules.iter().copied());
            }
        }
        if let Some(helper) = &self.actual_helper {
            let expected = helper
                .readsites
                .iter()
                .map(|site| (site.request, site.target))
                .collect::<Vec<_>>();
            let actual = actual_helper_readsites(helper.module, &expected).await?;
            if !seen.contains(&helper.module)
                || helper.readsites.len() != actual.len()
                || helper.readsites.iter().any(|site| {
                    !seen.contains(&site.owner)
                        || !actual.iter().any(|actual| {
                            actual.owner == site.owner
                                && actual.reference == site.reference
                                && actual.target == site.target
                                && actual.request == site.request
                        })
                })
            {
                return Err(test_input_error(
                    helper.module.ident().await?.path.clone(),
                    "CommonJS actual helper lost its exact final owner/reference/namespace graph",
                ));
            }
        }
        Ok(())
    }

    pub(crate) fn actual_seeds(&self) -> Vec<TestModule> {
        self.roots
            .iter()
            .filter(|root| {
                self.actual_helper.as_ref().is_some_and(|helper| {
                    helper
                        .readsites
                        .iter()
                        .any(|site| site.target == root.namespace)
                })
            })
            .flat_map(|root| [root.compiled, root.namespace])
            .collect()
    }

    pub(crate) fn contains_resettable(&self, module: TestModule) -> bool {
        self.roots
            .iter()
            .any(|root| root.compiled == module || root.namespace == module)
    }
}

#[cfg(test)]
mod tests {
    use anyhow::{Context, Result};
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{TurboTasks, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{DiskFileSystem, FileSystem};
    use turbopack::{
        ModuleAssetContext,
        module_options::{
            EcmascriptOptionsContext, ModuleOptionsContext, RuleCondition,
            transition_rule::TransitionRule,
        },
        transition::TransitionOptions,
    };
    use turbopack_core::{
        compile_time_info::CompileTimeInfo,
        context::AssetContext,
        environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
        file_source::FileSource,
        ident::Layer,
        reference::primary_chunkable_referenced_modules,
        reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    };
    use turbopack_ecmascript::references::cjs::CjsRequireAssetReference;
    use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

    use crate::testing_cjs_reset::{
        DirectCommonJsThis, NamespaceTransition, make_direct_strict, require_closure,
        strict_direct_context, with_rules,
    };

    #[turbo_tasks::function(operation, root)]
    async fn operation(disk_root: RcStr, fixture: RcStr, priority: bool) -> Result<()> {
        let root = DiskFileSystem::new(rcstr!("test-commonjs-reset-graph"), Vc::cell(disk_root))
            .root()
            .owned()
            .await?;
        let directory = root.join(&fixture)?;
        let context = ModuleAssetContext::new(
            TransitionOptions::default().cell(),
            CompileTimeInfo::new(Environment::new(ExecutionEnvironment::NodeJsLambda(
                NodeJsEnvironment::default().resolved_cell(),
            ))),
            ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    ignore_dynamic_requests: true,
                    ..Default::default()
                },
                ..Default::default()
            }
            .cell(),
            ResolveOptionsContext::default().cell(),
            Layer::new(rcstr!("test-commonjs-reset-graph")),
        )
        .to_resolved()
        .await?;
        let mut modules = std::collections::HashMap::new();
        for name in [
            "acyclic.cjs",
            "dependency.cjs",
            "cycle.cjs",
            "cycle-dependency.cjs",
            "missing.cjs",
            "opaque.cjs",
            "multiple.cjs",
            "a.cjs",
            "b.cjs",
            "non-cjs.cjs",
        ] {
            let module = context
                .process(
                    Vc::upcast(FileSource::new(directory.join(name)?)),
                    ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
                )
                .module()
                .to_resolved()
                .await?;
            modules.insert(name, module);
        }
        if priority {
            let source = Vc::upcast::<Box<dyn turbopack_core::source::Source>>(FileSource::new(
                directory.join("acyclic.cjs")?,
            ))
            .to_resolved()
            .await?;
            let first = NamespaceTransition {
                source,
                module: modules["a.cjs"],
            }
            .resolved_cell();
            let appended = NamespaceTransition {
                source,
                module: modules["b.cjs"],
            }
            .resolved_cell();
            let condition = RuleCondition::ResourcePathEquals(directory.join("acyclic.cjs")?);
            let original = context.await?;
            let prior = with_rules(
                context,
                vec![TransitionRule::new_all(
                    condition.clone(),
                    Vc::upcast::<Box<dyn turbopack::transition::Transition>>(*first)
                        .to_resolved()
                        .await?,
                )],
                original.layer.clone(),
            )
            .await?;
            let extended = with_rules(
                prior,
                vec![TransitionRule::new_all(
                    condition,
                    Vc::upcast::<Box<dyn turbopack::transition::Transition>>(*appended)
                        .to_resolved()
                        .await?,
                )],
                original.layer.clone(),
            )
            .await?;
            let selected = extended
                .process(
                    *source,
                    ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
                )
                .module()
                .to_resolved()
                .await?;
            assert_eq!(
                selected, modules["a.cjs"],
                "the real original transition must win"
            );
            let derived = extended.await?;
            assert_eq!(derived.compile_time_info, original.compile_time_info);
            assert_eq!(
                derived.module_options_context,
                original.module_options_context
            );
            assert_eq!(
                derived.resolve_options_context,
                original.resolve_options_context
            );
            let original_options = original.module_options_context;
            let direct =
                strict_direct_context(extended, vec![directory.join("acyclic.cjs")?]).await?;
            let direct = direct.await?;
            assert_eq!(direct.transitions, derived.transitions);
            assert_eq!(direct.compile_time_info, original.compile_time_info);
            assert_eq!(
                direct.resolve_options_context,
                original.resolve_options_context
            );
            assert_ne!(direct.module_options_context, original_options);
            let old_options = original_options.await?;
            let direct_options = direct.module_options_context.await?;
            assert_eq!(
                direct_options.module_rules.len(),
                old_options.module_rules.len() + 1
            );
            assert_eq!(
                &direct_options.module_rules[..old_options.module_rules.len()],
                old_options.module_rules.as_slice()
            );
            assert_eq!(
                context.await?.module_options_context,
                original_options,
                "held require context must retain exact original options"
            );
            return Ok(());
        }
        let (acyclic, edges) = require_closure(&directory, &[modules["acyclic.cjs"]]).await?;
        assert_eq!(acyclic.len(), 2);
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].owner, modules["acyclic.cjs"]);
        assert_eq!(edges[0].target, modules["dependency.cjs"]);
        let (cycle, edges) = require_closure(&directory, &[modules["cycle.cjs"]]).await?;
        assert_eq!(cycle.len(), 2);
        assert_eq!(edges.len(), 2);
        assert!(edges.iter().any(|edge| edge.target == modules["cycle.cjs"]));
        let references =
            primary_chunkable_referenced_modules(*modules["multiple.cjs"], false, false).await?;
        let multiple = references
            .iter()
            .find(|(reference, _)| {
                turbo_tasks::ResolvedVc::try_downcast_type::<CjsRequireAssetReference>(*reference)
                    .is_some()
            })
            .context("actual multiple-target require reference")?;
        assert!(multiple.1.modules.len() > 1);
        assert!(multiple.1.modules.contains(&modules["a.cjs"]));
        assert!(multiple.1.modules.contains(&modules["b.cjs"]));
        for (name, message) in [
            ("missing.cjs", "exactly one compiled target"),
            ("opaque.cjs", "unresolved executable expressions"),
            ("multiple.cjs", "exactly one compiled target"),
            ("non-cjs.cjs", "concrete project-local CommonJS"),
        ] {
            let error = require_closure(&directory, &[modules[name]])
                .await
                .err()
                .with_context(|| format!("{name} must be refused"))?;
            assert!(error.to_string().contains(message), "{name}: {error}");
        }
        Ok(())
    }

    async fn run(priority: bool) -> Result<()> {
        let repository = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .context("crates directory")?
            .parent()
            .context("repository directory")?;
        let directory = tempfile::Builder::new()
            .prefix(".next-test-cjs-reset-graph-")
            .tempdir_in(repository)?;
        for (name, source) in [
            ("package.json", "{\"private\":true,\"type\":\"module\"}"),
            (
                "acyclic.cjs",
                "module.exports = { dependency: require('./dependency.cjs') }",
            ),
            ("dependency.cjs", "module.exports = { value: 1 }"),
            (
                "cycle.cjs",
                "module.exports = { dependency: require('./cycle-dependency.cjs') }",
            ),
            (
                "cycle-dependency.cjs",
                "module.exports = { root: require('./cycle.cjs') }",
            ),
            (
                "missing.cjs",
                "module.exports = require('./not-present.cjs')",
            ),
            (
                "opaque.cjs",
                "module.exports = require(globalThis.__choice ? './a.cjs' : './b.cjs')",
            ),
            (
                "multiple.cjs",
                "module.exports = require('./' + (globalThis.__choice ? 'a' : 'b') + '.cjs')",
            ),
            ("a.cjs", "module.exports = { value: 'a' }"),
            ("b.cjs", "module.exports = { value: 'b' }"),
            ("non-cjs.cjs", "module.exports = require('./esm.mjs')"),
            ("esm.mjs", "export const value = 1"),
        ] {
            std::fs::write(directory.path().join(name), source)?;
        }
        let disk_root = repository
            .canonicalize()?
            .to_str()
            .context("UTF-8 repository")?
            .into();
        let fixture = directory
            .path()
            .file_name()
            .context("fixture name")?
            .to_str()
            .context("UTF-8 fixture name")?
            .into();
        let tasks = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tasks
            .run_once(async move {
                operation(disk_root, fixture, priority)
                    .read_strongly_consistent()
                    .await
            })
            .await?;
        Ok(())
    }

    #[test]
    fn direct_this_preserves_function_and_class_receivers() {
        use swc_core::{
            common::{FileName, SourceMap, sync::Lrc},
            ecma::{
                ast::{Expr, MemberProp},
                parser::{Syntax, parse_file_as_program},
                visit::{Visit, VisitMutWith, VisitWith},
            },
        };
        #[derive(Default)]
        struct Counts {
            native_globals: usize,
            retained_this: usize,
        }
        impl Visit for Counts {
            fn visit_expr(&mut self, expression: &Expr) {
                if matches!(expression, Expr::This(_)) {
                    self.retained_this += 1;
                }
                if matches!(expression, Expr::Member(member)
                    if matches!(&*member.obj, Expr::Ident(id) if id.sym == *"__turbopack_context__")
                    && matches!(&member.prop, MemberProp::Ident(id) if id.sym == *"g"))
                {
                    self.native_globals += 1;
                }
                expression.visit_children_with(self);
            }
        }
        for (source, globals, retained) in [
            ("const lexical = this; module.exports = () => this", 2, 0),
            (
                "function f(value = () => this) { return () => this }; module.exports = () => this",
                1,
                2,
            ),
            (
                "const value = { [this.key]: () => this, method() { return this }, get \
                 [this.key]() { return this }, set [this.key](value) { this.value = value } }; \
                 module.exports = () => this",
                5,
                3,
            ),
            (
                "class Value extends this.Parent { [this.key]() { return this }; [this.field] = \
                 this; static field = this; static { this.field = this }; constructor() { \
                 this.field = this }; static [this.method]() { return this } }; module.exports = \
                 () => this",
                5,
                8,
            ),
            ("const globalThis = {}; module.exports = () => this", 1, 0),
        ] {
            let map: Lrc<SourceMap> = Default::default();
            let file = map.new_source_file(FileName::Anon.into(), source.to_string());
            let mut errors = Vec::new();
            let mut program = parse_file_as_program(
                &file,
                Syntax::default(),
                Default::default(),
                None,
                &mut errors,
            )
            .expect("valid lexical receiver fixture");
            assert!(errors.is_empty());
            program.visit_mut_with(&mut DirectCommonJsThis);
            program.visit_mut_with(&mut DirectCommonJsThis);
            let mut counts = Counts::default();
            program.visit_with(&mut counts);
            assert_eq!(counts.native_globals, globals, "{source}");
            assert_eq!(counts.retained_this, retained, "{source}");
        }
    }

    #[test]
    fn direct_strict_transform_preserves_statements_and_is_idempotent() {
        use swc_core::{
            common::{BytePos, Span},
            ecma::ast::{EmptyStmt, Program, Script, Stmt},
        };
        let original_span = Span::new(BytePos(10), BytePos(11));
        let mut program = Program::Script(Script {
            span: original_span,
            body: vec![Stmt::Empty(EmptyStmt {
                span: original_span,
            })],
            shebang: Some("/usr/bin/env node".into()),
        });
        make_direct_strict(&mut program);
        make_direct_strict(&mut program);
        let Program::Script(script) = program else {
            unreachable!()
        };
        assert_eq!(script.span, original_span);
        assert_eq!(script.shebang.as_deref(), Some("/usr/bin/env node"));
        assert_eq!(script.body.len(), 2);
        assert!(matches!(script.body[1], Stmt::Empty(EmptyStmt { span }) if span == original_span));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn certifies_actual_require_cycles_and_rejects_unresolved_or_multiple_targets()
    -> Result<()> {
        run(false).await
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn preserves_existing_transition_precedence_and_compiler_options() -> Result<()> {
        run(true).await
    }
}
