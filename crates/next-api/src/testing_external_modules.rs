//! Native import namespaces for compiler-certified project ESM external edges.
use std::collections::{HashMap, HashSet};

use anyhow::{Result, bail};
use next_core::get_next_package;
use next_taskless::NODE_EXTERNALS;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::{File, FileContent, FileSystem, FileSystemPath, VirtualFileSystem};
use turbopack::{
    ModuleAssetContext,
    module_options::{RuleCondition, transition_rule::TransitionRule},
    transition::{FullContextTransition, Transition, TransitionOptions},
};
use turbopack_core::{
    asset::AssetContent,
    context::{AssetContext, ProcessResult},
    module::Module,
    reference::ModuleReference,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        ResolveErrorMode, ResolveResult, ResolveResultOption,
        options::{ImportMap, ImportMapping},
        origin::PlainResolveOrigin,
        parse::Request,
        plugin::{BeforeResolvePlugin, BeforeResolvePluginCondition},
    },
    source::Source,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    references::{
        esm::{EsmAssetReference, EsmAsyncAssetReference},
        external_module::CachedExternalModule,
    },
};
use turbopack_resolve::{ecmascript::esm_resolve, resolve_options_context::ResolveOptionsContext};

use crate::testing::registration_module_resolve_options;

#[turbo_tasks::value(shared)]
struct NativeExternalConsumer {
    directory: FileSystemPath,
    request: RcStr,
    source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value(shared)]
struct NativeExternalResolvePlugin {
    consumers: Vec<ResolvedVc<NativeExternalConsumer>>,
}

#[turbo_tasks::value_impl]
impl BeforeResolvePlugin for NativeExternalResolvePlugin {
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
        if !matches!(
            reference_type,
            ReferenceType::EcmaScriptModules(
                EcmaScriptModulesReferenceSubType::Import
                    | EcmaScriptModulesReferenceSubType::ImportPart(_)
                    | EcmaScriptModulesReferenceSubType::DynamicImport
                    | EcmaScriptModulesReferenceSubType::Undefined
            )
        ) {
            return Ok(Vc::cell(None));
        }
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
                    ResolveResult::source(consumer.source).resolved_cell(),
                )));
            }
        }
        Ok(Vc::cell(None))
    }
}

#[turbo_tasks::function]
async fn native_external_resolve_options(
    options: Vc<ResolveOptionsContext>,
    plugin: ResolvedVc<NativeExternalResolvePlugin>,
) -> Result<Vc<ResolveOptionsContext>> {
    let mut options = options.owned().await?;
    // Explicit mock resolvers run first. These entries only describe edges left in their graph.
    options
        .before_resolve_plugins
        .push(ResolvedVc::upcast(plugin));
    for (_, nested) in &mut options.rules {
        *nested = native_external_resolve_options(**nested, *plugin)
            .to_resolved()
            .await?;
    }
    Ok(options.cell())
}

fn project_source(
    root: &FileSystemPath,
    framework: &FileSystemPath,
    path: &FileSystemPath,
) -> bool {
    let Some(relative) = root.get_path_to(path) else {
        return false;
    };
    path != framework
        && framework.get_path_to(path).is_none()
        && !relative.split('/').any(|part| part == "node_modules")
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum NativeOriginalKind {
    CommonJs,
    Esm,
}
impl NativeOriginalKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::CommonJs => "commonjs",
            Self::Esm => "esm",
        }
    }
}

#[derive(Clone)]
pub(crate) struct NativeExternalCertificate {
    pub(crate) original: ResolvedVc<Box<dyn Module>>,
    pub(crate) native: ResolvedVc<Box<dyn Module>>,
    pub(crate) module: ResolvedVc<Box<dyn Module>>,
    pub(crate) kind: NativeOriginalKind,
    pub(crate) builtin: Option<String>,
}

pub(crate) struct NativeExternalPreparation {
    pub(crate) context: ResolvedVc<ModuleAssetContext>,
    pub(crate) certificates: Vec<NativeExternalCertificate>,
}

pub(crate) async fn native_external_context(
    root: FileSystemPath,
    context: ResolvedVc<ModuleAssetContext>,
    source: ResolvedVc<Box<dyn Source>>,
    registration: Option<ResolvedVc<Box<dyn Module>>>,
    id: &str,
) -> Result<ResolvedVc<ModuleAssetContext>> {
    Ok(
        prepare_native_external_context(root, context, source, registration, id, None)
            .await?
            .context,
    )
}

