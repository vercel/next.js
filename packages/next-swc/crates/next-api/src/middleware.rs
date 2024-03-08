use anyhow::{bail, Context, Result};
use next_core::{
    all_assets_from_entries,
    middleware::get_middleware_module,
    next_edge::entry::wrap_edge_entry,
    next_manifests::{EdgeFunctionDefinition, MiddlewareMatcher, MiddlewaresManifestV2},
    next_server::{get_server_runtime_entries, ServerContextType},
    util::parse_config_from_source,
};
use tracing::Instrument;
use turbo_tasks::{Completion, Value, Vc};
use turbopack_binding::{
    turbo::tasks_fs::{File, FileContent},
    turbopack::{
        core::{
            asset::AssetContent,
            chunk::{availability_info::AvailabilityInfo, ChunkingContextExt},
            context::AssetContext,
            module::Module,
            output::OutputAssets,
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::Source,
            virtual_output::VirtualOutputAsset,
        },
        ecmascript::chunk::EcmascriptChunkPlaceable,
    },
};

use crate::{
    paths::{
        all_paths_in_root, all_server_paths, get_js_paths_from_root, get_wasm_paths_from_root,
        wasm_paths_to_bindings,
    },
    project::Project,
    route::{Endpoint, WrittenEndpoint},
};

#[turbo_tasks::value]
pub struct MiddlewareEndpoint {
    project: Vc<Project>,
    context: Vc<Box<dyn AssetContext>>,
    source: Vc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl MiddlewareEndpoint {
    #[turbo_tasks::function]
    pub fn new(
        project: Vc<Project>,
        context: Vc<Box<dyn AssetContext>>,
        source: Vc<Box<dyn Source>>,
    ) -> Vc<Self> {
        Self {
            project,
            context,
            source,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn edge_files(&self) -> Result<Vc<OutputAssets>> {
        let userland_module = self
            .context
            .process(
                self.source,
                Value::new(ReferenceType::Entry(EntryReferenceSubType::Middleware)),
            )
            .module();

        let module =
            get_middleware_module(self.context, self.project.project_path(), userland_module);

        let module = wrap_edge_entry(
            self.context,
            self.project.project_path(),
            module,
            "middleware".to_string(),
        );

        let mut evaluatable_assets = get_server_runtime_entries(
            Value::new(ServerContextType::Middleware),
            self.project.next_mode(),
        )
        .resolve_entries(self.context)
        .await?
        .clone_value();

        let Some(module) =
            Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkPlaceable>>(module).await?
        else {
            bail!("Entry module must be evaluatable");
        };

        let evaluatable = Vc::try_resolve_sidecast(module)
            .await?
            .context("Entry module must be evaluatable")?;
        evaluatable_assets.push(evaluatable);

        let edge_chunking_context = self.project.edge_chunking_context();

        let edge_files = edge_chunking_context.evaluated_chunk_group_assets(
            module.ident(),
            Vc::cell(evaluatable_assets),
            Value::new(AvailabilityInfo::Root),
        );

        Ok(edge_files)
    }

    #[turbo_tasks::function]
    async fn output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;

        let userland_module = this
            .context
            .process(
                this.source,
                Value::new(ReferenceType::Entry(EntryReferenceSubType::Middleware)),
            )
            .module();

        let config = parse_config_from_source(userland_module);

        let edge_files = self.edge_files();
        let mut output_assets = edge_files.await?.clone_value();

        let node_root = this.project.node_root();
        let node_root_value = node_root.await?;

        let file_paths_from_root = get_js_paths_from_root(&node_root_value, &output_assets).await?;

        let all_output_assets = all_assets_from_entries(edge_files).await?;

        let wasm_paths_from_root =
            get_wasm_paths_from_root(&node_root_value, &all_output_assets).await?;

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
            files: file_paths_from_root,
            wasm: wasm_paths_to_bindings(wasm_paths_from_root),
            name: "middleware".to_string(),
            page: "/".to_string(),
            regions: None,
            matchers,
            ..Default::default()
        };
        let middleware_manifest_v2 = MiddlewaresManifestV2 {
            middleware: [("/".to_string(), edge_function_definition)]
                .into_iter()
                .collect(),
            ..Default::default()
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
        let span = tracing::info_span!("middleware endpoint");
        async move {
            let this = self.await?;
            let output_assets = self.output_assets();
            this.project
                .emit_all_output_assets(Vc::cell(output_assets))
                .await?;

            let node_root = this.project.node_root();
            let server_paths = all_server_paths(output_assets, node_root)
                .await?
                .clone_value();

            // Middleware could in theory have a client path (e.g. `new URL`).
            let client_relative_root = this.project.client_relative_path();
            let client_paths = all_paths_in_root(output_assets, client_relative_root)
                .await?
                .clone_value();

            Ok(WrittenEndpoint::Edge {
                server_paths,
                client_paths,
            }
            .cell())
        }
        .instrument(span)
        .await
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
