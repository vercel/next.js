use anyhow::{bail, Result};
use next_core::{
    all_assets_from_entries,
    next_edge::entry::wrap_edge_entry,
    next_manifests::{InstrumentationDefinition, MiddlewaresManifestV2},
    next_server::{get_server_runtime_entries, ServerContextType},
};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{Completion, ResolvedVc, Value, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    chunk::{
        availability_info::AvailabilityInfo, ChunkingContext, ChunkingContextExt,
        EntryChunkGroupResult,
    },
    context::AssetContext,
    module::{Module, Modules},
    output::{OutputAsset, OutputAssets},
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceable;

use crate::{
    nft_json::NftJsonAsset,
    paths::{
        all_server_paths, get_js_paths_from_root, get_wasm_paths_from_root, wasm_paths_to_bindings,
    },
    project::Project,
    route::{Endpoint, WrittenEndpoint},
};

#[turbo_tasks::value]
pub struct InstrumentationEndpoint {
    project: ResolvedVc<Project>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    source: ResolvedVc<Box<dyn Source>>,
    is_edge: bool,

    app_dir: Option<ResolvedVc<FileSystemPath>>,
    ecmascript_client_reference_transition_name: Option<ResolvedVc<RcStr>>,
}

#[turbo_tasks::value_impl]
impl InstrumentationEndpoint {
    #[turbo_tasks::function]
    pub fn new(
        project: ResolvedVc<Project>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        source: ResolvedVc<Box<dyn Source>>,
        is_edge: bool,
        app_dir: Option<ResolvedVc<FileSystemPath>>,
        ecmascript_client_reference_transition_name: Option<ResolvedVc<RcStr>>,
    ) -> Vc<Self> {
        Self {
            project,
            asset_context,
            source,
            is_edge,
            app_dir,
            ecmascript_client_reference_transition_name,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn core_modules(&self) -> Result<Vc<InstrumentationCoreModules>> {
        let userland_module = self
            .asset_context
            .process(
                *self.source,
                Value::new(ReferenceType::Entry(EntryReferenceSubType::Instrumentation)),
            )
            .module()
            .to_resolved()
            .await?;

        let edge_entry_module = wrap_edge_entry(
            *self.asset_context,
            self.project.project_path(),
            *userland_module,
            "instrumentation".into(),
        )
        .to_resolved()
        .await?;

        Ok(InstrumentationCoreModules {
            userland_module,
            edge_entry_module,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn entry_module(self: Vc<Self>) -> Result<Vc<Box<dyn Module>>> {
        if self.await?.is_edge {
            Ok(*self.core_modules().await?.edge_entry_module)
        } else {
            Ok(*self.core_modules().await?.userland_module)
        }
    }

    #[turbo_tasks::function]
    async fn edge_files(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;

        let module = self.core_modules().await?.edge_entry_module;

        let mut evaluatable_assets = get_server_runtime_entries(
            Value::new(ServerContextType::Instrumentation {
                app_dir: this.app_dir,
                ecmascript_client_reference_transition_name: this
                    .ecmascript_client_reference_transition_name,
            }),
            this.project.next_mode(),
        )
        .resolve_entries(*this.asset_context)
        .await?
        .clone_value();

        let Some(module) =
            ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(module).await?
        else {
            bail!("Entry module must be evaluatable");
        };

        let Some(evaluatable) = ResolvedVc::try_sidecast(module).await? else {
            bail!("Entry module must be evaluatable");
        };
        evaluatable_assets.push(evaluatable);

        let edge_chunking_context = this.project.edge_chunking_context(false);

        let edge_files = edge_chunking_context.evaluated_chunk_group_assets(
            module.ident(),
            Vc::cell(evaluatable_assets),
            Value::new(AvailabilityInfo::Root),
        );

        Ok(edge_files)
    }

    #[turbo_tasks::function]
    async fn node_chunk(self: Vc<Self>) -> Result<Vc<Box<dyn OutputAsset>>> {
        let this = self.await?;

        let chunking_context = this.project.server_chunking_context(false);

        let userland_module = self.core_modules().await?.userland_module;

        let Some(module) = ResolvedVc::try_downcast(userland_module).await? else {
            bail!("Entry module must be evaluatable");
        };

        let EntryChunkGroupResult { asset: chunk, .. } = *chunking_context
            .entry_chunk_group(
                this.project
                    .node_root()
                    .join("server/instrumentation.js".into()),
                *module,
                get_server_runtime_entries(
                    Value::new(ServerContextType::Instrumentation {
                        app_dir: this.app_dir,
                        ecmascript_client_reference_transition_name: this
                            .ecmascript_client_reference_transition_name,
                    }),
                    this.project.next_mode(),
                )
                .resolve_entries(*this.asset_context),
                OutputAssets::empty(),
                Value::new(AvailabilityInfo::Root),
            )
            .await?;
        Ok(*chunk)
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
                name: "instrumentation".into(),
                ..Default::default()
            };
            let middleware_manifest_v2 = MiddlewaresManifestV2 {
                instrumentation: Some(instrumentation_definition),
                ..Default::default()
            };
            let middleware_manifest_v2 = VirtualOutputAsset::new(
                node_root.join("server/instrumentation/middleware-manifest.json".into()),
                AssetContent::file(
                    FileContent::Content(File::from(serde_json::to_string_pretty(
                        &middleware_manifest_v2,
                    )?))
                    .cell(),
                ),
            )
            .to_resolved()
            .await?;
            output_assets.push(ResolvedVc::upcast(middleware_manifest_v2));

            Ok(Vc::cell(output_assets))
        } else {
            let chunk = self.node_chunk().to_resolved().await?;
            let mut output_assets = vec![chunk];
            if this.project.next_mode().await?.is_production() {
                output_assets.push(ResolvedVc::upcast(
                    NftJsonAsset::new(*this.project, *chunk, vec![])
                        .to_resolved()
                        .await?,
                ));
            }
            Ok(Vc::cell(output_assets))
        }
    }
}

#[turbo_tasks::value]
struct InstrumentationCoreModules {
    pub userland_module: ResolvedVc<Box<dyn Module>>,
    pub edge_entry_module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl Endpoint for InstrumentationEndpoint {
    #[turbo_tasks::function]
    async fn write_to_disk(self: Vc<Self>) -> Result<Vc<WrittenEndpoint>> {
        let span = tracing::info_span!("instrumentation endpoint");
        async move {
            let this = self.await?;
            let output_assets = self.output_assets();
            let _ = output_assets.resolve().await?;
            let _ = this
                .project
                .emit_all_output_assets(Vc::cell(output_assets))
                .resolve()
                .await?;

            let server_paths = if this.project.next_mode().await?.is_development() {
                let node_root = this.project.node_root();
                all_server_paths(output_assets, node_root)
                    .await?
                    .clone_value()
            } else {
                vec![]
            };

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

    #[turbo_tasks::function]
    async fn root_modules(self: Vc<Self>) -> Result<Vc<Modules>> {
        let core_modules = self.core_modules().await?;
        Ok(Vc::cell(vec![
            core_modules.userland_module,
            core_modules.edge_entry_module,
        ]))
    }
}
