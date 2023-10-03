use anyhow::{bail, Context, Result};
use next_core::{
    middleware::get_middleware_module,
    mode::NextMode,
    next_edge::entry::wrap_edge_entry,
    next_manifests::{EdgeFunctionDefinition, MiddlewareMatcher, MiddlewaresManifestV2},
    next_server::{get_server_runtime_entries, ServerContextType},
    util::parse_config_from_source,
};
use turbo_tasks::{Completion, TryJoinIterExt, Value, Vc};
use turbopack_binding::{
    turbo::tasks_fs::{File, FileContent},
    turbopack::{
        core::{
            asset::AssetContent,
            chunk::{ChunkableModule, ChunkingContext},
            context::AssetContext,
            module::Module,
            output::{OutputAsset, OutputAssets},
            virtual_output::VirtualOutputAsset,
        },
        ecmascript::chunk::EcmascriptChunkPlaceable,
    },
};

use crate::{
    project::Project,
    route::{Endpoint, WrittenEndpoint},
    server_paths::all_server_paths,
};

#[turbo_tasks::value]
pub struct MiddlewareEndpoint {
    project: Vc<Project>,
    context: Vc<Box<dyn AssetContext>>,
    userland_module: Vc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl MiddlewareEndpoint {
    #[turbo_tasks::function]
    pub fn new(
        project: Vc<Project>,
        context: Vc<Box<dyn AssetContext>>,
        userland_module: Vc<Box<dyn Module>>,
    ) -> Vc<Self> {
        Self {
            project,
            context,
            userland_module,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn edge_files(&self) -> Result<Vc<OutputAssets>> {
        let module = get_middleware_module(
            self.context,
            self.project.project_path(),
            self.userland_module,
        );

        let module = wrap_edge_entry(
            self.context,
            self.project.project_path(),
            module,
            "middleware".to_string(),
        );

        let mut evaluatable_assets = get_server_runtime_entries(
            self.project.project_path(),
            self.project.env(),
            Value::new(ServerContextType::Middleware),
            NextMode::Development,
            self.project.next_config(),
        )
        .resolve_entries(self.context)
        .await?
        .clone_value();

        let Some(module) =
            Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkPlaceable>>(module).await?
        else {
            bail!("Entry module must be evaluatable");
        };

        let Some(evaluatable) = Vc::try_resolve_sidecast(module).await? else {
            bail!("Entry module must be evaluatable");
        };
        evaluatable_assets.push(evaluatable);

        let edge_chunking_context = self.project.edge_middleware_chunking_context();

        let edge_files = edge_chunking_context.evaluated_chunk_group(
            module.as_root_chunk(Vc::upcast(edge_chunking_context)),
            Vc::cell(evaluatable_assets),
        );

        Ok(edge_files)
    }

    #[turbo_tasks::function]
    async fn output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;

        let config = parse_config_from_source(this.userland_module);

        let mut output_assets = self.edge_files().await?.clone_value();

        let node_root = this.project.node_root();

        let files_paths_from_root = {
            let node_root = &node_root.await?;
            output_assets
                .iter()
                .map(|&file| async move {
                    Ok(node_root
                        .get_path_to(&*file.ident().path().await?)
                        .context("middleware file path must be inside the node root")?
                        .to_string())
                })
                .try_join()
                .await?
        };

        let matchers = if let Some(matchers) = config.await?.matcher.as_ref() {
            matchers
                .iter()
                .map(|matcher| MiddlewareMatcher {
                    original_source: matcher.to_string(),
                    ..Default::default()
                })
                .collect()
        } else {
            vec![MiddlewareMatcher {
                regexp: Some("^/.*$".to_string()),
                original_source: "/:path*".to_string(),
                ..Default::default()
            }]
        };

        let edge_function_definition = EdgeFunctionDefinition {
            files: files_paths_from_root,
            name: "middleware".to_string(),
            page: "/".to_string(),
            regions: None,
            matchers,
            ..Default::default()
        };
        let middleware_manifest_v2 = MiddlewaresManifestV2 {
            sorted_middleware: Default::default(),
            middleware: [("/".to_string(), edge_function_definition)]
                .into_iter()
                .collect(),
            functions: Default::default(),
        };
        let middleware_manifest_v2 = Vc::upcast(VirtualOutputAsset::new(
            node_root.join("server/middleware/middleware-manifest.json".to_string()),
            AssetContent::file(
                FileContent::Content(File::from(serde_json::to_string_pretty(
                    &middleware_manifest_v2,
                )?))
                .cell(),
            ),
        ));
        output_assets.push(middleware_manifest_v2);

        Ok(Vc::cell(output_assets))
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for MiddlewareEndpoint {
    #[turbo_tasks::function]
    async fn write_to_disk(self: Vc<Self>) -> Result<Vc<WrittenEndpoint>> {
        let this = self.await?;
        let files = self.edge_files();
        let output_assets = self.output_assets();
        this.project
            .emit_all_output_assets(Vc::cell(output_assets))
            .await?;

        let node_root = this.project.node_root();
        let server_paths = all_server_paths(output_assets, node_root)
            .await?
            .clone_value();

        let node_root = &node_root.await?;

        let files = files
            .await?
            .iter()
            .map(|&file| async move {
                Ok(node_root
                    .get_path_to(&*file.ident().path().await?)
                    .context("middleware file path must be inside the node root")?
                    .to_string())
            })
            .try_join()
            .await?;

        Ok(WrittenEndpoint::Edge {
            files,
            global_var_name: "TODO".to_string(),
            server_paths,
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
}
