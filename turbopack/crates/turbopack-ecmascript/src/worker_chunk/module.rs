use anyhow::{Result, bail};
use indoc::formatdoc;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystem;
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkData, ChunkGroupType, ChunkableModule, ChunkingContext,
        ChunkingContextExt, ChunkingType, ChunksData, EvaluatableAsset, ModuleChunkItemIdExt,
        ModuleId, availability_info::AvailabilityInfo,
    },
    context::AssetContext,
    file_source::FileSource,
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
    reference::{ModuleReference, ModuleReferences, SingleChunkableModuleReference},
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{ExportUsage, ModuleResolveResult},
};

use super::worker_type::WorkerType;
use crate::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkItemOptions, EcmascriptChunkPlaceable,
        EcmascriptExports, data::EcmascriptChunkData, ecmascript_chunk_item,
    },
    embed_js::embed_fs,
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_REQUIRE},
    utils::{StringifyJs, StringifyModuleId},
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

    #[turbo_tasks::function]
    async fn chunk_group(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = turbo_tasks::read!(self)?;
        Ok(match this.worker_type {
            WorkerType::WebWorker | WorkerType::SharedWebWorker => {
                let ident = turbo_tasks::read!(this.inner.ident().owned())?
                    .with_modifier(this.worker_type.chunk_modifier_str())
                    .into_vc();
                chunking_context.evaluated_chunk_group_assets(
                    ident,
                    ChunkGroup::Isolated(ResolvedVc::upcast(this.inner)),
                    module_graph,
                    OutputAssets::empty(),
                    AvailabilityInfo::root(),
                )
            }
            // WorkerThreads are treated as an entry point, webworkers probably should too but
            // currently it would lead to a cascade that we need to address.
            WorkerType::NodeWorkerThread => {
                let Some(evaluatable) =
                    ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(this.inner)
                else {
                    bail!("Worker module must be evaluatable");
                };

                let worker_path = turbo_tasks::read!(
                    chunking_context
                        .chunk_path(
                            None,
                            this.inner.ident(),
                            Some(rcstr!("[worker thread]")),
                            rcstr!(".js"),
                        )
                        .owned()
                )?;

                let entry_result = turbo_tasks::read!(chunking_context.root_entry_chunk_group(
                    worker_path,
                    ChunkGroup::Isolated(ResolvedVc::upcast(evaluatable)),
                    module_graph,
                    OutputAssets::empty(),
                    OutputAssets::empty(),
                ))?;

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
            turbo_tasks::read!(chunking_context.output_root().owned())?,
            *turbo_tasks::read!(self.chunk_group(chunking_context, module_graph))?.assets,
        ))
    }

    /// `createWorker` is stored in a module; for each worker we need to
    /// load, we require this module and then use it.
    #[turbo_tasks::function]
    async fn create_worker_module(self: Vc<Self>) -> Result<Vc<Box<dyn Module>>> {
        let this = turbo_tasks::read!(self)?;
        let helper = match this.worker_type {
            WorkerType::WebWorker | WorkerType::SharedWebWorker => {
                rcstr!("worker/browser/createWorker.ts")
            }
            WorkerType::NodeWorkerThread => rcstr!("worker/node/createWorker.ts"),
        };
        Ok(this
            .asset_context
            .process(
                Vc::upcast(FileSource::new(
                    turbo_tasks::read!(embed_fs().root())?.join(&helper)?,
                )),
                ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Import),
            )
            .module())
    }

    /// Returns output assets including the worker entrypoint for web workers.
    #[turbo_tasks::function]
    async fn chunk_group_with_type(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = turbo_tasks::read!(self)?;
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
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(turbo_tasks::read!(self.inner.ident().owned())?
            .with_modifier(self.worker_type.modifier_str())
            .into_vc())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let this = turbo_tasks::read!(self)?;
        Ok(Vc::cell(vec![
            ResolvedVc::upcast(turbo_tasks::read!(
                WorkerModuleReference::new(*ResolvedVc::upcast(this.inner), this.worker_type)
                    .to_resolved()
            )?),
            ResolvedVc::upcast(turbo_tasks::read!(
                SingleChunkableModuleReference::new(
                    self.create_worker_module(),
                    rcstr!("createWorker"),
                    ExportUsage::named(rcstr!("default")),
                )
                .to_resolved()
            )?),
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
        let this = turbo_tasks::read!(self)?;
        let options = EcmascriptChunkItemOptions {
            supports_arrow_functions: *turbo_tasks::read!(
                chunking_context
                    .environment()
                    .runtime_versions()
                    .supports_arrow_functions()
            )?,
            ..Default::default()
        };

        if estimated {
            // In estimation mode we cannot call into chunking context APIs
            // otherwise we will induce a turbo tasks cycle. But we only need an
            // approximate solution. We'll use the same estimate for both web
            // and Node.js workers.
            let fake_id = ModuleId::String(rcstr!("a_fake_module"));
            return Ok(EcmascriptChunkItemContent {
                inner_code: formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}({TURBOPACK_REQUIRE}({workers_module})["default"](__dirname + "/" + {worker_path:#}));
                    "#,
                    worker_path = StringifyJs(&"a_fake_path_for_size_estimation"),
                    workers_module = StringifyModuleId(&fake_id),
                }
                .into(),
                options,
                ..Default::default()
            }
            .cell());
        }

        let create_worker_id =
            turbo_tasks::read!(self.create_worker_module().chunk_item_id(chunking_context))?;

        let code = match this.worker_type {
            WorkerType::WebWorker | WorkerType::SharedWebWorker => {
                // For web workers, generate code that exports a function to create the worker.
                // The function takes (WorkerConstructor, workerOptions) and calls createWorker
                // with the entrypoint and chunks baked in.
                let entrypoint_full_path =
                    turbo_tasks::read!(chunking_context.worker_entrypoint().path())?;

                // Get the entrypoint path relative to output root
                let output_root = turbo_tasks::read!(chunking_context.output_root().owned())?;
                let entrypoint_path = output_root
                    .get_path_to(&entrypoint_full_path)
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| entrypoint_full_path.path.to_string());

                // Get the chunk data for the worker module
                let chunks_data =
                    turbo_tasks::read!(self.chunks_data(chunking_context, module_graph))?;
                let chunks_data = turbo_tasks::parallel!(chunks_data.iter())?;
                let chunks_data: Vec<_> = chunks_data
                    .iter()
                    .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
                    .collect();

                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}({TURBOPACK_REQUIRE}({workers_module})["default"]({entrypoint}, {chunks}));
                    "#,
                    entrypoint = StringifyJs(&entrypoint_path),
                    chunks = StringifyJs(&chunks_data),
                    workers_module = StringifyModuleId(&create_worker_id),
                }
            }
            WorkerType::NodeWorkerThread => {
                // For Node.js workers, export a function to create the worker.
                // The function takes (WorkerConstructor, workerOptions) and calls createWorker
                // with the worker path baked in.
                let chunk_group =
                    turbo_tasks::read!(self.chunk_group(chunking_context, module_graph))?;
                let assets = turbo_tasks::read!(chunk_group.assets)?;

                // The last asset is the evaluate chunk (entry point) for the worker.
                // The evaluated_chunk_group adds regular chunks first, then pushes the
                // evaluate chunk last. The evaluate chunk contains the bootstrap code that
                // loads the runtime and other chunks. For Node.js workers, we need a single
                // file path (not a blob URL like browser workers), so we use the evaluate
                // chunk which serves as the entry point.
                let Some(entry_asset) = assets.last() else {
                    bail!("cannot find worker entry point asset");
                };
                let entry_path = turbo_tasks::read!(entry_asset.path())?;

                // Get the filename of the worker entry chunk
                // We use just the filename because both the loader module and the worker
                // entry chunk are in the same directory (typically server/chunks/), so we
                // don't need a relative path - __dirname will already point to the correct
                // directory
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}({TURBOPACK_REQUIRE}({workers_module})["default"](__dirname + "/" + {worker_path:#}));
                    "#,
                    worker_path = StringifyJs(entry_path.file_name()),
                    workers_module = StringifyModuleId(&create_worker_id),
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
