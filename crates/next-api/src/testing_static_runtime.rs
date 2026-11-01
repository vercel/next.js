//! Exact static namespace/native-provider pairs for isolated Node runtime mocks.
use std::collections::{HashMap, HashSet};

use anyhow::Result;
use next_core::get_next_package;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::{ModuleAssetContext, transition::TransitionOptions};
use turbopack_core::{
    context::AssetContext,
    file_source::FileSource,
    module::Module,
    reference::primary_chunkable_referenced_modules,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        ResolveErrorMode, ResolveResult, ResolveResultOption,
        parse::Request,
        plugin::{BeforeResolvePlugin, BeforeResolvePluginCondition},
    },
    source::Source,
};
use turbopack_ecmascript::references::external_module::CachedExternalModule;
use turbopack_resolve::{ecmascript::esm_resolve, resolve_options_context::ResolveOptionsContext};

use crate::{
    testing::{static_mock_plan, test_input_error},
    testing_dynamic_mock::runtime_resolve_origin,
    testing_external_modules::{
        NativeExternalCertificate, resolved_module_bridge, runtime_native_external_context,
    },
    testing_mock_source::native_unmock_original_is_available,
};

/// Both manifests consume the same actual compiler identities. No runtime key
/// or source-name convention supplies a namespace/provider relationship.
#[derive(Clone)]
pub(crate) struct StaticMockPair {
    pub(crate) initial: ResolvedVc<Box<dyn Module>>,
    pub(crate) provider: ResolvedVc<Box<dyn Module>>,
    pub(crate) protected: Vec<ResolvedVc<Box<dyn Module>>>,
}

/// An actual cancelled source factory leaves the real native provider as both
/// initial import and resettable runtime original. This is never a static pair.
#[derive(Clone)]
pub(crate) struct NativeOriginalInitial {
    pub(crate) original: ResolvedVc<Box<dyn Module>>,
    pub(crate) provider: ResolvedVc<Box<dyn Module>>,
    pub(crate) protected: Vec<ResolvedVc<Box<dyn Module>>>,
}

pub(crate) struct StaticRuntimePreparation {
    pub(crate) context: ResolvedVc<ModuleAssetContext>,
    pub(crate) certificates: Vec<NativeExternalCertificate>,
    pub(crate) pairs: Vec<StaticMockPair>,
    pub(crate) original_initials: Vec<NativeOriginalInitial>,
}

#[turbo_tasks::value(shared)]
struct StaticNativeConsumer {
    directory: FileSystemPath,
    request: RcStr,
    initial: ResolvedVc<Box<dyn Source>>,
    provider: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value(shared)]
struct StaticNativeResolvePlugin {
    consumers: Vec<ResolvedVc<StaticNativeConsumer>>,
}

#[turbo_tasks::value_impl]
impl BeforeResolvePlugin for StaticNativeResolvePlugin {
    fn before_resolve_condition(&self) -> Vc<BeforeResolvePluginCondition> {
        BeforeResolvePluginCondition::Always.cell()
    }

    #[turbo_tasks::function]
    async fn before_resolve(
        self: Vc<Self>,
        lookup_path: FileSystemPath,
        reference_type: ReferenceType,
        request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let dynamic = match reference_type {
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::DynamicImport) => {
                true
            }
            ReferenceType::EcmaScriptModules(
                EcmaScriptModulesReferenceSubType::Import
                | EcmaScriptModulesReferenceSubType::ImportPart(_)
                | EcmaScriptModulesReferenceSubType::Undefined,
            ) => false,
            _ => return Ok(Vc::cell(None)),
        };
        let request = request.await?;
        if !matches!(&*request, Request::Module {query, fragment, ..} | Request::Uri {query, fragment, ..} if query.is_empty() && fragment.is_empty())
        {
            return Ok(Vc::cell(None));
        }
        let Some(request) = request.request() else {
            return Ok(Vc::cell(None));
        };
        for consumer in &self.await?.consumers {
            let consumer = consumer.await?;
            if consumer.directory == lookup_path && consumer.request == request {
                return Ok(Vc::cell(Some(
                    ResolveResult::source(if dynamic {
                        consumer.provider
                    } else {
                        consumer.initial
                    })
                    .resolved_cell(),
                )));
            }
        }
        Ok(Vc::cell(None))
    }
}

