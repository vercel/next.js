//! Explicit client test roots reuse real Next client resolution and chunking.
//! Ordinary browser application builds and Node application drivers are unchanged.

use std::collections::HashSet;

use anyhow::{Context, Result, bail};
use next_core::{
    app_structure::FileSystemPathVec,
    get_next_package,
    next_client::{
        ClientContextType, get_client_module_options_context, get_client_resolve_options_context,
    },
    util::load_next_js_template_no_imports,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{Completion, ResolvedVc, ValueToString, Vc, fxindexmap};
use turbo_tasks_fs::{
    File, FileContent, FileSystemPath,
    glob::{Glob, GlobOptions},
};
use turbopack::{ModuleAssetContext, transition::TransitionOptions};
use turbopack_core::{
    asset::AssetContent,
    chunk::{ChunkGroupResult, ChunkingContext, availability_info::AvailabilityInfo},
    compile_time_info::{CompileTimeInfo, DefinableNameSegment, FreeVarReferences},
    context::AssetContext,
    file_source::FileSource,
    ident::{AssetIdent, Layer},
    module::Module,
    module_graph::{
        GraphEntries,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry, EntryHeuristics},
    },
    output::{OutputAsset, OutputAssets},
    reference::ModuleReference,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        ModuleResolveResultItem, ResolveResult,
        options::{ImportMap, ImportMapping, ResolvedMap},
    },
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::references::external_module::CachedExternalModule;
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

use crate::{
    paths::{all_asset_paths, all_paths_in_root},
    project::Project,
    route::{Endpoint, EndpointOutput, EndpointOutputPaths, ModuleGraphs},
};

fn is_bare_node_global(segments: &[DefinableNameSegment]) -> bool {
    matches!(segments, [DefinableNameSegment::Name(name)] if matches!(name.as_str(), "process" | "Buffer"))
        || matches!(segments, [DefinableNameSegment::Name(name), DefinableNameSegment::TypeOf] if matches!(name.as_str(), "process" | "Buffer"))
}

/// Resolved-path platform seams apply only to this explicit test context. The
/// same collector/lifecycle/assertions run in the client, without Node imports.
#[turbo_tasks::function]
async fn resolve_context(
    base: Vc<ResolveOptionsContext>,
    project_path: FileSystemPath,
) -> Result<Vc<ResolveOptionsContext>> {
    let next = get_next_package(project_path.clone()).await?;
    let mut imports = ImportMap::empty();
    for (request, target) in [
        ("vitest", "dist/experimental/testing/client/vitest.js"),
        (
            "next/experimental/testing/browser",
            "dist/experimental/testing/client/unsupported-driver.js",
        ),
    ] {
        let target = next.join(target)?;
        if matches!(&*target.read().await?, FileContent::NotFound) {
            bail!("Next Browser Mode facade is missing: {}", target.path);
        }
        imports.insert_exact_alias(
            request,
            ImportMapping::Direct(
                ResolveResult::source(ResolvedVc::upcast(
                    FileSource::new(target).to_resolved().await?,
                ))
                .resolved_cell(),
            )
            .resolved_cell(),
        );
    }
    let context = crate::testing::test_resolve_options_context(base, project_path.clone(), false);
    let mut extended = context
        .with_extended_import_map(imports.cell())
        .owned()
        .await?;
    let mut mappings = match extended.resolved_map {
        Some(map) => map.await?.by_glob.clone(),
        None => vec![],
    };
    for (original, replacement) in [
        (
            "experimental/testing/assertions/assertion-platform.js",
            "experimental/testing/client/assertion-platform.js",
        ),
        (
            "experimental/testing/runner/async-context.js",
            "experimental/testing/client/async-context.js",
        ),
        (
            "experimental/testing/runner/collector-platform.js",
            "experimental/testing/client/collector-platform.js",
        ),
        (
            "experimental/testing/runner/invocation-platform.js",
            "experimental/testing/client/invocation-platform.js",
        ),
        (
            "experimental/testing/runner/task-path.js",
            "experimental/testing/client/task-path.js",
        ),
        (
            "experimental/testing/runner/annotations.js",
            "experimental/testing/client/annotations.js",
        ),
        (
            "experimental/testing/assertions/fake-timers.js",
            "experimental/testing/client/fake-timers.js",
        ),
        (
            "experimental/testing/assertions/snapshot-environment.js",
            "experimental/testing/client/snapshot-environment.js",
        ),
        (
            "compiled/next-test-primitives/index.js",
            "compiled/next-test-primitives/browser/index.js",
        ),
    ] {
        let replacement = next.join(&format!("dist/{replacement}"))?;
        if matches!(&*replacement.read().await?, FileContent::NotFound) {
            bail!(
                "Next Browser Mode platform module is missing: {}",
                replacement.path
            );
        }
        mappings.insert(
            0,
            (
                None,
                Glob::new(
                    format!("**/next/dist/{original}").into(),
                    GlobOptions::default(),
                )
                .to_resolved()
                .await?,
                ImportMapping::Direct(
                    ResolveResult::source(ResolvedVc::upcast(
                        FileSource::new(replacement).to_resolved().await?,
                    ))
                    .resolved_cell(),
                )
                .resolved_cell(),
            ),
        );
    }
    extended.resolved_map = Some(ResolvedMap { by_glob: mappings }.resolved_cell());
    for (_, nested) in &mut extended.rules {
        *nested = resolve_context(**nested, project_path.clone())
            .to_resolved()
            .await?;
    }
    Ok(extended.cell())
}

