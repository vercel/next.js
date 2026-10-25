//! Runtime registration is selected at the real native loader callback.
//! This manifest owns actual compiler module IDs and never evaluates a target.
use std::collections::{HashMap, HashSet};

use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, fxindexmap};
use turbo_tasks_fs::FileSystemPath;
use turbopack::ModuleAssetContext;
use turbopack_core::{
    asset::Asset,
    context::AssetContext,
    module::Module,
    module_graph::runtime_import_demands::{
        RuntimeImportDemandEdge, RuntimeImportDemandGraph, RuntimeImportNamespaceCertificate,
        RuntimeImportNativeEdge, RuntimeImportNativePart,
    },
    reference::ModuleReference,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{ModuleResolveResultItem, ResolveErrorMode, origin::ResolveOrigin, parse::Request},
    source::Source,
};
use turbopack_ecmascript::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    module_fragments::part::module::EcmascriptModulePartAsset,
    references::external_module::CachedExternalModule,
    side_effect_optimization::locals::module::EcmascriptModuleLocalsModule,
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::{
    project::Project,
    testing::{static_mock_plan, test_input_error, test_source},
    testing_external_modules::{NativeExternalCertificate, NativeOriginalKind},
};

/// A known unsupported graph is candidate data until required admission fails.
/// Optional context derivation must not emit a user diagnostic while declining.
#[derive(Debug)]
struct UnsupportedGraphCandidate {
    path: FileSystemPath,
    message: RcStr,
}

impl std::fmt::Display for UnsupportedGraphCandidate {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.message.as_str())
    }
}

impl std::error::Error for UnsupportedGraphCandidate {}

fn graph_input_error(path: FileSystemPath, message: impl Into<RcStr>) -> anyhow::Error {
    UnsupportedGraphCandidate {
        path,
        message: message.into(),
    }
    .into()
}

fn required_graph_error(error: anyhow::Error) -> anyhow::Error {
    match error.downcast::<UnsupportedGraphCandidate>() {
        Ok(unsupported) => test_input_error(unsupported.path, unsupported.message),
        Err(error) => error,
    }
}

fn optional_graph_candidate(result: Result<CompiledGraph>) -> Result<Option<CompiledGraph>> {
    match result {
        Ok(graph) => Ok(Some(graph)),
        Err(error) if error.is::<UnsupportedGraphCandidate>() => Ok(None),
        Err(error) => Err(error),
    }
}

async fn references(
    module: ResolvedVc<Box<dyn Module>>,
) -> Result<Vec<ResolvedVc<Box<dyn Module>>>> {
    let mut modules = Vec::new();
    for reference in module.references().await?.iter() {
        let resolved = reference.resolve_reference().await?;
        for (_, item) in resolved.primary.iter() {
            if let ModuleResolveResultItem::External { name, .. } = item
                && !name.starts_with("node:")
            {
                return Err(test_input_error(
                    module.ident().await?.path.clone(),
                    format!("Runtime mocks require qualified node: external ownership: {name}"),
                ));
            }
        }
        modules.extend(resolved.primary_modules().await?);
    }
    Ok(modules)
}

/// Recover only the unique original behind real compiler-owned wrapper edges.
/// The wrapper keeps its own execution ID and all readsite references.
async fn graph_source_owner(
    module: ResolvedVc<Box<dyn Module>>,
) -> Result<ResolvedVc<Box<dyn Module>>> {
    inspect_graph_source_owner(module)
        .await
        .map_err(required_graph_error)
}

async fn inspect_graph_source_owner(
    module: ResolvedVc<Box<dyn Module>>,
) -> Result<ResolvedVc<Box<dyn Module>>> {
    let path = module.ident().await?.path.clone();
    let mut queue = vec![module];
    let mut seen = HashSet::new();
    let mut originals = HashSet::new();
    while let Some(current) = queue.pop() {
        if !seen.insert(current) {
            continue;
        }
        if ResolvedVc::try_downcast_type::<turbopack_ecmascript::EcmascriptModuleAsset>(current)
            .is_some()
        {
            originals.insert(current);
            continue;
        }
        if let Some(part) = ResolvedVc::try_downcast_type::<EcmascriptModulePartAsset>(current) {
            originals.insert(ResolvedVc::upcast(part.await?.full_module));
            continue;
        }
        if let Some(locals) = ResolvedVc::try_downcast_type::<EcmascriptModuleLocalsModule>(current)
        {
            originals.insert(ResolvedVc::upcast(locals.await?.module));
            continue;
        }
        if let Some(facade) = ResolvedVc::try_downcast_type::<turbopack_ecmascript::side_effect_optimization::facade::module::EcmascriptModuleFacadeModule>(current) {
            for reference in facade.await?.specific_references().await?.0 {
                let resolved = reference.resolve_reference().await?;
                let actual = resolved.primary_modules().await?;
                if actual.len() != 1 { return Err(graph_input_error(path.clone(), "Runtime graph facade must retain one actual original edge")); }
                queue.push(actual[0]);
            }
        } else if let Some(rename) = ResolvedVc::try_downcast_type::<turbopack_ecmascript::rename::module::EcmascriptModuleRenameModule>(current) {
            let reference = rename.await?.module_reference().await?;
            let resolved = reference.resolve_reference().await?;
            let actual = resolved.primary_modules().await?;
            if actual.len() != 1 { return Err(graph_input_error(path.clone(), "Runtime graph rename must retain one actual original edge")); }
            queue.push(actual[0]);
        } else {
            return Err(graph_input_error(path.clone(), "Runtime graph requires actual compiler-owned original edges"));
        }
    }
    if originals.len() != 1 {
        return Err(graph_input_error(
            path.clone(),
            "Runtime graph wrappers must retain one unique actual compiler original",
        ));
    }
    let original = *originals.iter().next().unwrap();
    if original.ident().await?.path != path {
        return Err(graph_input_error(
            path,
            "Runtime graph original edge belongs to another source",
        ));
    }
    Ok(original)
}

/// Only the generated static namespace provider has this actual exports kind.
/// Existing dynamic-native providers keep their separate, unchanged contract.
async fn graph_native_boundary(
    module: ResolvedVc<Box<dyn Module>>,
    certificates: &[NativeExternalCertificate],
) -> Result<bool> {
    let Some(certificate) = certificates.iter().find(|known| {
        known.module == module
            && known.module != known.native
            && known.kind == NativeOriginalKind::CommonJs
            && known.builtin.is_some()
    }) else {
        return Ok(false);
    };
    let Some(placeable) = ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module)
    else {
        return Ok(false);
    };
    Ok(matches!(
        *placeable.get_exports().await?,
        EcmascriptExports::DynamicNamespace
    ) && turbopack_core::reference::primary_referenced_modules(*module)
        .await?
        .contains(&certificate.native))
}

struct CompiledGraph {
    observed: HashSet<ResolvedVc<Box<dyn Module>>>,
    modules: Vec<ResolvedVc<Box<dyn Module>>>,
    aliases: Vec<ResolvedVc<Box<dyn Module>>>,
    static_edges: Vec<(ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn Module>>)>,
    demand_edges: Vec<RuntimeImportDemandEdge>,
    public_namespaces: Vec<ResolvedVc<Box<dyn Module>>>,
}