pub(crate) async fn runtime_native_external_context(
    root: FileSystemPath,
    context: ResolvedVc<ModuleAssetContext>,
    source: ResolvedVc<Box<dyn Source>>,
    id: &str,
    path: &FileSystemPath,
    requests: &[String],
) -> Result<NativeExternalPreparation> {
    prepare_native_external_context(root, context, source, None, id, Some((path, requests))).await
}

async fn prepare_native_external_context(
    root: FileSystemPath,
    context: ResolvedVc<ModuleAssetContext>,
    source: ResolvedVc<Box<dyn Source>>,
    registration: Option<ResolvedVc<Box<dyn Module>>>,
    id: &str,
    runtime_requests: Option<(&FileSystemPath, &[String])>,
) -> Result<NativeExternalPreparation> {
    let framework = get_next_package(root.clone()).await?;
    let spec = context
        .process(
            *source,
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
        )
        .module()
        .to_resolved()
        .await?;
    let mut queue = vec![spec];
    let mut seen = HashSet::new();
    let mut certificates: HashMap<(FileSystemPath, RcStr), ResolvedVc<Box<dyn Module>>> =
        HashMap::new();
    let mut native_modules: HashMap<ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn Source>>> =
        HashMap::new();
    let mut consumers = Vec::new();
    let mut rules = Vec::new();
    let mut candidates = Vec::new();
    let mut native_certificates: Vec<NativeExternalCertificate> = Vec::new();
    let mut runtime_targets = Vec::new();
    while let Some(module) = queue.pop() {
        if !seen.insert(module) || !project_source(&root, &framework, &module.ident().await?.path) {
            continue;
        }
        for reference in module.references().await?.iter() {
            let modules = reference
                .resolve_reference()
                .await?
                .primary_modules()
                .await?;
            queue.extend(modules.iter().copied());
            let (origin, request) = if let Some(reference) =
                ResolvedVc::try_downcast_type::<EsmAssetReference>(*reference)
            {
                let reference = reference.await?;
                (
                    reference.origin,
                    Request::parse(reference.request.clone().into())
                        .to_resolved()
                        .await?,
                )
            } else if let Some(reference) =
                ResolvedVc::try_downcast_type::<EsmAsyncAssetReference>(*reference)
            {
                let reference = reference.await?;
                (reference.origin, reference.request)
            } else {
                continue;
            };
            let importer = origin.into_trait_ref().await?.origin_path();
            if !project_source(&root, &framework, &importer) {
                continue;
            }
            let request = request.await?;
            let native_uri = matches!(&*request, Request::Uri { query, fragment, .. }
                if query.is_empty() && fragment.is_empty())
                && request
                    .request()
                    .is_some_and(|request| request.starts_with("node:"));
            if !matches!(&*request, Request::Module { query, fragment, ..} if query.is_empty() && fragment.is_empty())
                && !native_uri
            {
                continue;
            }
            let Some(request) = request.request() else {
                continue;
            };
            if modules.len() != 1 {
                continue;
            }
            candidates.push((importer.parent(), request, modules[0], native_uri));
        }
    }
    if let Some((path, requests)) = runtime_requests {
        let mut native_target = false;
        let origin = PlainResolveOrigin::new(*ResolvedVc::upcast(context), path.clone());
        for request in requests {
            let parsed = Request::parse(RcStr::from(request.clone()).into())
                .to_resolved()
                .await?;
            let request_shape = parsed.await?;
            let native_uri = matches!(&*request_shape, Request::Uri { query, fragment, .. }
                if query.is_empty() && fragment.is_empty())
                && request.starts_with("node:");
            if !matches!(&*request_shape, Request::Module { query, fragment, .. }
                if query.is_empty() && fragment.is_empty())
                && !native_uri
            {
                continue;
            }
            let resolved = esm_resolve(
                Vc::upcast(origin),
                *parsed,
                EcmaScriptModulesReferenceSubType::DynamicImport,
                ResolveErrorMode::Error,
                None,
            )
            .await?;
            let modules = resolved.await?.primary_modules().await?;
            if modules.len() == 1 {
                if let Some(external) =
                    ResolvedVc::try_downcast_type::<CachedExternalModule>(modules[0])
                {
                    native_target = true;
                    let external = external.await?;
                    let raw = external.request();
                    let name = raw.strip_prefix("node:").unwrap_or(&raw);
                    let builtin = NODE_EXTERNALS
                        .binary_search(&name)
                        .is_ok()
                        .then(|| name.to_owned());
                    runtime_targets.push((modules[0], builtin));
                }
                candidates.push((
                    path.parent(),
                    RcStr::from(request.clone()),
                    modules[0],
                    native_uri,
                ));
            }
        }
        if !native_target {
            return Ok(NativeExternalPreparation {
                context,
                certificates: Vec::new(),
            });
        }
    }
    for (directory, request, original, native_uri) in candidates {
        let Some(external) = ResolvedVc::try_downcast_type::<CachedExternalModule>(original) else {
            continue;
        };
        let kind = if matches!(
            *external.get_exports().await?,
            EcmascriptExports::CommonJs(_) | EcmascriptExports::EmptyCommonJs
        ) {
            NativeOriginalKind::CommonJs
        } else {
            NativeOriginalKind::Esm
        };
        let external = external.await?;
        let native_request = external.request();
        let builtin = NODE_EXTERNALS
            .binary_search(
                &native_request
                    .strip_prefix("node:")
                    .unwrap_or(&native_request),
            )
            .is_ok();
        if native_uri && !builtin {
            continue;
        }
        let builtin_name = builtin.then(|| {
            native_request
                .strip_prefix("node:")
                .unwrap_or(&native_request)
                .to_owned()
        });
        if runtime_requests.is_some()
            && !runtime_targets.iter().any(|(known, builtin)| {
                *known == original || (builtin_name.is_some() && *builtin == builtin_name)
            })
        {
            continue;
        }
        let Some(native) = external.native_import_module() else {
            continue;
        };
        let source = if let Some(source) = native_modules.get(&original) {
            *source
        } else {
            let native = ResolvedVc::upcast(native.to_resolved().await?);
            let module = if runtime_requests.is_some() && kind == NativeOriginalKind::CommonJs {
                if let Some(known) = native_certificates.iter().find(|known| {
                    known.original == original
                        || (builtin_name.is_some() && known.builtin == builtin_name)
                }) {
                    known.module
                } else {
                    native_runtime_original(
                        context,
                        native,
                        &format!("{id}/original-{}.mjs", native_modules.len()),
                    )
                    .await?
                }
            } else {
                native
            };
            let (source, rule) = resolved_module_bridge(
                module,
                &format!("{id}/external-{}.mjs", native_modules.len()),
            )
            .await?;
            rules.push(rule);
            native_certificates.push(NativeExternalCertificate {
                original,
                native,
                module,
                kind,
                builtin: builtin_name,
            });
            native_modules.insert(original, source);
            source
        };
        let key = (directory, request.clone());
        if let Some(previous) = certificates.insert(key.clone(), original) {
            if previous != original {
                bail!("Project ESM external consumers disagree on their resolved native target");
            }
            continue;
        }
        consumers.push(
            NativeExternalConsumer {
                directory: key.0,
                request,
                source,
            }
            .resolved_cell(),
        );
    }
    if consumers.is_empty() {
        return Ok(NativeExternalPreparation {
            context,
            certificates: native_certificates,
        });
    }
    let base = context.await?;
    let plugin = NativeExternalResolvePlugin { consumers }.resolved_cell();
    let resolve_options = if let Some(registration) = registration {
        let (source, rule) =
            resolved_module_bridge(registration, &format!("{id}/native-registration.mjs")).await?;
        rules.push(rule);
        let mut imports = ImportMap::empty();
        imports.insert_exact_alias(
            format!("next-test-registration:{id}"),
            ImportMapping::Direct(ResolveResult::source(source).resolved_cell()).resolved_cell(),
        );
        registration_module_resolve_options(*base.resolve_options_context, imports.cell())
    } else {
        *base.resolve_options_context
    };
    let transitions = base.transitions.await?;
    rules.extend(transitions.transition_rules.iter().cloned());
    rules.push(runtime_boundary_rule(root, context).await?);
    let transitions = TransitionOptions {
        named_transitions: transitions.named_transitions.clone(),
        transition_rules: rules,
        ..Default::default()
    }
    .resolved_cell();
    let context = ModuleAssetContext::new(
        *transitions,
        *base.compile_time_info,
        *base.module_options_context,
        native_external_resolve_options(resolve_options, *plugin),
        base.layer.clone(),
    )
    .to_resolved()
    .await?;
    Ok(NativeExternalPreparation {
        context,
        certificates: native_certificates,
    })
}