// Browser chunks cannot execute external modules. Inspect the genuine resolved
// references before chunking so an unsupported import identifies its real issuer.
async fn validate_client_graph(entry: ResolvedVc<Box<dyn Module>>) -> Result<()> {
    let mut queue = vec![entry];
    let mut visited = HashSet::new();
    while let Some(module) = queue.pop() {
        if !visited.insert(module) {
            continue;
        }
        for reference in module.references().await?.iter() {
            let resolved = reference.resolve_reference().await?;
            for (_, item) in resolved.primary.iter() {
                if let ModuleResolveResultItem::External { name, .. } = item {
                    let issuer = module.ident().to_string().await?;
                    bail!(
                        "Browser Mode native graph contains unsupported external module {} \
                         imported by {}",
                        name,
                        issuer
                    );
                }
            }
            for dependency in resolved.primary_modules_raw_iter() {
                if let Some(external) =
                    ResolvedVc::try_downcast_type::<CachedExternalModule>(dependency)
                {
                    let external = external.await?;
                    let issuer = module.ident().to_string().await?;
                    bail!(
                        "Browser Mode native graph contains unsupported external module {} \
                         imported by {}",
                        external.request(),
                        issuer
                    );
                }
                queue.push(dependency);
            }
        }
    }
    Ok(())
}

#[turbo_tasks::function]
pub(crate) async fn context(project: ResolvedVc<Project>) -> Result<Vc<ModuleAssetContext>> {
    if !project.next_mode().await?.is_development() {
        bail!("Browser Mode currently requires one-shot development client entries");
    }
    let base = project.client_compile_time_info().await?;
    let mut free_vars = base.free_var_references.owned().await?;
    // A client test runs in the actual browser global realm. Keep precise env
    // substitutions, but do not synthesize Node globals for guarded libraries.
    free_vars.retain(|name, _| !is_bare_node_global(name));
    let info = CompileTimeInfo {
        environment: base.environment,
        defines: base.defines,
        free_var_references: FreeVarReferences(free_vars).resolved_cell(),
        hot_module_replacement_enabled: false,
        import_meta_env_base_url: base.import_meta_env_base_url.clone(),
    }
    .cell();
    Ok(ModuleAssetContext::new(
        TransitionOptions::default().cell(),
        info,
        crate::testing::test_module_options_context(get_client_module_options_context(
            project.project_path().owned().await?,
            project.execution_context(),
            info.environment(),
            ClientContextType::Other,
            project.next_mode(),
            project.next_config(),
            project.encryption_key(),
        )),
        resolve_context(
            get_client_resolve_options_context(
                project.project_path().owned().await?,
                ClientContextType::Other,
                project.next_mode(),
                project.next_config(),
                project.execution_context(),
            ),
            project.project_path().owned().await?,
        ),
        Layer::new_with_user_friendly_name(rcstr!("next-test-client"), rcstr!("Browser Test")),
    ))
}

#[turbo_tasks::value]
pub(crate) struct ClientTestEndpoint {
    pub project: ResolvedVc<Project>,
    pub path: FileSystemPath,
    pub id: RcStr,
}

#[turbo_tasks::value_impl]
impl ClientTestEndpoint {
    #[turbo_tasks::function]
    pub fn new(project: ResolvedVc<Project>, path: FileSystemPath, id: RcStr) -> Vc<Self> {
        Self { project, path, id }.cell()
    }

    #[turbo_tasks::function]
    async fn entry_module(self: Vc<Self>) -> Result<Vc<Box<dyn Module>>> {
        let this = self.await?;
        let context = this.project.client_test_context();
        let module = context
            .process(
                Vc::upcast(FileSource::new(this.path.clone())),
                ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
            )
            .module()
            .to_resolved()
            .await?;
        let source = load_next_js_template_no_imports(
            "client-test.js",
            this.project.project_path().owned().await?,
            &[("VAR_TEST_MODULE", "INNER_TEST_MODULE")],
            &[],
            &[],
        )
        .await?;
        let source = crate::testing::test_entry_source(source).await?;
        Ok(context
            .process(
                source,
                ReferenceType::Internal(ResolvedVc::cell(fxindexmap! {
                    rcstr!("INNER_TEST_MODULE") => module,
                })),
            )
            .module())
    }

    #[turbo_tasks::function]
    async fn chunk_group(self: Vc<Self>) -> Result<Vc<ChunkGroupResult>> {
        let this = self.await?;
        let module = self.entry_module().to_resolved().await?;
        validate_client_graph(module).await?;
        Ok(this
            .project
            .client_chunking_context()
            .evaluated_chunk_group(
                AssetIdent::from_path(this.path.clone()).into_vc(),
                ChunkGroup::Entry(vec![module]),
                this.project.module_graph(*module),
                OutputAssets::empty(),
                AvailabilityInfo::root(),
            ))
    }