/// Certification follows actual part/locals owners and their resolver contexts.
/// Dependencies are cache owners, never aliases of the mocked root.
async fn compiled_graph(
    root: &FileSystemPath,
    next_package: &FileSystemPath,
    entry: &FileSystemPath,
    module: ResolvedVc<Box<dyn Module>>,
    target_path: &FileSystemPath,
    native_certificates: &[NativeExternalCertificate],
) -> Result<CompiledGraph> {
    inspect_compiled_graph(
        root,
        next_package,
        entry,
        module,
        target_path,
        native_certificates,
    )
    .await
    .map_err(required_graph_error)
}

async fn inspect_compiled_graph(
    root: &FileSystemPath,
    next_package: &FileSystemPath,
    entry: &FileSystemPath,
    module: ResolvedVc<Box<dyn Module>>,
    target_path: &FileSystemPath,
    native_certificates: &[NativeExternalCertificate],
) -> Result<CompiledGraph> {
    let mut queue = vec![module];
    let mut seen = HashSet::new();
    let target_original = inspect_graph_source_owner(module).await?;
    let mut modules = Vec::new();
    let mut aliases = Vec::new();
    let mut static_edges = Vec::new();
    let mut demand_edges = Vec::new();
    let mut public_namespaces = vec![module];
    while let Some(part) = queue.pop() {
        if !seen.insert(part) {
            continue;
        }
        let ident = part.ident().await?;
        if next_package.get_path_to(&ident.path).is_some() {
            continue;
        }
        if graph_native_boundary(part, native_certificates).await? {
            continue;
        }
        if let Some(external) = ResolvedVc::try_downcast_type::<CachedExternalModule>(part) {
            if external.await?.request().starts_with("node:") {
                continue;
            }
            return Err(graph_input_error(
                ident.path.clone(),
                "Runtime graph dependencies cannot be external packages",
            ));
        }
        let relative = root.get_path_to(&ident.path).ok_or_else(|| {
            graph_input_error(
                ident.path.clone(),
                "Runtime graph dependencies must stay inside the Next project",
            )
        })?;
        if ident.path == *entry
            || relative.split('/').any(|part| part == "node_modules")
            || !ident.query.is_empty()
            || !ident.fragment.is_empty()
            || !ident.path.realpath_with_links().await?.symlinks.is_empty()
        {
            return Err(graph_input_error(
                ident.path.clone(),
                "Runtime graph dependencies require unaliased project-local ESM without entry, \
                 package, query, fragment or symlink targets",
            ));
        }
        let placeable = ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(part)
            .ok_or_else(|| {
                graph_input_error(
                    ident.path.clone(),
                    "Runtime graph dependencies must be compiled ESM",
                )
            })?;
        let EcmascriptExports::EsmExports(exports) = &*placeable.get_exports().await? else {
            return Err(graph_input_error(
                ident.path.clone(),
                "Runtime graph dependencies cannot be CommonJS",
            ));
        };
        if exports.await?.exports.contains_key("then") {
            return Err(graph_input_error(
                ident.path.clone(),
                "Runtime graph dependencies with then exports are not implemented",
            ));
        }
        if *part.is_self_async().await? {
            return Err(graph_input_error(
                ident.path.clone(),
                "Runtime graph dependencies with asynchronous module evaluation are not \
                 implemented",
            ));
        }
        let source_owner = inspect_graph_source_owner(part).await?;
        if ident.path == *target_path && source_owner != target_original {
            return Err(graph_input_error(
                ident.path.clone(),
                "Runtime graph target aliases must retain the same actual compiler original",
            ));
        }
        let origin = inspect_runtime_resolve_origin(source_owner, &ident.path).await?;
        let original = next_core::util::file_content_rope(ident.path.read())
            .await?
            .to_str()?
            .into_owned();
        let mut sources = vec![original];
        let source = (*source_owner.source().await?).ok_or_else(|| {
            graph_input_error(
                ident.path.clone(),
                "Runtime graph dependencies require an inspectable compiler source",
            )
        })?;
        sources.push(
            next_core::util::file_content_rope(source.content().file_content())
                .await?
                .to_str()?
                .into_owned(),
        );
        let mut literal_modules = HashMap::new();
        for source in sources {
            crate::testing_mock_source::validate_mock_target_source(
                &source,
                ident.path.file_name(),
            )
            .map_err(|error| graph_input_error(ident.path.clone(), error.to_string()))?;
            let syntax = crate::testing_dependency_source::literal_dependencies(
                &source,
                ident.path.file_name(),
            );
            if !syntax.complete
                || !crate::testing_mock_source::extract_test_mocks(&source, ident.path.file_name())?
                    .is_empty()
            {
                return Err(graph_input_error(
                    ident.path.clone(),
                    "Runtime graph dependencies require complete literal ESM without helper \
                     operations",
                ));
            }
            for (request, dynamic) in syntax.requests {
                let literal = RcStr::from(request.clone());
                let request = Request::parse(RcStr::from(request).into())
                    .to_resolved()
                    .await?;
                let shape = request.await?;
                let node = shape
                    .request()
                    .is_some_and(|request| request.starts_with("node:"));
                if dynamic
                    || (!node
                        && !matches!(&*shape, Request::Relative {query, fragment, ..} if query.is_empty() && fragment.is_empty()))
                {
                    return Err(graph_input_error(
                        ident.path.clone(),
                        "Runtime graph dependencies require static relative ESM or explicit node: \
                         imports",
                    ));
                }
                let resolved = esm_resolve(
                    *origin,
                    *request,
                    EcmaScriptModulesReferenceSubType::Import,
                    ResolveErrorMode::Ignore,
                    None,
                )
                .await?;
                let resolved = resolved.await?;
                let actual = resolved.primary_modules().await?;
                if resolved.is_unresolvable() || resolved.errors().next().is_some()
                    || actual.len() != 1
                    || resolved.primary.iter().any(|(_, item)| matches!(item, ModuleResolveResultItem::External {name, ..} if !name.starts_with("node:")))
                {
                    return Err(graph_input_error(ident.path.clone(), "Runtime graph dependencies must resolve to exactly one actual ESM module"));
                }
                for source in resolved.affecting_sources_iter() {
                    if !source
                        .ident()
                        .await?
                        .path
                        .realpath_with_links()
                        .await?
                        .symlinks
                        .is_empty()
                    {
                        return Err(graph_input_error(
                            ident.path.clone(),
                            "Runtime graph dependency resolution cannot use symlink inputs",
                        ));
                    }
                }
                let actual_path = actual[0].ident().await?.path.clone();
                let external = ResolvedVc::try_downcast_type::<CachedExternalModule>(actual[0]);
                if (!node
                    && (next_package.get_path_to(&actual_path).is_some() || external.is_some()))
                    || (node
                        && external.is_none()
                        && !native_certificates
                            .iter()
                            .any(|known| known.module == actual[0] && known.builtin.is_some()))
                {
                    return Err(graph_input_error(
                        ident.path.clone(),
                        "Runtime graph literal dependencies require project ESM or actual \
                         explicit node: boundaries",
                    ));
                }
                if let Some(previous) = literal_modules.insert(literal, actual[0])
                    && previous != actual[0]
                {
                    return Err(graph_input_error(
                        ident.path.clone(),
                        "Runtime graph literal has conflicting actual compiler targets",
                    ));
                }
                if !node && !public_namespaces.contains(&actual[0]) {
                    public_namespaces.push(actual[0]);
                }
                queue.extend(actual.iter().copied());
            }
        }
        let mut part_demands = Vec::new();
        for reference in part.references().await?.iter() {
            let resolved = reference.resolve_reference().await?;
            let actual = resolved.primary_modules().await?;
            if ResolvedVc::try_downcast_type::<
                turbopack_ecmascript::references::esm::EsmAsyncAssetReference,
            >(*reference)
            .is_some()
            {
                return Err(graph_input_error(
                    ident.path.clone(),
                    "Runtime graph dependencies cannot contain asynchronous import references",
                ));
            }
            if let Some(reference) = ResolvedVc::try_downcast_type::<
                turbopack_ecmascript::references::esm::EsmAssetReference,
            >(*reference)
            {
                // The actual optimizer can omit a side-effect-free evaluation.
                // Full raw/transformed literals above still resolved uniquely.
                let ignored_evaluation = matches!(
                    &reference.await?.export_name,
                    Some(turbopack_core::resolve::ModulePart::Evaluation)
                ) && !resolved.primary.is_empty()
                    && resolved
                        .primary
                        .iter()
                        .all(|(_, item)| matches!(item, ModuleResolveResultItem::Ignore));
                if ignored_evaluation {
                    let this = reference.await?;
                    let target = *literal_modules.get(&this.request).ok_or_else(|| {
                        graph_input_error(
                            ident.path.clone(),
                            "Runtime graph ignored evaluation has no uniquely resolved actual \
                             literal",
                        )
                    })?;
                    let span = this.issue_source.to_swc_offsets().await?.ok_or_else(|| {
                        graph_input_error(
                            ident.path.clone(),
                            "Runtime graph evaluation requires an actual import readsite",
                        )
                    })?;
                    part_demands.push((
                        span,
                        RuntimeImportDemandEdge {
                            owner: part,
                            target,
                            reference: ResolvedVc::upcast(reference),
                            site: 0,
                            source_order: span.0,
                            evaluation_only: true,
                        },
                    ));
                    continue;
                }
                if actual.len() != 1 {
                    return Err(graph_input_error(
                        ident.path.clone(),
                        "Runtime graph static edges must resolve to exactly one actual module",
                    ));
                }
                static_edges.push((part, actual[0]));
                let this = reference.await?;
                let span = this.issue_source.to_swc_offsets().await?.ok_or_else(|| {
                    graph_input_error(
                        ident.path.clone(),
                        "Runtime graph requires an actual static import readsite",
                    )
                })?;
                part_demands.push((
                    span,
                    RuntimeImportDemandEdge {
                        owner: part,
                        target: actual[0],
                        reference: ResolvedVc::upcast(reference),
                        site: 0,
                        source_order: span.0,
                        evaluation_only: false,
                    },
                ));
            }
            if resolved.primary.iter().any(|(_, item)| matches!(item, ModuleResolveResultItem::External {name, ..} if !name.starts_with("node:"))) {
                return Err(graph_input_error(ident.path.clone(), "Runtime graph references cannot own external packages"));
            }
            queue.extend(actual.iter().copied());
        }
        part_demands.sort_by_key(|(span, _)| *span);
        let binding_targets = part_demands
            .iter()
            .filter(|(_, edge)| !edge.evaluation_only)
            .map(|(_, edge)| edge.target)
            .collect::<HashSet<_>>();
        let mut namespace_sites = HashMap::new();
        for (_, mut edge) in part_demands {
            // A retained namespace import already performs this evaluation.
            if edge.evaluation_only && binding_targets.contains(&edge.target) {
                continue;
            }
            let next = u32::try_from(namespace_sites.len())?;
            edge.site = *namespace_sites.entry(edge.target).or_insert(next);
            demand_edges.push(edge);
        }
        if ident.path == *target_path {
            aliases.push(part);
        }
        modules.push(part);
    }
    Ok(CompiledGraph {
        observed: seen,
        modules,
        aliases,
        static_edges,
        demand_edges,
        public_namespaces,
    })
}

