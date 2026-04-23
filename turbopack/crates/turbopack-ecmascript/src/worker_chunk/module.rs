use anyhow::{Result, bail};
use indoc::formatdoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkData, ChunkGroupType, ChunkableModule, ChunkingContext,
        ChunkingContextExt, ChunkingType, ChunksData, EvaluatableAsset, ModuleChunkItemIdExt,
        availability_info::AvailabilityInfo,
    },
    context::AssetContext,
    environment::ChunkLoading,
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
    reference::{ModuleReference, ModuleReferences, SingleChunkableModuleReference},
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{ExportUsage, ModuleResolveResult, parse::Request},
};

use super::worker_type::WorkerType;
use crate::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkItemOptions, EcmascriptChunkPlaceable,
        EcmascriptExports, data::EcmascriptChunkData, ecmascript_chunk_item,
    },
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_REQUIRE},
    utils::StringifyJs,
};

/// The WorkerLoaderModule is a module that creates a separate root chunk group for the given module
/// and exports a URL (for web workers) or file path (for Node.js workers) to pass to the worker
/// constructor.
#[turbo_tasks::value]
pub struct WorkerLoaderModule {
    pub inner: ResolvedVc<Box<dyn ChunkableModule>>,
    pub worker_type: WorkerType,
    pub asset_context: ResolvedVc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl WorkerLoaderModule {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn ChunkableModule>>,
        worker_type: WorkerType,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
    ) -> Vc<Self> {
        Self::cell(WorkerLoaderModule {
            inner: module,
            worker_type,
            asset_context,
        })
    }

    /// Resolves the `@turbopack/worker-*` helper module for the current environment.
    #[turbo_tasks::function]
    async fn worker_helper_module(&self) -> Result<Vc<Box<dyn Module>>> {
        let environment = self.asset_context.compile_time_info().environment();
        let chunk_loading = &*environment.chunk_loading().await?;
        let helper_request: RcStr = match chunk_loading {
            ChunkLoading::NodeJs => rcstr!("@turbopack/worker-node"),
            ChunkLoading::Edge | ChunkLoading::Dom => rcstr!("@turbopack/worker-browser"),
        };

        let origin_path = self.inner.ident().path().owned().await?;
        let request = Request::parse_string(helper_request.clone());
        let resolve_options = self.asset_context.resolve_options(origin_path.clone());
        let result = self.asset_context.resolve_asset(
            origin_path,
            request,
            resolve_options,
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Import),
        );

        let module = result.first_module().await?;
        let Some(module) = *module else {
            bail!(
                "Could not resolve worker helper module '{}'",
                helper_request
            );
        };
        Ok(*module)
    }

    /// Gets the worker helper module as an EcmascriptChunkPlaceable.
    #[turbo_tasks::function]
    async fn worker_helper_placeable(
        self: Vc<Self>,
    ) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
        let module = self.worker_helper_module().to_resolved().await?;
        let Some(placeable) = ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module)
        else {
            bail!("Worker helper module was not processed into an EcmascriptChunkPlaceable");
        };
        Ok(*placeable)
    }

    #[turbo_tasks::function]
    async fn chunk_group(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        Ok(match this.worker_type {
            WorkerType::WebWorker | WorkerType::SharedWebWorker => chunking_context
                .evaluated_chunk_group_assets(
                    this.inner
                        .ident()
                        .with_modifier(this.worker_type.chunk_modifier_str()),
                    ChunkGroup::Isolated(ResolvedVc::upcast(this.inner)),
                    module_graph,
                    AvailabilityInfo::root(),
                ),
            // WorkerThreads are treated as an entry point, webworkers probably should too but
            // currently it would lead to a cascade that we need to address.
            WorkerType::NodeWorkerThread => {
                let Some(evaluatable) =
                    ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(this.inner)
                else {
                    bail!("Worker module must be evaluatable");
                };

                let worker_path = chunking_context
                    .chunk_path(
                        None,
                        this.inner.ident(),
                        Some(rcstr!("[worker thread]")),
                        rcstr!(".js"),
                    )
                    .owned()
                    .await?;

                let entry_result = chunking_context
                    .root_entry_chunk_group(
                        worker_path,
                        ChunkGroup::Isolated(ResolvedVc::upcast(evaluatable)),
                        module_graph,
                        OutputAssets::empty(),
                        OutputAssets::empty(),
                    )
                    .await?;

                OutputAssetsWithReferenced {
                    assets: ResolvedVc::cell(vec![entry_result.asset]),
                    referenced_assets: ResolvedVc::cell(vec![]),
                    references: ResolvedVc::cell(vec![]),
                }
                .cell()
            }
        })
    }

    #[turbo_tasks::function]
    async fn chunks_data(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<ChunksData>> {
        Ok(ChunkData::from_assets(
            chunking_context.output_root().owned().await?,
            *self
                .chunk_group(chunking_context, module_graph)
                .await?
                .assets,
        ))
    }

    /// Returns output assets including the worker entrypoint for web workers.
    #[turbo_tasks::function]
    async fn chunk_group_with_type(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        Ok(match this.worker_type {
            WorkerType::WebWorker | WorkerType::SharedWebWorker => self
                .chunk_group(chunking_context, module_graph)
                .concatenate_asset(chunking_context.worker_entrypoint()),
            WorkerType::NodeWorkerThread => {
                // Node.js workers don't need a separate entrypoint asset
                self.chunk_group(chunking_context, module_graph)
            }
        })
    }
}