    #[turbo_tasks::function]
    async fn output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let group = self.chunk_group().await?;
        let client_root = this.project.client_relative_path().owned().await?;
        let mut scripts = Vec::new();
        let mut styles = Vec::new();
        for asset in group.assets.await?.iter() {
            let path = asset.path().await?;
            let relative = client_root
                .get_path_to(&path)
                .context("Browser test bootstrap asset escaped client output root")?;
            if relative.ends_with(".js") {
                scripts.push(relative.to_string());
            } else if relative.ends_with(".css") {
                styles.push(relative.to_string());
            } else {
                bail!("Unsupported Browser Mode bootstrap asset: {relative}");
            }
        }
        if scripts.is_empty() {
            bail!("Browser test compiler emitted no evaluated client entry");
        }
        let metadata =
            serde_json::json!({"version":1,"scripts":scripts,"styles":styles}).to_string();
        let mut assets = group.assets.owned().await?;
        assets.extend(group.referenced_assets.await?.iter().copied());
        assets.push(ResolvedVc::upcast(
            VirtualOutputAsset::new(
                this.project
                    .node_root()
                    .await?
                    .join(&format!("server/next-test/{}.client.json", this.id))?,
                AssetContent::file(FileContent::Content(File::from(metadata)).cell()),
            )
            .to_resolved()
            .await?,
        ));
        assets.push(ResolvedVc::upcast(
            crate::testing_in_source::source_hash_asset(
                this.path.clone(),
                this.project
                    .node_root()
                    .await?
                    .join(&format!("server/next-test/{}.source.json", this.id))?,
            )
            .await?,
        ));
        Ok(Vc::cell(assets))
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for ClientTestEndpoint {
    #[turbo_tasks::function]
    async fn output(self: ResolvedVc<Self>) -> Result<Vc<EndpointOutput>> {
        let this = self.await?;
        let assets = self.output_assets();
        Ok(EndpointOutput {
            output_assets: assets.to_resolved().await?,
            output_paths: EndpointOutputPaths::NodeJs {
                // Existing snapshot transport carries a descriptor, never Node-executed code.
                server_entry_path: format!("server/next-test/{}.client.json", this.id).into(),
                server_hmr_entry_paths: vec![],
                server_paths: all_asset_paths(
                    assets,
                    this.project.node_root().owned().await?,
                    None,
                )
                .owned()
                .await?,
                client_paths: all_paths_in_root(
                    assets,
                    this.project.client_relative_path().owned().await?,
                )
                .owned()
                .await?,
            }
            .resolved_cell(),
            project: this.project,
        }
        .cell())
    }
    #[turbo_tasks::function]
    async fn server_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        Ok(self.await?.project.server_changed(self.output_assets()))
    }
    #[turbo_tasks::function]
    fn client_changed(self: Vc<Self>) -> Vc<Completion> {
        Completion::immutable()
    }
    #[turbo_tasks::function]
    async fn entries(self: Vc<Self>) -> Result<Vc<GraphEntries>> {
        Ok(
            GraphEntries::from_chunk_groups(vec![ChunkGroupEntry::Entry {
                modules: vec![self.entry_module().to_resolved().await?],
                heuristics: EntryHeuristics::high_priority(),
            }])
            .cell(),
        )
    }
    #[turbo_tasks::function]
    async fn module_graphs(self: Vc<Self>) -> Result<Vc<ModuleGraphs>> {
        Ok(Vc::cell(vec![
            self.await?
                .project
                .module_graph(self.entry_module())
                .to_resolved()
                .await?,
        ]))
    }
    #[turbo_tasks::function]
    fn project(&self) -> Vc<Project> {
        *self.project
    }
    #[turbo_tasks::function]
    fn traced_files(self: Vc<Self>) -> Vc<FileSystemPathVec> {
        Vc::cell(vec![])
    }
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;
    use turbopack_core::compile_time_info::DefinableNameSegment::{Name, TypeOf};

    use super::is_bare_node_global;

    #[test]
    fn releases_only_bare_node_global_bindings() {
        assert!(is_bare_node_global(&[Name(rcstr!("process"))]));
        assert!(is_bare_node_global(&[Name(rcstr!("process")), TypeOf]));
        assert!(!is_bare_node_global(&[
            Name(rcstr!("process")),
            Name(rcstr!("env")),
            Name(rcstr!("NODE_ENV"))
        ]));
        assert!(is_bare_node_global(&[Name(rcstr!("Buffer"))]));
        assert!(is_bare_node_global(&[Name(rcstr!("Buffer")), TypeOf]));
        assert!(!is_bare_node_global(&[
            Name(rcstr!("Buffer")),
            Name(rcstr!("from"))
        ]));
        assert!(!is_bare_node_global(&[Name(rcstr!("window"))]));
    }
}