async fn namespace_certificate(
    module: ResolvedVc<Box<dyn Module>>,
) -> Result<ResolvedVc<RuntimeImportNamespaceCertificate>> {
    let path = module.ident().await?.path.clone();
    let original = graph_source_owner(module).await?;
    let Some(source) = *original.source().await? else {
        return Err(test_input_error(
            path,
            "Runtime public namespace requires its actual original source",
        ));
    };
    let raw = next_core::util::file_content_rope(path.read())
        .await?
        .to_str()?
        .into_owned();
    let processed = next_core::util::file_content_rope(source.content().file_content())
        .await?
        .to_str()?
        .into_owned();
    let order = crate::testing_mock_source::runtime_namespace_exports(&raw, path.file_name())
        .map_err(|error| test_input_error(path.clone(), error.to_string()))?;
    if order
        != crate::testing_mock_source::runtime_namespace_exports(&processed, path.file_name())
            .map_err(|error| test_input_error(path.clone(), error.to_string()))?
    {
        return Err(test_input_error(
            path,
            "Runtime public namespace source orders disagree",
        ));
    }
    let Some(placeable) = ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module)
    else {
        return Err(test_input_error(
            path,
            "Runtime public namespace requires the actual compiled ESM module",
        ));
    };
    let EcmascriptExports::EsmExports(exports) = &*placeable.get_exports().await? else {
        return Err(test_input_error(
            path,
            "Runtime public namespace cannot be CommonJS",
        ));
    };
    let exports = exports
        .expand_exports(
            turbopack_core::module_graph::binding_usage_info::ModuleExportUsageInfo::all(),
        )
        .await?;
    let actual = exports
        .exports
        .keys()
        .map(|name| name.as_str())
        .collect::<HashSet<_>>();
    if !exports.dynamic_exports.is_empty()
        || actual.len() != order.len()
        || order.iter().any(|name| !actual.contains(name.as_str()))
    {
        return Err(test_input_error(
            path,
            "Runtime public namespace must match the complete actual compiler export set",
        ));
    }
    Ok(RuntimeImportNamespaceCertificate {
        kind: turbopack_core::module_graph::runtime_import_demands::RuntimeImportNamespaceKind::Esm,
        module,
        export_order: order.into_iter().map(RcStr::from).collect(),
    }
    .resolved_cell())
}

/// Optional syntax candidates still use the same strict actual-module certificate.
async fn optional_namespace_certificate(
    module: ResolvedVc<Box<dyn Module>>,
) -> Result<Option<ResolvedVc<RuntimeImportNamespaceCertificate>>> {
    let path = module.ident().await?.path.clone();
    let original = graph_source_owner(module).await?;
    let Some(source) = *original.source().await? else {
        return Err(test_input_error(
            path,
            "Runtime public namespace requires its actual original source",
        ));
    };
    let raw = next_core::util::file_content_rope(path.read())
        .await?
        .to_str()?
        .into_owned();
    let processed = next_core::util::file_content_rope(source.content().file_content())
        .await?
        .to_str()?
        .into_owned();
    if crate::testing_mock_source::runtime_namespace_exports_candidate(&raw, path.file_name())?
        .is_none()
        || crate::testing_mock_source::runtime_namespace_exports_candidate(
            &processed,
            path.file_name(),
        )?
        .is_none()
    {
        return Ok(None);
    }
    Ok(Some(namespace_certificate(module).await?))
}

pub(crate) struct DynamicMockManifest {
    pub(crate) module: ResolvedVc<Box<dyn Module>>,
    pub(crate) native_resettable: Vec<NativeExternalCertificate>,
    pub(crate) native_protected: Vec<NativeExternalCertificate>,
    pub(crate) compiled_resettable: Vec<ResolvedVc<Box<dyn Module>>>,
    pub(crate) demand_graph: Option<ResolvedVc<RuntimeImportDemandGraph>>,
}