#[turbo_tasks::function]
async fn resolve_options(
    options: Vc<ResolveOptionsContext>,
    plugin: ResolvedVc<StaticNativeResolvePlugin>,
) -> Result<Vc<ResolveOptionsContext>> {
    let mut options = options.owned().await?;
    // Only the paired entry's ESM references precede the existing static
    // substitution. The final manifest still rejects foreign user importers.
    options
        .before_resolve_plugins
        .insert(0, ResolvedVc::upcast(plugin));
    for (_, nested) in &mut options.rules {
        *nested = resolve_options(**nested, *plugin).to_resolved().await?;
    }
    Ok(options.cell())
}

async fn collect_registration_protection(
    registration: ResolvedVc<Box<dyn Module>>,
    initial: Option<ResolvedVc<Box<dyn Module>>>,
    initial_module: ResolvedVc<Box<dyn Module>>,
    certificates: &[NativeExternalCertificate],
    framework: &FileSystemPath,
    path: &FileSystemPath,
) -> Result<Vec<ResolvedVc<Box<dyn Module>>>> {
    let mut queue = vec![registration];
    queue.extend(initial);
    let mut protected = Vec::new();
    let mut seen = HashSet::new();
    while let Some(module) = queue.pop() {
        if !seen.insert(module) || certificates.iter().any(|known| known.module == module) {
            continue;
        }
        if module == initial_module {
            return Err(test_input_error(
                path.clone(),
                "Static replacement closure cannot own the explicit test entry",
            ));
        }
        let ident = module.ident().await?;
        if framework.get_path_to(&ident.path).is_some() {
            protected.push(module);
            continue;
        }
        if ResolvedVc::try_downcast_type::<CachedExternalModule>(module).is_some() {
            if !certificates
                .iter()
                .any(|known| known.native == module || known.original == module)
            {
                return Err(test_input_error(
                    path.clone(),
                    "Static replacement closure contains an uncertified native module",
                ));
            }
            protected.push(module);
            continue;
        }
        if ident.path != *path {
            return Err(test_input_error(
                ident.path.clone(),
                "Static/runtime replacement closures cannot include other user modules",
            ));
        }
        protected.push(module);
        for (_, reference) in primary_chunkable_referenced_modules(*module, false, false)
            .await?
            .iter()
        {
            if reference.modules.is_empty() {
                return Err(test_input_error(
                    path.clone(),
                    "Static/runtime replacement closure contains an unresolved executable edge",
                ));
            }
            queue.extend(reference.modules.iter().copied());
        }
    }
    Ok(protected)
}

