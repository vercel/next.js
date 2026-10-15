//! Selection evidence comes from actual module references and resolver sources.
//! This never evaluates a user module or guesses imports from its text.
use std::collections::{BTreeMap, HashSet};

use anyhow::Result;
use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::{
    asset::{Asset, AssetContent, no_hash_salt},
    context::AssetContext,
    file_source::FileSource,
    module::Module,
    reference::ModuleReference,
    reference_type::EcmaScriptModulesReferenceSubType,
    resolve::{
        ModuleResolveResultItem, ResolveErrorMode, options::ResolveOptions, origin::ResolveOrigin,
        parse::Request,
    },
    source::Source,
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::{
    EcmascriptModuleAsset, module_fragments::part::module::EcmascriptModulePartAsset,
    references::external_module::CachedExternalModule,
    side_effect_optimization::locals::module::EcmascriptModuleLocalsModule,
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::project::Project;

// Preserve the real compiler origin and its final resolution options. The
// provenance flag retains resolver inputs (including traversed symlinks)
// that normal execution does not need to publish on the module result.
#[turbo_tasks::value]
struct DependencyResolveOrigin {
    origin_path: FileSystemPath,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    options: ResolvedVc<ResolveOptions>,
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for DependencyResolveOrigin {
    fn origin_path(&self) -> FileSystemPath {
        self.origin_path.clone()
    }

    fn asset_context(&self) -> ResolvedVc<Box<dyn AssetContext>> {
        self.asset_context
    }

    fn resolve_options(&self) -> Vc<ResolveOptions> {
        *self.options
    }
}

pub(crate) async fn dependency_origin(
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
) -> Result<ResolvedVc<Box<dyn ResolveOrigin>>> {
    let origin = (*origin).into_trait_ref().await?;
    let mut options = origin.resolve_options().owned().await?;
    options.collect_affecting_sources = true;
    Ok(ResolvedVc::upcast(
        DependencyResolveOrigin {
            origin_path: origin.origin_path(),
            asset_context: origin.asset_context(),
            options: options.resolved_cell(),
        }
        .resolved_cell(),
    ))
}

#[derive(Serialize)]
struct SourceIdentity {
    file: String,
    sha256: String,
}

async fn observe(
    path: &FileSystemPath,
    root: &FileSystemPath,
    sources: &mut BTreeMap<String, String>,
) -> Result<bool> {
    if !path.realpath_with_links().await?.symlinks.is_empty() {
        // A lexical link is resolver evidence, not another unique file owner.
        // Keep this graph conservative; the resolved module is observed apart.
        return Ok(false);
    }
    let Some(relative) = root.get_relative_path_to(path) else {
        return Ok(false);
    };
    let Some(hash) = FileSource::new(path.clone())
        .content()
        .content_hash(no_hash_salt(), HashAlgorithm::Sha256Base64)
        .owned()
        .await?
    else {
        return Ok(false);
    };
    let digest = data_encoding::HEXLOWER.encode(&data_encoding::BASE64.decode(hash.as_bytes())?);
    sources.insert(relative.to_string(), digest);
    Ok(true)
}

pub(crate) async fn dependency_asset(
    project: ResolvedVc<Project>,
    module: ResolvedVc<Box<dyn Module>>,
    entry: FileSystemPath,
    output: FileSystemPath,
) -> Result<ResolvedVc<VirtualOutputAsset>> {
    let root = project.project_path().owned().await?;
    let next_package = next_core::get_next_package(root.clone()).await?;
    let entry_module = module;
    let mut queue = vec![module];
    let mut visited = HashSet::new();
    let mut sources = BTreeMap::new();
    let mut observed_origins = HashSet::new();
    let mut ecmascript_paths = HashSet::new();
    let mut complete = true;
    while let Some(module) = queue.pop() {
        if !visited.insert(module) {
            continue;
        }
        let ident = module.ident().await?;
        let framework = next_package.get_path_to(&ident.path).is_some();
        // The root is Next's generated entry wrapper: traverse its actual
        // internal user-module edges without treating its template as user input.
        if framework && module != entry_module {
            continue;
        }
        if let Some(external) = ResolvedVc::try_downcast_type::<CachedExternalModule>(module) {
            let request = external.await?;
            let request = request.request();
            // A bare external request does not prove node_modules ownership:
            // workspace packages can resolve to local files under pinned Vitest.
            // Only explicit Node builtin requests have a certified boundary.
            if !request.starts_with("node:") {
                complete = false;
            }
            continue;
        }
        if !framework {
            complete &= observe(&ident.path, &root, &mut sources).await?;
        }
        if !framework {
            let path = ident.path.clone();
            if [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]
                .iter()
                .any(|suffix| path.file_name().ends_with(suffix))
            {
                ecmascript_paths.insert(path.clone());
            }
            if let Some(part) = ResolvedVc::try_downcast_type::<EcmascriptModulePartAsset>(module) {
                queue.push(ResolvedVc::upcast(part.await?.full_module));
            }
            // A facade's locals reference retains the exact original compiler
            // asset. Recover that asset's resolver context before inspecting
            // literal requests, including reexports pruned from emitted locals.
            if let Some(locals) =
                ResolvedVc::try_downcast_type::<EcmascriptModuleLocalsModule>(module)
            {
                queue.push(ResolvedVc::upcast(locals.await?.module));
            }
            if ResolvedVc::try_downcast_type::<EcmascriptModuleAsset>(module).is_some() {
                if let Some(origin) = ResolvedVc::try_sidecast::<Box<dyn ResolveOrigin>>(module) {
                    observed_origins.insert(path.clone());
                    let origin = dependency_origin(origin).await?;
                    {
                        let source = next_core::util::file_content_rope(path.read())
                            .await?
                            .to_str()?
                            .into_owned();
                        let syntax = crate::testing_dependency_source::literal_dependencies(
                            &source,
                            path.file_name(),
                        );
                        complete &= syntax.complete;
                        for (request, dynamic) in syntax.requests {
                            let resolved = esm_resolve(
                                *origin,
                                Request::parse(RcStr::from(request).into()),
                                if dynamic {
                                    EcmaScriptModulesReferenceSubType::DynamicImport
                                } else {
                                    EcmaScriptModulesReferenceSubType::Import
                                },
                                ResolveErrorMode::Ignore,
                                None,
                            )
                            .await?;
                            let resolved = resolved.await?;
                            complete &=
                                !resolved.is_unresolvable() && resolved.errors().next().is_none();
                            // Direct external results are not module nodes and
                            // must not disappear through primary_modules().
                            complete &= resolved.primary.iter().all(|(_, item)| {
                                !matches!(item, ModuleResolveResultItem::External { name, .. }
                                    if !name.starts_with("node:"))
                            });
                            queue.extend(resolved.primary_modules().await?);
                            for source in resolved.affecting_sources_iter() {
                                let path = source.ident().await?.path.clone();
                                if next_package.get_path_to(&path).is_none() {
                                    complete &= observe(&path, &root, &mut sources).await?;
                                }
                            }
                        }
                    }
                }
            }
        }
        for reference in module.references().await?.iter() {
            let resolved = reference.resolve_reference().await?;
            // CachedExternalModule is only one external representation. A
            // direct bare external has no certified node_modules ownership.
            complete &= resolved.primary.iter().all(|(_, item)| {
                !matches!(item, ModuleResolveResultItem::External { name, .. }
                    if !name.starts_with("node:"))
            });
            queue.extend(resolved.primary_modules_raw_iter());
            // Resolution and loader dependencies can affect a module without
            // being imported or emitted as a module themselves.
            for source in resolved.affecting_sources_iter() {
                let path = source.ident().await?.path.clone();
                if next_package.get_path_to(&path).is_none() {
                    complete &= observe(&path, &root, &mut sources).await?;
                }
            }
        }
    }
    complete &= ecmascript_paths.is_subset(&observed_origins);
    complete &= observe(&entry, &root, &mut sources).await?;
    let entry_file = root
        .get_relative_path_to(&entry)
        .expect("validated test entry");
    let entry_hash = sources
        .get(entry_file.as_str())
        .cloned()
        .unwrap_or_default();
    let files = sources
        .into_iter()
        .map(|(file, sha256)| SourceIdentity { file, sha256 })
        .collect::<Vec<_>>();
    let metadata = serde_json::json!({
        "version": 1,
        "kind": "native-module-sources",
        "complete": complete,
        "entry": { "file": entry_file, "sha256": entry_hash },
        "files": files,
    });
    Ok(VirtualOutputAsset::new(
        output,
        AssetContent::file(
            FileContent::Content(File::from(serde_json::to_string(&metadata)?)).cell(),
        ),
    )
    .to_resolved()
    .await?)
}