struct DynamicTarget {
    module: ResolvedVc<Box<dyn Module>>,
    requests: Vec<String>,
    parts: Vec<ResolvedVc<Box<dyn Module>>>,
    native_original: Option<NativeOriginalKind>,
    static_mock: Option<crate::testing_static_runtime::StaticMockPair>,
}

#[cfg(test)]
fn manifest_value_source(
    owners: usize,
    targets: &[(usize, &[String], Option<NativeOriginalKind>)],
) -> Result<String> {
    manifest_value_source_with_static(owners, targets, &[])
}

fn manifest_value_source_with_static(
    owners: usize,
    targets: &[(usize, &[String], Option<NativeOriginalKind>)],
    static_pairs: &[bool],
) -> Result<String> {
    if (!static_pairs.is_empty() && static_pairs.len() != targets.len())
        || static_pairs
            .iter()
            .zip(targets)
            .any(|(paired, (_, _, kind))| *paired && kind.is_none())
    {
        bail!("Static runtime manifest pairs require corresponding native targets");
    }
    Ok(format!(
        "export const manifest={{version:1,owners:[{}],targets:[{}]}};\n",
        (0..owners)
            .map(|index| format!("owner_{index}"))
            .collect::<Vec<_>>()
            .join(","),
        targets
            .iter()
            .enumerate()
            .map(|(index, (parts, requests, kind))| Ok(format!(
                "{{id:target_{index},aliases:[{}],requests:{}{}{}}}",
                (0..*parts)
                    .map(|part_index| format!("part_{index}_{part_index}"))
                    .collect::<Vec<_>>()
                    .join(","),
                serde_json::to_string(requests)?,
                kind.map(|kind| format!(",nativeOriginal:{:?}", kind.as_str()))
                    .unwrap_or_default(),
                if static_pairs.get(index).copied().unwrap_or_default() {
                    format!(",staticMock:{{initial:initial_{index},provider:target_{index}}}")
                } else {
                    String::new()
                }
            )))
            .collect::<Result<Vec<_>>>()?
            .join(",")
    ))
}

fn append_static_imports(manifest_source: &mut String, count: usize) {
    if count > 0 {
        let edges = (0..count)
            .map(|index| format!("{{owner:static_owner_{index},target:static_target_{index}}}"))
            .collect::<Vec<_>>()
            .join(",");
        let suffix = "};\n";
        let body = manifest_source
            .strip_suffix(suffix)
            .expect("manifest object suffix");
        *manifest_source = format!("{body},staticImports:[{edges}]{suffix}");
    }
}

fn append_static_demands(manifest_source: &mut String, sites: &[u32]) {
    if !sites.is_empty() {
        let edges = sites
            .iter()
            .enumerate()
            .map(|(index, site)| {
                format!("{{owner:demand_owner_{index},target:demand_target_{index},site:{site}}}")
            })
            .collect::<Vec<_>>()
            .join(",");
        let suffix = "};\n";
        let body = manifest_source
            .strip_suffix(suffix)
            .expect("manifest object suffix");
        *manifest_source = format!("{body},staticDemands:[{edges}]{suffix}");
    }
}

pub(crate) async fn runtime_resolve_origin(
    root_module: ResolvedVc<Box<dyn Module>>,
    path: &FileSystemPath,
) -> Result<ResolvedVc<Box<dyn ResolveOrigin>>> {
    inspect_runtime_resolve_origin(root_module, path)
        .await
        .map_err(required_graph_error)
}

async fn inspect_runtime_resolve_origin(
    root_module: ResolvedVc<Box<dyn Module>>,
    path: &FileSystemPath,
) -> Result<ResolvedVc<Box<dyn ResolveOrigin>>> {
    let origin_module = if let Some(part) =
        ResolvedVc::try_downcast_type::<EcmascriptModulePartAsset>(root_module)
    {
        ResolvedVc::upcast(part.await?.full_module)
    } else if let Some(locals) =
        ResolvedVc::try_downcast_type::<EcmascriptModuleLocalsModule>(root_module)
    {
        ResolvedVc::upcast(locals.await?.module)
    } else {
        root_module
    };
    let Some(origin) = ResolvedVc::try_sidecast::<Box<dyn ResolveOrigin>>(origin_module) else {
        return Err(graph_input_error(
            path.clone(),
            "Runtime mocks require the actual entry resolver origin",
        ));
    };
    crate::testing_dependencies::dependency_origin(origin).await
}

/// Derive native mappings for certified overlapping graphs or one declared compiled graph.
/// The final manifest re-certifies every new owner/reference/target in this context.
pub(crate) async fn graph_native_external_context(
    root: FileSystemPath,
    context: ResolvedVc<ModuleAssetContext>,
    source: ResolvedVc<Box<dyn Source>>,
    path: &FileSystemPath,
    requests: &[String],
    id: &str,
) -> Result<crate::testing_external_modules::NativeExternalPreparation> {
    let unchanged = || crate::testing_external_modules::NativeExternalPreparation {
        context,
        certificates: Vec::new(),
    };
    if requests.is_empty() {
        return Ok(unchanged());
    }
    let next_package = next_core::get_next_package(root.clone()).await?;
    let module = context
        .process(
            *source,
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
        )
        .module()
        .to_resolved()
        .await?;
    let origin = runtime_resolve_origin(module, path).await?;
    let terminal = static_mock_plan(path).await?.throw_only_runtime_requests;
    let mut graphs = Vec::new();
    for request in requests {
        if terminal.contains(request) {
            return Ok(unchanged());
        }
        let resolved = esm_resolve(
            *origin,
            Request::parse(RcStr::from(request.clone()).into()),
            EcmaScriptModulesReferenceSubType::DynamicImport,
            ResolveErrorMode::Ignore,
            None,
        )
        .await?;
        let resolved = resolved.await?;
        let actual = resolved.primary_modules().await?;
        if resolved.is_unresolvable()
            || resolved.errors().next().is_some()
            || actual.len() != 1
            || ResolvedVc::try_downcast_type::<CachedExternalModule>(actual[0]).is_some()
        {
            return Ok(unchanged());
        }
        let target = actual[0];
        if graphs
            .iter()
            .any(|(known, _): &(ResolvedVc<Box<dyn Module>>, CompiledGraph)| *known == target)
        {
            continue;
        }
        let target_path = target.ident().await?.path.clone();
        let Some(graph) = optional_graph_candidate(
            inspect_compiled_graph(&root, &next_package, path, target, &target_path, &[]).await,
        )?
        else {
            return Ok(unchanged());
        };
        graphs.push((target, graph));
    }
    let overlaps = graphs.iter().any(|(owner, graph)| {
        graphs.iter().any(|(target, other)| {
            owner != target
                && (graph.observed.contains(target)
                    || other
                        .aliases
                        .iter()
                        .any(|part| graph.observed.contains(part)))
        })
    });
    let single_declared_graph = requests.len() == 1 && graphs.len() == 1;
    if !overlaps && !single_declared_graph {
        return Ok(unchanged());
    }
    let mut imports = Vec::new();
    for (_, graph) in graphs {
        for edge in graph.demand_edges {
            if ResolvedVc::try_downcast_type::<CachedExternalModule>(edge.target).is_some() {
                imports.push(RuntimeImportNativeEdge {
                    via_part: None,
                    owner: edge.owner,
                    target: edge.target,
                    reference: edge.reference,
                    source_order: edge.source_order,
                });
            }
        }
    }
    crate::testing_external_modules::graph_native_external_context(root, context, &imports, id)
        .await
}

