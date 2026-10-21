//! Exact static namespace/native-provider pairs for isolated Node runtime mocks.
use std::collections::HashSet;

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
};

/// Both manifests consume the same actual compiler identities. No runtime key
/// or source-name convention supplies a namespace/provider relationship.
#[derive(Clone)]
pub(crate) struct StaticMockPair {
    pub(crate) initial: ResolvedVc<Box<dyn Module>>,
    pub(crate) provider: ResolvedVc<Box<dyn Module>>,
    pub(crate) protected: Vec<ResolvedVc<Box<dyn Module>>>,
}

pub(crate) struct StaticRuntimePreparation {
    pub(crate) context: ResolvedVc<ModuleAssetContext>,
    pub(crate) certificates: Vec<NativeExternalCertificate>,
    pub(crate) pairs: Vec<StaticMockPair>,
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

pub(crate) async fn prepare(
    root: FileSystemPath,
    origin_context: ResolvedVc<ModuleAssetContext>,
    context: ResolvedVc<ModuleAssetContext>,
    source: ResolvedVc<Box<dyn Source>>,
    registration: ResolvedVc<Box<dyn Module>>,
    path: &FileSystemPath,
    requests: &[String],
    id: &str,
) -> Result<StaticRuntimePreparation> {
    let plan = static_mock_plan(path).await?;
    if plan.declarations.is_empty()
        || !plan.hoisted.is_empty()
        || !plan.actual_imports.is_empty()
        || !plan.mock_imports.is_empty()
        || !plan.unmocks.is_empty()
        || plan.declarations.iter().any(|declaration| {
            declaration.automatic || declaration.spy || !requests.contains(&declaration.request)
        })
    {
        return Err(test_input_error(
            path.clone(),
            "Static/runtime mixtures require paired explicit native factories",
        ));
    }
    let raw_source = ResolvedVc::upcast(FileSource::new(path.clone()).to_resolved().await?);
    let native = runtime_native_external_context(
        root.clone(),
        origin_context,
        raw_source,
        id,
        path,
        requests,
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
    let mut rules = Vec::new();
    let framework = get_next_package(root).await?;
    for request in requests {
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
        let initial = initials[0];
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
            let mut queue = vec![initial, registration];
            let mut protected = Vec::new();
            let mut seen = HashSet::new();
            while let Some(module) = queue.pop() {
                if !seen.insert(module)
                    || native
                        .certificates
                        .iter()
                        .any(|known| known.module == module)
                {
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
                    if !native
                        .certificates
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
                            "Static/runtime replacement closure contains an unresolved executable \
                             edge",
                        ));
                    }
                    queue.extend(reference.modules.iter().copied());
                }
            }
            pairs.push(StaticMockPair {
                initial,
                provider: certificate.module,
                protected,
            });
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
    })
}