/// Install only actual node: references certified by the overlapping compiled graph.
/// No ordinary single-target consumer or explicit runtime-native target is widened.
pub(crate) async fn graph_native_external_context(
    root: FileSystemPath,
    context: ResolvedVc<ModuleAssetContext>,
    imports: &[turbopack_core::module_graph::runtime_import_demands::RuntimeImportNativeEdge],
    id: &str,
) -> Result<NativeExternalPreparation> {
    let framework = get_next_package(root.clone()).await?;
    let mut consumers = Vec::new();
    let mut rules = Vec::new();
    let mut keys = HashMap::new();
    let mut sources = HashMap::new();
    let mut certificates: Vec<NativeExternalCertificate> = Vec::new();
    for edge in imports {
        let reference = ResolvedVc::try_downcast_type::<EsmAssetReference>(edge.reference)
            .ok_or_else(|| {
                anyhow::anyhow!("Native demand import requires its actual static ESM reference")
            })?;
        let this = reference.await?;
        let origin = this.origin.into_trait_ref().await?.origin_path();
        anyhow::ensure!(
            origin == edge.owner.ident().await?.path && project_source(&root, &framework, &origin),
            "Native demand import requires its actual project owner"
        );
        let parsed = Request::parse(this.request.clone().into()).await?;
        anyhow::ensure!(
            matches!(&*parsed, Request::Uri {query, fragment, ..} if query.is_empty() && fragment.is_empty())
                && parsed
                    .request()
                    .is_some_and(|value| value.starts_with("node:")),
            "Native demand imports require queryless node: literals"
        );
        let resolved = reference.resolve_reference().await?;
        let actual = resolved.primary_modules().await?;
        anyhow::ensure!(
            !resolved.is_unresolvable()
                && resolved.errors().next().is_none()
                && actual.as_slice() == [edge.target],
            "Native demand import must retain one actual resolved target"
        );
        let external = ResolvedVc::try_downcast_type::<CachedExternalModule>(edge.target)
            .ok_or_else(|| {
                anyhow::anyhow!("Native demand import requires an actual cached external")
            })?;
        let external_value = external.await?;
        let request = external_value.request();
        let builtin = request.strip_prefix("node:").unwrap_or(&request);
        anyhow::ensure!(
            NODE_EXTERNALS.binary_search(&builtin).is_ok(),
            "Native demand import requires an actual supported builtin"
        );
        let source = if let Some(source) = sources.get(&edge.target) {
            *source
        } else {
            let kind = if matches!(
                *external.get_exports().await?,
                EcmascriptExports::CommonJs(_) | EcmascriptExports::EmptyCommonJs
            ) {
                NativeOriginalKind::CommonJs
            } else {
                NativeOriginalKind::Esm
            };
            let native = external
                .await?
                .native_import_module()
                .ok_or_else(|| {
                    anyhow::anyhow!("Native demand external does not support a native import clone")
                })?
                .to_resolved()
                .await?;
            let native = ResolvedVc::upcast(native);
            let module = if kind == NativeOriginalKind::CommonJs {
                native_graph_original(
                    context,
                    native,
                    &format!("{id}/demand-native-original-{}.mjs", sources.len()),
                )
                .await?
            } else {
                native
            };
            let (source, rule) = resolved_module_bridge(
                module,
                &format!("{id}/demand-native-{}.mjs", sources.len()),
            )
            .await?;
            rules.push(rule);
            certificates.push(NativeExternalCertificate {
                original: edge.target,
                native,
                module,
                kind,
                builtin: Some(builtin.to_owned()),
            });
            sources.insert(edge.target, source);
            source
        };
        let key = (origin.parent(), this.request.clone());
        if let Some(previous) = keys.insert(key.clone(), edge.target) {
            anyhow::ensure!(
                previous == edge.target,
                "Native demand consumers disagree on their actual target"
            );
            continue;
        }
        consumers.push(
            NativeExternalConsumer {
                directory: key.0,
                request: key.1,
                source,
            }
            .resolved_cell(),
        );
    }
    if consumers.is_empty() {
        return Ok(NativeExternalPreparation {
            context,
            certificates,
        });
    }
    let base = context.await?;
    let transitions = base.transitions.await?;
    rules.extend(transitions.transition_rules.iter().cloned());
    rules.push(runtime_boundary_rule(root, context).await?);
    let transitions = TransitionOptions {
        named_transitions: transitions.named_transitions.clone(),
        transition_rules: rules,
        ..Default::default()
    }
    .resolved_cell();
    let plugin = NativeExternalResolvePlugin { consumers }.resolved_cell();
    let context = ModuleAssetContext::new(
        *transitions,
        *base.compile_time_info,
        *base.module_options_context,
        native_external_resolve_options(*base.resolve_options_context, *plugin),
        base.layer.clone(),
    )
    .to_resolved()
    .await?;
    Ok(NativeExternalPreparation {
        context,
        certificates,
    })
}