pub(crate) async fn manifest(
    project: ResolvedVc<Project>,
    context: ResolvedVc<ModuleAssetContext>,
    root_module: ResolvedVc<Box<dyn Module>>,
    path: &FileSystemPath,
    requests: &[String],
    native_certificates: &[NativeExternalCertificate],
    static_pairs: &[crate::testing_static_runtime::StaticMockPair],
    commonjs: Option<&crate::testing_cjs_reset::CommonJsResetPreparation>,
) -> Result<DynamicMockManifest> {
    let root = project.project_path().owned().await?;
    let next_package = next_core::get_next_package(root.clone()).await?;
    let origin = runtime_resolve_origin(root_module, path).await?;
    let mut targets: Vec<DynamicTarget> = Vec::new();
    let mut native_resettable: Vec<NativeExternalCertificate> = Vec::new();
    let terminal_throw_requests = static_mock_plan(path).await?.throw_only_runtime_requests;
    let mut authorized = HashSet::new();
    let mut compiled_resettable = Vec::new();
    let mut candidate_static_edges = Vec::new();
    let mut candidate_demands = Vec::new();
    let mut candidate_public_namespaces = Vec::new();
    let mut ordinary_namespace_roots = Vec::new();
    let mut graph_ownership = Vec::new();
    for request in requests {
        if matches!(request.as_str(), "next" | "react" | "react-dom" | "vitest")
            || ["next/", "react/", "react-dom/"]
                .iter()
                .any(|prefix| request.starts_with(prefix))
        {
            return Err(test_input_error(
                path.clone(),
                "Runtime module mocks cannot replace framework or native targets",
            ));
        }
        let resolved = esm_resolve(
            *origin,
            Request::parse(RcStr::from(request.clone()).into()),
            EcmaScriptModulesReferenceSubType::DynamicImport,
            ResolveErrorMode::Error,
            None,
        )
        .await?;
        let resolved = resolved.await?;
        for source in resolved.affecting_sources_iter() {
            if !source
                .ident()
                .await?
                .path
                .realpath_with_links()
                .await?
                .symlinks
                .is_empty()
            {
                return Err(test_input_error(
                    path.clone(),
                    "Runtime mock target resolution cannot use symlink inputs yet",
                ));
            }
        }
        let modules = resolved.primary_modules().await?;
        if modules.len() != 1 {
            return Err(test_input_error(
                path.clone(),
                "Runtime mock target must resolve to one native ESM module",
            ));
        }
        let module = modules[0];
        if let Some(commonjs) = commonjs
            && let Some(certificate) = commonjs.runtime_target(request, module).await?
        {
            for root in &commonjs.roots {
                authorized.insert(root.namespace);
                authorized.insert(root.compiled);
            }
            if let Some(target) = targets.iter_mut().find(|target| target.module == module) {
                target.requests.push(request.clone());
            } else {
                targets.push(DynamicTarget {
                    module: certificate.namespace,
                    requests: vec![request.clone()],
                    parts: vec![certificate.namespace],
                    native_original: None,
                    static_mock: None,
                });
            }
            continue;
        }
        if let Some(certificate) = native_certificates
            .iter()
            .find(|known| known.module == module)
        {
            let parts = native_certificates
                .iter()
                .filter(|known| {
                    known.original == certificate.original
                        || (certificate.builtin.is_some() && known.builtin == certificate.builtin)
                })
                .map(|known| {
                    if known.kind != certificate.kind {
                        return Err(test_input_error(
                            path.clone(),
                            "Native runtime target certificates disagree on export kind",
                        ));
                    }
                    Ok(known.module)
                })
                .collect::<Result<Vec<_>>>()?;
            if let Some(target) = targets
                .iter_mut()
                .find(|target| target.parts.contains(&module))
            {
                target.requests.push(request.clone());
                continue;
            }
            for part in &parts {
                authorized.insert(*part);
                if !native_resettable.iter().any(|known| known.module == *part) {
                    let certificate = native_certificates
                        .iter()
                        .find(|known| known.module == *part)
                        .expect("selected native certificate");
                    native_resettable.push(certificate.clone());
                }
            }
            targets.push(DynamicTarget {
                module,
                requests: vec![request.clone()],
                parts,
                native_original: Some(certificate.kind),
                static_mock: static_pairs
                    .iter()
                    .find(|pair| pair.provider == module)
                    .cloned(),
            });
            continue;
        }
        if request.starts_with("node:") {
            return Err(test_input_error(
                path.clone(),
                "Runtime node: targets require an actual certified native builtin",
            ));
        }
        if ResolvedVc::try_downcast_type::<CachedExternalModule>(module).is_some() {
            return Err(test_input_error(
                path.clone(),
                "Runtime module mocks cannot replace external targets",
            ));
        }
        if let Some(target) = targets.iter_mut().find(|target| target.module == module) {
            target.requests.push(request.clone());
            continue;
        }
        let ident = module.ident().await?;
        let target_path = ident.path.clone();
        let Some(relative) = root.get_path_to(&target_path) else {
            return Err(test_input_error(
                path.clone(),
                "Runtime mock targets must stay inside the Next project",
            ));
        };
        if next_package.get_path_to(&target_path).is_some()
            || target_path == *path
            || relative.split('/').any(|part| part == "node_modules")
            || !ident.query.is_empty()
            || !ident.fragment.is_empty()
            || !target_path.realpath_with_links().await?.symlinks.is_empty()
        {
            return Err(test_input_error(
                path.clone(),
                "Runtime mocks require unaliased project-local ESM targets without queries or \
                 fragments",
            ));
        }
        let source = next_core::util::file_content_rope(target_path.read())
            .await?
            .to_str()?
            .into_owned();
        crate::testing_mock_source::validate_mock_target_source(&source, target_path.file_name())
            .map_err(|error| test_input_error(target_path.clone(), error.to_string()))?;
        let syntax = crate::testing_dependency_source::literal_dependencies(
            &source,
            target_path.file_name(),
        );
        if syntax.complete
            && syntax
                .requests
                .iter()
                .any(|(request, _)| !request.starts_with("node:"))
            && !terminal_throw_requests.contains(request)
            && static_pairs.is_empty()
        {
            let graph = compiled_graph(
                &root,
                &next_package,
                path,
                module,
                &target_path,
                native_certificates,
            )
            .await?;
            for part in &graph.modules {
                authorized.insert(*part);
                if !compiled_resettable.contains(part) {
                    compiled_resettable.push(*part);
                }
            }
            candidate_static_edges.extend(graph.static_edges);
            candidate_demands.extend(graph.demand_edges);
            candidate_public_namespaces.extend(graph.public_namespaces);
            graph_ownership.push((module, graph.observed));
            targets.push(DynamicTarget {
                module,
                requests: vec![request.clone()],
                parts: graph.aliases,
                native_original: None,
                static_mock: None,
            });
            continue;
        }
        if !syntax.complete
            || syntax
                .requests
                .iter()
                .any(|(request, _)| !request.starts_with("node:"))
            || !crate::testing_mock_source::extract_test_mocks(&source, target_path.file_name())?
                .is_empty()
        {
            return Err(test_input_error(
                target_path.clone(),
                "Runtime mock targets currently require leaf ESM with only explicit node: builtin \
                 imports",
            ));
        }
        let mut queue = vec![module];
        let mut seen = HashSet::new();
        let mut owned = Vec::new();
        let mut inspectable = false;
        while let Some(part) = queue.pop() {
            if !seen.insert(part) {
                continue;
            }
            let ident = part.ident().await?;
            if next_package.get_path_to(&ident.path).is_some() {
                continue;
            }
            if graph_native_boundary(part, native_certificates).await? {
                continue;
            }
            if let Some(external) = ResolvedVc::try_downcast_type::<CachedExternalModule>(part) {
                if external.await?.request().starts_with("node:") {
                    continue;
                }
                return Err(test_input_error(
                    target_path.clone(),
                    "Runtime mock target externals must be explicit node: builtins",
                ));
            }
            if ident.path != target_path {
                return Err(test_input_error(
                    target_path.clone(),
                    "Runtime mock targets cannot have transitive user modules yet",
                ));
            }
            if let Some(source) = *part.source().await? {
                let transformed =
                    next_core::util::file_content_rope(source.content().file_content())
                        .await?
                        .to_str()?
                        .into_owned();
                crate::testing_mock_source::validate_mock_target_source(
                    &transformed,
                    target_path.file_name(),
                )
                .map_err(|error| test_input_error(target_path.clone(), error.to_string()))?;
                let syntax = crate::testing_dependency_source::literal_dependencies(
                    &transformed,
                    target_path.file_name(),
                );
                if !syntax.complete
                    || syntax
                        .requests
                        .iter()
                        .any(|(request, _)| !request.starts_with("node:"))
                    || !crate::testing_mock_source::extract_test_mocks(
                        &transformed,
                        target_path.file_name(),
                    )?
                    .is_empty()
                {
                    return Err(test_input_error(
                        target_path.clone(),
                        "Runtime mock transformed sources require leaf ESM without helper \
                         operations",
                    ));
                }
                inspectable = true;
            }
            let Some(placeable) =
                ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(part)
            else {
                return Err(test_input_error(
                    target_path.clone(),
                    "Runtime mock targets must be compiled ESM",
                ));
            };
            let EcmascriptExports::EsmExports(exports) = &*placeable.get_exports().await? else {
                return Err(test_input_error(
                    target_path.clone(),
                    if terminal_throw_requests.contains(request) {
                        "Throw-only runtime factories require an actual certified native target"
                    } else {
                        "Runtime mock targets cannot be CommonJS"
                    },
                ));
            };
            if exports.await?.exports.contains_key("then") {
                return Err(test_input_error(
                    target_path.clone(),
                    "Runtime mock targets with then exports are not implemented",
                ));
            }
            authorized.insert(part);
            owned.push(part);
            queue.extend(references(part).await?);
        }
        if !inspectable {
            return Err(test_input_error(
                target_path.clone(),
                "Runtime mock targets require an inspectable compiler source",
            ));
        }
        ordinary_namespace_roots.push((module, owned.clone()));
        targets.push(DynamicTarget {
            module,
            requests: vec![request.clone()],
            parts: owned,
            native_original: None,
            static_mock: None,
        });
    }
    let static_protected = static_pairs
        .iter()
        .flat_map(|pair| pair.protected.iter().copied())
        .collect::<HashSet<_>>();
    let mut queue = vec![root_module];
    let mut seen = HashSet::new();
    let mut owners = Vec::new();
    while let Some(module) = queue.pop() {
        if !seen.insert(module) {
            continue;
        }
        let ident = module.ident().await?;
        if next_package.get_path_to(&ident.path).is_some() {
            continue;
        }
        if commonjs.is_some_and(|commonjs| commonjs.protected.contains(&module))
            || static_protected.contains(&module)
            || graph_native_boundary(module, native_certificates).await?
            || native_resettable.iter().any(|known| known.module == module)
        {
            continue;
        }
        if let Some(external) = ResolvedVc::try_downcast_type::<CachedExternalModule>(module) {
            if external.await?.request().starts_with("node:") {
                continue;
            }
            return Err(test_input_error(
                path.clone(),
                "Runtime mocks do not support external package modules",
            ));
        }
        if ident.path == *path {
            owners.push(module);
        } else if !authorized.contains(&module) {
            return Err(test_input_error(
                ident.path.clone(),
                "Runtime mock imports must currently originate in the explicit test entry",
            ));
        }
        queue.extend(references(module).await?);
    }
    if owners.is_empty() {
        return Err(test_input_error(
            path.clone(),
            "Runtime mock manifest has no native entry owner",
        ));
    }
    // Only an actually overlapping declared graph needs asynchronous demand.
    // Independent and single-target graphs keep their existing emitted contract.
    let needs_demands = graph_ownership.iter().any(|(owner, dependencies)| {
        targets.iter().any(|target| {
            target.module != *owner
                && (dependencies.contains(&target.module)
                    || target.parts.iter().any(|part| dependencies.contains(part)))
        })
    });
    let single_compiled_graph = targets.len() == 1
        && graph_ownership.len() == 1
        && graph_ownership[0].0 == targets[0].module
        && targets[0].native_original.is_none()
        && targets[0].static_mock.is_none();
    let mut demand_edges = Vec::new();
    let mut native_imports = Vec::new();
    if needs_demands {
        if targets
            .iter()
            .any(|target| target.native_original.is_some() || target.static_mock.is_some())
        {
            return Err(test_input_error(
                path.clone(),
                "Runtime graph demand cannot combine native or static mock targets",
            ));
        }
        // Leaf targets already carry their separately certified actual part IDs.
        // Retain those cache owners explicitly alongside the transitive graph.
        for target in &targets {
            for module in &target.parts {
                if !compiled_resettable.contains(module) {
                    compiled_resettable.push(*module);
                }
            }
        }
        for edge in candidate_demands {
            if edge.owner != edge.target
                && compiled_resettable.contains(&edge.owner)
                && native_certificates
                    .iter()
                    .any(|known| known.module == edge.target && known.builtin.is_some())
            {
                if !native_imports
                    .iter()
                    .any(|known: &RuntimeImportNativeEdge| {
                        known.owner == edge.owner && known.reference == edge.reference
                    })
                {
                    native_imports.push(RuntimeImportNativeEdge {
                        via_part: None,
                        owner: edge.owner,
                        target: edge.target,
                        reference: edge.reference,
                        source_order: edge.source_order,
                    });
                }
                continue;
            }
            if edge.owner == edge.target
                || !compiled_resettable.contains(&edge.owner)
                || !compiled_resettable.contains(&edge.target)
            {
                return Err(test_input_error(
                    path.clone(),
                    "Runtime graph demand requires distinct actual compiled reset owners",
                ));
            }
            if !demand_edges.iter().any(|known: &RuntimeImportDemandEdge| {
                known.owner == edge.owner && known.reference == edge.reference
            }) {
                demand_edges.push(edge);
            }
        }
        if demand_edges.is_empty() {
            return Err(test_input_error(
                path.clone(),
                "Runtime graph demand has no actual static readsites",
            ));
        }
    } else if single_compiled_graph {
        // One declared compiled graph has no cross-target demand edge. Its
        // actual native imports still establish the original ESM bindings.
        for edge in candidate_demands {
            if edge.owner != edge.target
                && compiled_resettable.contains(&edge.owner)
                && native_certificates
                    .iter()
                    .any(|known| known.module == edge.target && known.builtin.is_some())
                && !native_imports
                    .iter()
                    .any(|known: &RuntimeImportNativeEdge| {
                        known.owner == edge.owner && known.reference == edge.reference
                    })
            {
                native_imports.push(RuntimeImportNativeEdge {
                    via_part: None,
                    owner: edge.owner,
                    target: edge.target,
                    reference: edge.reference,
                    source_order: edge.source_order,
                });
            }
        }
    }
    let mut namespace_certificates = Vec::new();
    if needs_demands {
        candidate_public_namespaces.extend(targets.iter().map(|target| target.module));
        let mut certified = HashSet::new();
        for module in candidate_public_namespaces {
            if certified.insert(module) {
                if !compiled_resettable.contains(&module) {
                    return Err(test_input_error(
                        path.clone(),
                        "Runtime public namespace has no actual reset owner",
                    ));
                }
                namespace_certificates.push(namespace_certificate(module).await?);
            }
        }
    } else {
        for (module, parts) in ordinary_namespace_roots {
            if let Some(certificate) = optional_namespace_certificate(module).await? {
                if !parts.contains(&module) || parts.iter().any(|part| !authorized.contains(part)) {
                    return Err(test_input_error(
                        path.clone(),
                        "Runtime leaf namespace requires its exact authorized reset owners",
                    ));
                }
                for part in parts {
                    if !compiled_resettable.contains(&part) {
                        compiled_resettable.push(part);
                    }
                }
                namespace_certificates.push(certificate);
            }
        }
    }
    // A facade starts its actual locals part before its own re-export demands.
    // Settle only native prerequisites that genuinely precede those demands;
    // awaiting the whole locals part would incorrectly reorder/cycle its body.
    let direct_native_imports = native_imports.clone();
    let prerequisite_owners = demand_edges
        .iter()
        .map(|edge| edge.owner)
        .collect::<HashSet<_>>();
    for owner in prerequisite_owners {
        if ResolvedVc::try_downcast_type::<turbopack_ecmascript::side_effect_optimization::facade::module::EcmascriptModuleFacadeModule>(owner).is_none() { continue; }
        for reference in owner.references().await?.iter() {
            if ResolvedVc::try_downcast_type::<turbopack_ecmascript::EcmascriptModulePartReference>(
                *reference,
            )
            .is_none()
            {
                continue;
            }
            let resolved = reference.resolve_reference().await?;
            let parts = resolved.primary_modules().await?;
            if parts.len() != 1
                || ResolvedVc::try_downcast_type::<EcmascriptModuleLocalsModule>(parts[0]).is_none()
                || graph_source_owner(owner).await? != graph_source_owner(parts[0]).await?
            {
                continue;
            }
            for native in &direct_native_imports {
                if native.owner != parts[0]
                    || !demand_edges
                        .iter()
                        .any(|edge| edge.owner == owner && native.source_order < edge.source_order)
                {
                    continue;
                }
                let actual_reference = parts[0].references().await?;
                if !actual_reference.contains(&native.reference) {
                    return Err(test_input_error(
                        path.clone(),
                        "Native prerequisite lost its actual locals reference",
                    ));
                }
                let native_result = native.reference.resolve_reference().await?;
                if native_result.primary_modules().await?.as_slice() != [native.target]
                    || !graph_native_boundary(native.target, native_certificates).await?
                {
                    return Err(test_input_error(
                        path.clone(),
                        "Native prerequisite lost its exact certified provider",
                    ));
                }
                if !native_imports
                    .iter()
                    .any(|known| known.owner == owner && known.reference == native.reference)
                {
                    native_imports.push(RuntimeImportNativeEdge {
                        owner,
                        target: native.target,
                        reference: native.reference,
                        source_order: native.source_order,
                        via_part: Some(
                            RuntimeImportNativePart {
                                reference: *reference,
                                module: parts[0],
                            }
                            .resolved_cell(),
                        ),
                    });
                }
            }
        }
    }
    let mut native_protected = Vec::new();
    for edge in &native_imports {
        let certificate = native_certificates
            .iter()
            .find(|known| known.module == edge.target && known.builtin.is_some())
            .expect("certified graph native target");
        if !native_protected
            .iter()
            .any(|known: &NativeExternalCertificate| known.module == edge.target)
        {
            native_protected.push(certificate.clone());
        }
    }
    let has_runtime_graph =
        needs_demands || !namespace_certificates.is_empty() || !native_imports.is_empty();
    let demand_graph = if has_runtime_graph {
        Some(
            RuntimeImportDemandGraph {
                edges: demand_edges
                    .iter()
                    .cloned()
                    .map(|edge| edge.resolved_cell())
                    .collect(),
                native_imports: native_imports
                    .into_iter()
                    .map(|edge| edge.resolved_cell())
                    .collect(),
                namespaces: namespace_certificates.clone(),
            }
            .resolved_cell(),
        )
    } else {
        None
    };
    let mut static_edges = Vec::new();
    for (owner, target) in candidate_static_edges {
        if owner != target
            && targets
                .iter()
                .any(|known| known.native_original.is_none() && known.parts.contains(&target))
            && !static_edges.contains(&(owner, target))
        {
            static_edges.push((owner, target));
        }
    }
    let mut manifest_demands = Vec::new();
    for edge in &demand_edges {
        if !manifest_demands
            .iter()
            .any(|known: &&RuntimeImportDemandEdge| {
                known.owner == edge.owner && known.target == edge.target && known.site == edge.site
            })
        {
            manifest_demands.push(edge);
        }
    }
    let mut assets = fxindexmap! {};
    let mut code = String::new();
    let mut emit_id = |name: String, module: ResolvedVc<Box<dyn Module>>| {
        let request = format!("INNER_DYNAMIC_MOCK_{}", assets.len());
        assets.insert(RcStr::from(request.clone()), module);
        code.push_str(&format!(
            "import {{ __turbopack_module_id__ as {name} }} from '{request}' with {{ \
             \"turbopack-chunking-type\": \"none\" }};\n"
        ));
    };
    for (index, module) in owners.iter().enumerate() {
        emit_id(format!("owner_{index}"), *module);
    }
    for (index, target) in targets.iter().enumerate() {
        emit_id(format!("target_{index}"), target.module);
        for (part_index, module) in target.parts.iter().enumerate() {
            emit_id(format!("part_{index}_{part_index}"), *module);
        }
        if let Some(pair) = &target.static_mock {
            emit_id(format!("initial_{index}"), pair.initial);
        }
    }
    for (index, (owner, target)) in static_edges.iter().enumerate() {
        emit_id(format!("static_owner_{index}"), *owner);
        emit_id(format!("static_target_{index}"), *target);
    }
    for (index, edge) in manifest_demands.iter().enumerate() {
        emit_id(format!("demand_owner_{index}"), edge.owner);
        emit_id(format!("demand_target_{index}"), edge.target);
    }
    drop(emit_id);
    // These exact internal edges retain even optimized evaluation-only targets.
    // require.resolve registers their Parallel chunks without evaluating them.
    let mut retained = Vec::new();
    for edge in &demand_edges {
        for module in [edge.owner, edge.target] {
            if !retained.contains(&module) {
                retained.push(module);
            }
        }
    }
    for namespace in &namespace_certificates {
        let module = namespace.await?.module;
        if !retained.contains(&module) {
            retained.push(module);
        }
    }
    for (index, module) in retained.into_iter().enumerate() {
        let request = format!("INNER_DYNAMIC_DEMAND_RETAIN_{index}");
        assets.insert(RcStr::from(request.clone()), module);
        code.push_str(&format!("require.resolve('{request}');\n"));
    }
    let mut manifest_source = manifest_value_source_with_static(
        owners.len(),
        &targets
            .iter()
            .map(|target| {
                (
                    target.parts.len(),
                    target.requests.as_slice(),
                    target.native_original,
                )
            })
            .collect::<Vec<_>>(),
        &targets
            .iter()
            .map(|target| target.static_mock.is_some())
            .collect::<Vec<_>>(),
    )?;
    append_static_imports(&mut manifest_source, static_edges.len());
    append_static_demands(
        &mut manifest_source,
        &manifest_demands
            .iter()
            .map(|edge| edge.site)
            .collect::<Vec<_>>(),
    );
    code.push_str(&manifest_source);
    let source = test_source(
        path.clone(),
        Some(rcstr!("next-test-dynamic-mock-manifest")),
        code,
    )
    .await?;
    let module = context
        .process(*source, ReferenceType::Internal(ResolvedVc::cell(assets)))
        .module()
        .to_resolved()
        .await?;
    Ok(DynamicMockManifest {
        module,
        native_resettable,
        native_protected,
        compiled_resettable,
        demand_graph,
    })
}