#[turbo_tasks::value_impl]
impl Module for WorkerLoaderModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.inner
            .ident()
            .with_modifier(self.worker_type.modifier_str())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let this = self.await?;
        let worker_ref =
            WorkerModuleReference::new(*ResolvedVc::upcast(this.inner), this.worker_type)
                .to_resolved()
                .await?;

        // Add a reference to the worker helper module so it's included in the chunk
        let helper_module = self.worker_helper_module().to_resolved().await?;
        let helper_ref = SingleChunkableModuleReference::new(
            *helper_module,
            rcstr!("worker helper"),
            ExportUsage::all(),
        )
        .to_resolved()
        .await?;

        Ok(Vc::cell(vec![
            ResolvedVc::upcast(worker_ref),
            ResolvedVc::upcast(helper_ref),
        ]))
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for WorkerLoaderModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for WorkerLoaderModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let options = EcmascriptChunkItemOptions {
            supports_arrow_functions: *chunking_context
                .environment()
                .runtime_versions()
                .supports_arrow_functions()
                .await?,
            ..Default::default()
        };

        if estimated {
            // In estimation mode we cannot call into chunking context APIs
            // otherwise we will induce a turbo tasks cycle. But we only need an
            // approximate solution. We'll use the same estimate for both web
            // and Node.js workers.
            return Ok(EcmascriptChunkItemContent {
                inner_code: formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}(function(Ctor, opts) {{
                            return Ctor;
                        }});
                    "#,
                }
                .into(),
                options,
                ..Default::default()
            }
            .cell());
        }

        // Get the worker helper module's chunk item ID for use in TURBOPACK_REQUIRE
        let helper_placeable = self.worker_helper_placeable();
        let helper_id = helper_placeable.chunk_item_id(chunking_context).await?;

        let code = match this.worker_type {
            WorkerType::WebWorker | WorkerType::SharedWebWorker => {
                // For web workers, generate code that exports a function to create the worker.
                // The function takes (WorkerConstructor, workerOptions) and calls createWorker
                // with the entrypoint and chunks baked in.
                let entrypoint_full_path = chunking_context.worker_entrypoint().path().await?;

                // Get the entrypoint path relative to output root
                let output_root = chunking_context.output_root().owned().await?;
                let entrypoint_path = output_root
                    .get_path_to(&entrypoint_full_path)
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| entrypoint_full_path.path.to_string());

                // Get the chunk data for the worker module
                let chunks_data = self.chunks_data(chunking_context, module_graph).await?;
                let chunks_data = chunks_data.iter().try_join().await?;
                let chunks_data: Vec<_> = chunks_data
                    .iter()
                    .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
                    .collect();

                formatdoc! {
                    r#"
                        var createWorker = {TURBOPACK_REQUIRE}({helper_id}).createWorker;
                        {TURBOPACK_EXPORT_VALUE}(function(Ctor, opts) {{
                            return createWorker(Ctor, {entrypoint}, {chunks}, opts);
                        }});
                    "#,
                    helper_id = StringifyJs(&helper_id),
                    entrypoint = StringifyJs(&entrypoint_path),
                    chunks = StringifyJs(&chunks_data),
                }
            }
            WorkerType::NodeWorkerThread => {
                // For Node.js workers, export a function to create the worker.
                // The function takes (WorkerConstructor, workerOptions) and calls createWorker
                // with the worker path baked in.
                let chunk_group = self.chunk_group(chunking_context, module_graph).await?;
                let assets = chunk_group.assets.await?;

                // The last asset is the evaluate chunk (entry point) for the worker.
                // The evaluated_chunk_group adds regular chunks first, then pushes the
                // evaluate chunk last. The evaluate chunk contains the bootstrap code that
                // loads the runtime and other chunks. For Node.js workers, we need a single
                // file path (not a blob URL like browser workers), so we use the evaluate
                // chunk which serves as the entry point.
                let Some(entry_asset) = assets.last() else {
                    bail!("cannot find worker entry point asset");
                };
                let entry_path = entry_asset.path().await?;

                // Get the filename of the worker entry chunk
                // We use just the filename because both the loader module and the worker
                // entry chunk are in the same directory (typically server/chunks/), so we
                // don't need a relative path - __dirname will already point to the correct
                // directory
                formatdoc! {
                    r#"
                        var createWorker = {TURBOPACK_REQUIRE}({helper_id}).createWorker;
                        {TURBOPACK_EXPORT_VALUE}(function(Ctor, opts) {{
                            return createWorker(Ctor, __dirname + "/" + {worker_path:#}, opts);
                        }});
                    "#,
                    helper_id = StringifyJs(&helper_id),
                    worker_path = StringifyJs(entry_path.file_name()),
                }
            }
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            options,
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn chunk_item_output_assets(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<OutputAssetsWithReferenced> {
        self.chunk_group_with_type(chunking_context, module_graph)
    }
}

#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string("{} module", self.worker_type.friendly_str())]
struct WorkerModuleReference {
    module: ResolvedVc<Box<dyn Module>>,
    worker_type: WorkerType,
}

#[turbo_tasks::value_impl]
impl WorkerModuleReference {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>, worker_type: WorkerType) -> Vc<Self> {
        Self::cell(WorkerModuleReference {
            module,
            worker_type,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for WorkerModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(self.module)
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Isolated {
            _ty: match self.worker_type {
                WorkerType::SharedWebWorker | WorkerType::WebWorker => ChunkGroupType::Evaluated,
                WorkerType::NodeWorkerThread => ChunkGroupType::Entry,
            },
            merge_tag: None,
        })
    }
}