async fn native_graph_original(
    context: ResolvedVc<ModuleAssetContext>,
    native: ResolvedVc<Box<dyn Module>>,
    identity: &str,
) -> Result<ResolvedVc<Box<dyn Module>>> {
    let path = VirtualFileSystem::new_with_name(rcstr!("next-test-native-runtime-originals"))
        .root()
        .owned()
        .await?
        .join(identity)?;
    let source = VirtualSource::new(
        path,
        AssetContent::file(
            FileContent::Content(File::from(
                "import * as original from 'INNER_NATIVE_ORIGINAL' with { \
                 \"__turbopack-helper__\": \"true\" };\n__turbopack_context__.n(new \
                 Proxy(original, {}));\n",
            ))
            .cell(),
        ),
    );
    Ok(context
        .process(
            Vc::upcast(source),
            ReferenceType::Internal(ResolvedVc::cell(
                fxindexmap! { rcstr!("INNER_NATIVE_ORIGINAL") => native },
            )),
        )
        .module()
        .to_resolved()
        .await?)
}

async fn native_runtime_original(
    context: ResolvedVc<ModuleAssetContext>,
    native: ResolvedVc<Box<dyn Module>>,
    identity: &str,
) -> Result<ResolvedVc<Box<dyn Module>>> {
    let path = VirtualFileSystem::new_with_name(rcstr!("next-test-native-runtime-originals"))
        .root()
        .owned()
        .await?
        .join(identity)?;
    let source = VirtualSource::new(
        path,
        AssetContent::file(
            FileContent::Content(File::from(
                "import * as original from 'INNER_NATIVE_ORIGINAL';\n__turbopack_context__.n(new \
                 Proxy(original, {}));\n",
            ))
            .cell(),
        ),
    );
    Ok(context
        .process(
            Vc::upcast(source),
            ReferenceType::Internal(ResolvedVc::cell(
                fxindexmap! { rcstr!("INNER_NATIVE_ORIGINAL") => native },
            )),
        )
        .module()
        .to_resolved()
        .await?)
}