#[cfg(test)]
mod tests {
    use crate::{
        testing_dynamic_mock::{
            append_static_demands, append_static_imports, graph_input_error, manifest_value_source,
            manifest_value_source_with_static, optional_graph_candidate, required_graph_error,
        },
        testing_external_modules::NativeOriginalKind,
        testing_mock_source::extract_test_mocks,
    };

    #[test]
    fn optional_graph_inspection_propagates_actual_operational_errors() {
        let error = anyhow::Error::new(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "actual graph loader failure",
        ));
        let original = error.downcast_ref::<std::io::Error>().unwrap() as *const std::io::Error;
        let Err(returned) = optional_graph_candidate(Err(error)) else {
            panic!("operational failures must propagate");
        };
        assert!(std::ptr::eq(
            original,
            returned.downcast_ref::<std::io::Error>().unwrap(),
        ));
        assert_eq!(returned.to_string(), "actual graph loader failure");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn only_required_graph_refusals_emit_existing_input_issues() -> anyhow::Result<()> {
        use turbo_rcstr::{RcStr, rcstr};
        use turbo_tasks::{CollectiblesSource, TurboTasks, Vc};
        use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
        use turbo_tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath};
        use turbopack_core::issue::Issue;

        #[turbo_tasks::function(operation, root)]
        async fn refusal(path: FileSystemPath, required: bool) -> anyhow::Result<Vc<()>> {
            let error = graph_input_error(path, "retained graph diagnostic");
            if required {
                let error = required_graph_error(error);
                assert_eq!(error.to_string(), "retained graph diagnostic");
            } else {
                assert!(optional_graph_candidate(Err(error))?.is_none());
            }
            Ok(Vc::cell(()))
        }

