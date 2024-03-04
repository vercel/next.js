use anyhow::{bail, Result};
use next_core::{
    all_assets_from_entries,
    next_edge::entry::wrap_edge_entry,
    next_manifests::{InstrumentationDefinition, MiddlewaresManifestV2},
    next_server::{get_server_runtime_entries, ServerContextType},
};
use tracing::Instrument;
use turbo_tasks::{Completion, Value, Vc};
use turbopack_binding::{
    turbo::tasks_fs::{File, FileContent},
    turbopack::{
        build::EntryChunkGroupResult,
        core::{
            asset::AssetContent,
            chunk::{availability_info::AvailabilityInfo, ChunkingContextExt},
            context::AssetContext,
            module::Module,
            output::{OutputAsset, OutputAssets},
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::Source,
            virtual_output::VirtualOutputAsset,
        },
        ecmascript::chunk::EcmascriptChunkPlaceable,
    },
};

use crate::{
    paths::{
        all_server_paths, get_js_paths_from_root, get_wasm_paths_from_root, wasm_paths_to_bindings,
    },
    project::Project,
    route::{Endpoint, WrittenEndpoint},
};

#[turbo_tasks::value]
pub struct InstrumentationEndpoint {
    project: Vc<Project>,
    context: Vc<Box<dyn AssetContext>>,
    source: Vc<Box<dyn Source>>,
    is_edge: bool,
}

#[turbo_tasks::value_impl]
impl InstrumentationEndpoint {
    #[turbo_tasks::function]
    pub fn new(
        project: Vc<Project>,
        context: Vc<Box<dyn AssetContext>>,
        source: Vc<Box<dyn Source>>,
        is_edge: bool,
    ) -> Vc<Self> {
        Self {
            project,
            context,
            source,
            is_edge,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn edge_files(&self) -> Result<Vc<OutputAssets>> {
        let userland_module = self
            .context
            .process(
                self.source,
                Value::new(ReferenceType::Entry(EntryReferenceSubType::Instrumentation)),
            )
            .module();

        let module = wrap_edge_entry(
            self.context,
            self.project.project_path(),
            userland_module,
            "instrumentation".to_string(),
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

        let Some(evaluatable) = Vc::try_resolve_sidecast(module).await? else {
            bail!("Entry module must be evaluatable");
        };
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
    async fn node_chunk(&self) -> Result<Vc<Box<dyn OutputAsset>>> {
        let chunking_context = self.project.server_chunking_context();

        let userland_module = self
            .context
            .process(
                self.source,
                Value::new(ReferenceType::Entry(EntryReferenceSubType::Instrumentation)),
            )
            .module();

        let Some(module) = Vc::try_resolve_downcast(userland_module).await? else {
            bail!("Entry module must be evaluatable");
        };

        let EntryChunkGroupResult { asset: chunk, .. } = *chunking_context
            .entry_chunk_group(
                self.project
                    .node_root()
                    .join("server/instrumentation.js".to_string()),
                module,
                get_server_runtime_entries(
                    Value::new(ServerContextType::Instrumentation),
                    self.project.next_mode(),
                )
                .resolve_entries(self.context),
                Value::new(AvailabilityInfo::Root),
            )
            .await?;
        Ok(chunk)
    }

    #[turbo_tasks::function]
    async fn output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;

        if this.is_edge {
            let edge_files = self.edge_files();
            let mut output_assets = edge_files.await?.clone_value();

            let node_root = this.project.node_root();
            let node_root_value = node_root.await?;

            let file_paths_from_root =
                get_js_paths_from_root(&node_root_value, &output_assets).await?;

            let all_output_assets = all_assets_from_entries(edge_files).await?;

            let wasm_paths_from_root =
                get_wasm_paths_from_root(&node_root_value, &all_output_assets).await?;

            let instrumentation_definition = InstrumentationDefinition {
                files: file_paths_from_root,
                wasm: wasm_paths_to_bindings(wasm_paths_from_root),
                name: "instrumentation".to_string(),
                ..Default::default()
            };
            let middleware_manifest_v2 = MiddlewaresManifestV2 {
                instrumentation: Some(instrumentation_definition),
                ..Default::default()
            };
            let middleware_manifest_v2 = Vc::upcast(VirtualOutputAsset::new(
                node_root.join("server/instrumentation/middleware-manifest.json".to_string()),
                AssetContent::file(
                    FileContent::Content(File::from(serde_json::to_string_pretty(
                        &middleware_manifest_v2,
                    )?))
                    .cell(),
                ),
            ));
            output_assets.push(middleware_manifest_v2);

            Ok(Vc::cell(output_assets))
        } else {
            Ok(Vc::cell(vec![self.node_chunk()]))
        }
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for InstrumentationEndpoint {
    #[turbo_tasks::function]
    async fn write_to_disk(self: Vc<Self>) -> Result<Vc<WrittenEndpoint>> {
        let span = tracing::info_span!("instrumentation endpoint");
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

            Ok(WrittenEndpoint::Edge {
                server_paths,
                client_paths: vec![],
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