/// This virtual source is only a transition key. It is never parsed or emitted as package code.
pub(crate) async fn resolved_module_bridge(
    module: ResolvedVc<Box<dyn Module>>,
    identity: &str,
) -> Result<(ResolvedVc<Box<dyn Source>>, TransitionRule)> {
    let path = VirtualFileSystem::new_with_name(rcstr!("next-test-resolved-module-bridges"))
        .root()
        .owned()
        .await?
        .join(identity)?;
    let source = ResolvedVc::upcast(
        VirtualSource::new(
            path.clone(),
            AssetContent::file(FileContent::Content(File::from("")).cell()),
        )
        .to_resolved()
        .await?,
    );
    let transition = ResolvedModuleTransition { module }.resolved_cell();
    Ok((
        source,
        TransitionRule::new_all(
            RuleCondition::ResourcePathEquals(path),
            ResolvedVc::upcast(transition),
        ),
    ))
}

#[turbo_tasks::value(shared)]
struct ResolvedModuleTransition {
    module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl Transition for ResolvedModuleTransition {
    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        _source: Vc<Box<dyn Source>>,
        _context: Vc<ModuleAssetContext>,
        _reference_type: ReferenceType,
    ) -> Result<Vc<ProcessResult>> {
        Ok(ProcessResult::Module(self.await?.module).cell())
    }
}

pub(crate) async fn runtime_boundary_rule(
    root: FileSystemPath,
    context: ResolvedVc<ModuleAssetContext>,
) -> Result<TransitionRule> {
    let runtime = get_next_package(root)
        .await?
        .join("dist/experimental/testing")?;
    let transition = FullContextTransition::new(*context).to_resolved().await?;
    Ok(TransitionRule::new_all(
        RuleCondition::ResourcePathInExactDirectory(runtime),
        ResolvedVc::upcast(transition),
    ))
}