        #[turbo_tasks::function(operation, root)]
        async fn operation(disk_root: RcStr) -> anyhow::Result<()> {
            let path = DiskFileSystem::new(rcstr!("optional-graph-refusal"), Vc::cell(disk_root))
                .root()
                .owned()
                .await?
                .join("target.mjs")?;
            let optional = refusal(path.clone(), false);
            optional.read_strongly_consistent().await?;
            assert!(optional.peek_collectibles::<Box<dyn Issue>>().is_empty());
            let required = refusal(path.clone(), true);
            required.read_strongly_consistent().await?;
            let issues = required.peek_collectibles::<Box<dyn Issue>>();
            assert_eq!(issues.len(), 1);
            let issue = issues.into_iter().next().unwrap();
            let issue = issue.into_trait_ref().await?;
            assert_eq!(issue.file_path().await?, path);
            assert_eq!(
                issue.title().await?.to_unstyled_string(),
                "retained graph diagnostic"
            );
            Ok(())
        }

        let directory = tempfile::tempdir()?;
        let disk_root: RcStr = directory.path().canonicalize()?.to_str().unwrap().into();
        let tasks = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tasks
            .run_once(async move { operation(disk_root).read_strongly_consistent().await })
            .await?;
        Ok(())
    }

    #[test]
    fn appends_only_nonempty_actual_static_edge_bindings() {
        let requests = vec!["./subject".to_owned()];
        let original = manifest_value_source(1, &[(1, requests.as_slice(), None)]).unwrap();
        let mut source = original.clone();
        append_static_imports(&mut source, 0);
        assert_eq!(source, original);
        append_static_imports(&mut source, 2);
        assert_eq!(
            source,
            original.trim_end_matches("};\n").to_owned()
                + ",staticImports:[{owner:static_owner_0,target:static_target_0},{owner:\
                   static_owner_1,target:static_target_1}]};\n"
        );
        assert!(
            extract_test_mocks(&source, "graph-manifest.mjs")
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn preserves_absent_demand_bytes_and_emits_ordered_actual_site_bindings() {
        let requests = vec!["./subject".to_owned()];
        let original = manifest_value_source(1, &[(1, requests.as_slice(), None)]).unwrap();
        let mut source = original.clone();
        append_static_demands(&mut source, &[]);
        assert_eq!(source, original);
        append_static_demands(&mut source, &[0, 7]);
        assert_eq!(
            source,
            original.trim_end_matches("};\n").to_owned()
                + ",staticDemands:[{owner:demand_owner_0,target:demand_target_0,site:0},{owner:\
                   demand_owner_1,target:demand_target_1,site:7}]};\n"
        );
        assert!(
            extract_test_mocks(&source, "demand-manifest.mjs")
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn pairs_only_actual_native_id_bindings_in_the_optional_manifest() {
        let requests = vec!["package".to_owned()];
        let source = manifest_value_source_with_static(
            1,
            &[(1, requests.as_slice(), Some(NativeOriginalKind::CommonJs))],
            &[true],
        )
        .unwrap();
        assert_eq!(
            source,
            "export const \
             manifest={version:1,owners:[owner_0],targets:[{id:target_0,aliases:[part_0_0],\
             requests:[\"package\"],nativeOriginal:\"commonjs\",staticMock:{initial:initial_0,\
             provider:target_0}}]};\n"
        );
        assert!(
            extract_test_mocks(&source, "static-native-manifest.mjs")
                .unwrap()
                .is_empty()
        );
        assert!(
            manifest_value_source_with_static(1, &[(0, requests.as_slice(), None)], &[true])
                .is_err()
        );
        assert!(
            manifest_value_source_with_static(
                1,
                &[(0, requests.as_slice(), Some(NativeOriginalKind::Esm))],
                &[true, true]
            )
            .is_err()
        );
    }

    #[test]
    fn retains_compiled_manifest_bytes_and_parser_round_trip() {
        let requests = vec!["./subject".to_owned()];
        let source = manifest_value_source(1, &[(1, requests.as_slice(), None)]).unwrap();
        assert_eq!(
            source,
            "export const \
             manifest={version:1,owners:[owner_0],targets:[{id:target_0,aliases:[part_0_0],\
             requests:[\"./subject\"]}]};\n"
        );
        assert!(
            extract_test_mocks(&source, "manifest.mjs")
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn emits_only_the_certified_native_kind_and_actual_id_bindings() {
        let cjs = vec!["package".to_owned()];
        let esm = vec!["package/esm".to_owned()];
        let source = manifest_value_source(
            2,
            &[
                (2, cjs.as_slice(), Some(NativeOriginalKind::CommonJs)),
                (1, esm.as_slice(), Some(NativeOriginalKind::Esm)),
            ],
        )
        .unwrap();
        assert_eq!(
            source,
            "export const \
             manifest={version:1,owners:[owner_0,owner_1],targets:[{id:target_0,aliases:[part_0_0,\
             part_0_1],requests:[\"package\"],nativeOriginal:\"commonjs\"},{id:target_1,aliases:\
             [part_1_0],requests:[\"package/esm\"],nativeOriginal:\"esm\"}]};\n"
        );
        assert!(
            extract_test_mocks(&source, "native-manifest.mjs")
                .unwrap()
                .is_empty()
        );
    }
}