pub(crate) async fn prepare(
    root: FileSystemPath,
    origin_context: ResolvedVc<ModuleAssetContext>,
    context: ResolvedVc<ModuleAssetContext>,
    source: ResolvedVc<Box<dyn Source>>,
    registration: ResolvedVc<Box<dyn Module>>,
    path: &FileSystemPath,
    requests: &[String],
    id: &str,
    paired_native_actuals: bool,
) -> Result<StaticRuntimePreparation> {
    let plan = static_mock_plan(path).await?;
    let native_unmock_targets = plan.native_unmock_targets();
    let native_unmock = native_unmock_targets.is_some();
    if (plan.declarations.is_empty() && plan.hoisted.is_empty())
        || (!plan.actual_imports.is_empty() && !paired_native_actuals)
        || !plan.mock_imports.is_empty()
        || (!plan.unmocks.is_empty() && !native_unmock)
        || plan
            .declarations
            .iter()
            .any(|declaration| declaration.automatic || declaration.spy)
    {
        return Err(test_input_error(
            path.clone(),
            "Static/runtime mixtures require paired explicit native factories",
        ));
    }
    // Resolve every independent static and runtime target through this actual origin.
    let mut native_requests = requests.to_vec();
    for declaration in &plan.declarations {
        if !native_requests.contains(&declaration.request) {
            native_requests.push(declaration.request.clone());
        }
    }
    let raw_source = ResolvedVc::upcast(FileSource::new(path.clone()).to_resolved().await?);
    let native = runtime_native_external_context(
        root.clone(),
        origin_context,
        raw_source,
        id,
        path,
        &native_requests,
    )
    .await?;
    let original_module = origin_context
        .process(
            *raw_source,
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
        )
        .module()
        .to_resolved()
        .await?;
    let original_origin = runtime_resolve_origin(original_module, path).await?;
    let mut native_unmock_originals = HashMap::new();
    let mut native_unmock_runtime_targets = HashMap::new();
    let mut cut_originals = HashMap::new();
    if let Some(targets) = &native_unmock_targets {
        for target in targets {
            // Resolve each literal through the actual static-import origin. A
            // sibling's spelling/provider never supplies another group's proof.
            let parsed = Request::parse(RcStr::from(target.request.clone()).into())
                .to_resolved()
                .await?;
            let resolved = esm_resolve(
                *original_origin,
                *parsed,
                EcmaScriptModulesReferenceSubType::Import,
                ResolveErrorMode::Error,
                None,
            )
            .await?;
            let originals = resolved.await?.primary_modules().await?;
            if originals.len() != 1 {
                return Err(test_input_error(
                    path.clone(),
                    "Retained native unmock requires one actual static-import original",
                ));
            }
            let original = originals[0];
            let Some(external) = ResolvedVc::try_downcast_type::<CachedExternalModule>(original)
            else {
                return Err(test_input_error(
                    path.clone(),
                    "Retained native unmock must resolve to the actual external original",
                ));
            };
            let native_request = external.await?.request().into_owned();
            if !native_unmock_original_is_available(
                &native_unmock_originals,
                &original,
                &target.request,
            ) || !native_unmock_original_is_available(
                &native_unmock_runtime_targets,
                &native_request,
                &target.request,
            ) {
                return Err(test_input_error(
                    path.clone(),
                    "Native cut targets require distinct stable canonical originals",
                ));
            }
            native_unmock_originals.insert(original, target.clone());
            native_unmock_runtime_targets.insert(native_request, target.clone());
            cut_originals.insert(target.request.clone(), original);
        }
    }
    let initial_module = context
        .process(
            *source,
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
        )
        .module()
        .to_resolved()
        .await?;
    let initial_origin = runtime_resolve_origin(initial_module, path).await?;
    let mut consumers = Vec::new();
    let mut pairs: Vec<StaticMockPair> = Vec::new();
    let mut original_initials = Vec::new();
    let mut rules = Vec::new();
    let framework = get_next_package(root).await?;
    for request in &native_requests {
        let parsed = Request::parse(RcStr::from(request.clone()).into())
            .to_resolved()
            .await?;
        let resolved = esm_resolve(
            *original_origin,
            *parsed,
            EcmaScriptModulesReferenceSubType::DynamicImport,
            ResolveErrorMode::Error,
            None,
        )
        .await?;
        let originals = resolved.await?.primary_modules().await?;
        let Some(certificate) = (originals.len() == 1)
            .then(|| {
                native
                    .certificates
                    .iter()
                    .find(|known| known.original == originals[0])
            })
            .flatten()
        else {
            return Err(test_input_error(
                path.clone(),
                "Static/runtime mixtures require actual certified native targets",
            ));
        };
        let cut_target = native_unmock_originals.get(&certificate.original);
        if native_unmock
            && (native_unmock_targets
                .as_ref()
                .is_none_or(|targets| requests.len() != targets.len())
                || cut_originals.get(request) != Some(&certificate.original)
                || cut_target.is_none_or(|target| target.request != *request)
                || certificate.builtin.is_some()
                || certificate.kind
                    != crate::testing_external_modules::NativeOriginalKind::CommonJs)
        {
            return Err(test_input_error(
                path.clone(),
                "Retained unmock pairs require one actual native CommonJS certificate",
            ));
        }
        if native_unmock
            && (pairs.iter().any(|pair| pair.provider == certificate.module)
                || original_initials
                    .iter()
                    .any(|initial: &NativeOriginalInitial| initial.provider == certificate.module))
        {
            return Err(test_input_error(
                path.clone(),
                "Native cut target providers must be distinct",
            ));
        }
        let initial;
        let has_static_declaration = plan
            .declarations
            .iter()
            .any(|declaration| declaration.request == *request);
        if !has_static_declaration || cut_target.is_some_and(|target| !target.retained) {
            // Both actual entry references resolve to this very provider module.
            // Its cache record remains resettable; only the real helper closure
            // is retained across resets.
            initial = certificate.module;
            let protected = collect_registration_protection(
                registration,
                None,
                initial_module,
                &native.certificates,
                &framework,
                path,
            )
            .await?;
            if protected.contains(&certificate.module) {
                return Err(test_input_error(
                    path.clone(),
                    "Original-initial provider cannot be protected",
                ));
            }
            if !original_initials
                .iter()
                .any(|known: &NativeOriginalInitial| {
                    known.original == certificate.original && known.provider == certificate.module
                })
            {
                original_initials.push(NativeOriginalInitial {
                    original: certificate.original,
                    provider: certificate.module,
                    protected,
                });
            }
        } else {
            let resolved = esm_resolve(
                *initial_origin,
                *parsed,
                EcmaScriptModulesReferenceSubType::DynamicImport,
                ResolveErrorMode::Error,
                None,
            )
            .await?;
            let initials = resolved.await?.primary_modules().await?;
            if initials.len() != 1
                || initials[0] == certificate.module
                || initials[0] == certificate.original
                || initials[0] == initial_module
            {
                return Err(test_input_error(
                    path.clone(),
                    "Static/runtime targets require a distinct actual static replacement",
                ));
            }
            initial = initials[0];
            if let Some(previous) = pairs
                .iter()
                .find(|pair| pair.initial == initial || pair.provider == certificate.module)
            {
                if previous.initial != initial || previous.provider != certificate.module {
                    return Err(test_input_error(
                        path.clone(),
                        "Static/runtime compiler namespace/provider pairs overlap",
                    ));
                }
            } else {
                let protected = collect_registration_protection(
                    registration,
                    Some(initial),
                    initial_module,
                    &native.certificates,
                    &framework,
                    path,
                )
                .await?;
                pairs.push(StaticMockPair {
                    initial,
                    provider: certificate.module,
                    protected,
                });
            }
        }
        let (initial_source, initial_rule) = resolved_module_bridge(
            initial,
            &format!("{id}/static-initial-{}.mjs", consumers.len()),
        )
        .await?;
        let (provider_source, provider_rule) = resolved_module_bridge(
            certificate.module,
            &format!("{id}/static-provider-{}.mjs", consumers.len()),
        )
        .await?;
        rules.extend([initial_rule, provider_rule]);
        consumers.push(
            StaticNativeConsumer {
                directory: path.parent(),
                request: request.clone().into(),
                initial: initial_source,
                provider: provider_source,
            }
            .resolved_cell(),
        );
    }
    let base = context.await?;
    let existing = base.transitions.await?;
    rules.extend(existing.transition_rules.iter().cloned());
    let transitions = TransitionOptions {
        named_transitions: existing.named_transitions.clone(),
        transition_rules: rules,
        ..Default::default()
    }
    .resolved_cell();
    let plugin = StaticNativeResolvePlugin { consumers }.resolved_cell();
    let context = ModuleAssetContext::new(
        *transitions,
        *base.compile_time_info,
        *base.module_options_context,
        resolve_options(*base.resolve_options_context, *plugin),
        base.layer.clone(),
    )
    .to_resolved()
    .await?;
    Ok(StaticRuntimePreparation {
        context,
        certificates: native.certificates,
        pairs,
        original_initials,
    })
}
