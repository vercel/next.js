use anyhow::{Context, Result, bail};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, ResolvedVc, TryJoinIterExt, Upcast, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::Asset,
    chunk::{
        Chunk, ChunkGroupResult, ChunkItem, ChunkType, ChunkableModule, ChunkingConfig,
        ChunkingConfigs, ChunkingContext, EntryChunkGroupResult, EvaluatableAssets, MinifyType,
        ModuleId, SourceMapsType,
        availability_info::AvailabilityInfo,
        chunk_group::{MakeChunkGroupResult, make_chunk_group},
        module_id_strategies::{DevModuleIdStrategy, ModuleIdStrategy},
    },
    environment::Environment,
    ident::AssetIdent,
    module::Module,
    module_graph::{
        ModuleGraph,
        chunk_group_info::ChunkGroup,
        export_usage::{ExportUsageInfo, ModuleExportUsage},
    },
    output::{OutputAsset, OutputAssets},
};
use turbopack_ecmascript::{
    async_chunk::module::AsyncLoaderModule,
    chunk::EcmascriptChunk,
    manifest::{chunk_asset::ManifestAsyncModule, loader_item::ManifestLoaderChunkItem},
};
use turbopack_ecmascript_runtime::RuntimeType;

use crate::ecmascript::node::{
    chunk::EcmascriptBuildNodeChunk, entry::chunk::EcmascriptBuildNodeEntryChunk,
};

/// A builder for [`Vc<NodeJsChunkingContext>`].
pub struct NodeJsChunkingContextBuilder {
    chunking_context: NodeJsChunkingContext,
}

impl NodeJsChunkingContextBuilder {
    pub fn asset_prefix(mut self, asset_prefix: Option<RcStr>) -> Self {
        self.chunking_context.asset_prefix = asset_prefix;
        self
    }

    pub fn asset_prefix_override(mut self, tag: RcStr, prefix: RcStr) -> Self {
        self.chunking_context.asset_prefixes.insert(tag, prefix);
        self
    }

    pub fn asset_root_path_override(mut self, tag: RcStr, path: FileSystemPath) -> Self {
        self.chunking_context.asset_root_paths.insert(tag, path);
        self
    }

    pub fn client_roots_override(mut self, tag: RcStr, path: FileSystemPath) -> Self {
        self.chunking_context.client_roots.insert(tag, path);
        self
    }

    pub fn minify_type(mut self, minify_type: MinifyType) -> Self {
        self.chunking_context.minify_type = minify_type;
        self
    }

    pub fn source_maps(mut self, source_maps: SourceMapsType) -> Self {
        self.chunking_context.source_maps_type = source_maps;
        self
    }

    pub fn file_tracing(mut self, enable_tracing: bool) -> Self {
        self.chunking_context.enable_file_tracing = enable_tracing;
        self
    }

    pub fn module_merging(mut self, enable_module_merging: bool) -> Self {
        self.chunking_context.enable_module_merging = enable_module_merging;
        self
    }

    pub fn dynamic_chunk_content_loading(
        mut self,
        enable_dynamic_chunk_content_loading: bool,
    ) -> Self {
        self.chunking_context.enable_dynamic_chunk_content_loading =
            enable_dynamic_chunk_content_loading;
        self
    }

    pub fn runtime_type(mut self, runtime_type: RuntimeType) -> Self {
        self.chunking_context.runtime_type = runtime_type;
        self
    }

    pub fn manifest_chunks(mut self, manifest_chunks: bool) -> Self {
        self.chunking_context.manifest_chunks = manifest_chunks;
        self
    }

    pub fn use_file_source_map_uris(mut self) -> Self {
        self.chunking_context.should_use_file_source_map_uris = true;
        self
    }

    pub fn module_id_strategy(
        mut self,
        module_id_strategy: ResolvedVc<Box<dyn ModuleIdStrategy>>,
    ) -> Self {
        self.chunking_context.module_id_strategy = module_id_strategy;
        self
    }

    pub fn export_usage(mut self, export_usage: Option<ResolvedVc<ExportUsageInfo>>) -> Self {
        self.chunking_context.export_usage = export_usage;
        self
    }

    pub fn chunking_config<T>(mut self, ty: ResolvedVc<T>, chunking_config: ChunkingConfig) -> Self
    where
        T: Upcast<Box<dyn ChunkType>>,
    {
        self.chunking_context
            .chunking_configs
            .push((ResolvedVc::upcast_non_strict(ty), chunking_config));
        self
    }

    pub fn debug_ids(mut self, debug_ids: bool) -> Self {
        self.chunking_context.debug_ids = debug_ids;
        self
    }

    /// Builds the chunking context.
    pub fn build(self) -> Vc<NodeJsChunkingContext> {
        NodeJsChunkingContext::cell(self.chunking_context)
    }
}

/// A chunking context for build mode.
#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub struct NodeJsChunkingContext {
    /// The root path of the project
    root_path: FileSystemPath,
    /// This path is used to compute the url to request chunks or assets from
    output_root: FileSystemPath,
    /// The relative path from the output_root to the root_path.
    output_root_to_root_path: RcStr,
    /// This path is used to compute the url to request chunks or assets from
    client_root: FileSystemPath,
    /// This path is used to compute the url to request chunks or assets from
    client_roots: FxIndexMap<RcStr, FileSystemPath>,
    /// Chunks are placed at this path
    chunk_root_path: FileSystemPath,
    /// Static assets are placed at this path
    asset_root_path: FileSystemPath,
    /// Static assets are placed at this path
    asset_root_paths: FxIndexMap<RcStr, FileSystemPath>,
    /// Static assets requested from this url base
    asset_prefix: Option<RcStr>,
    /// Static assets requested from this url base
    asset_prefixes: FxIndexMap<RcStr, RcStr>,
    /// The environment chunks will be evaluated in.
    environment: ResolvedVc<Environment>,
    /// The kind of runtime to include in the output.
    runtime_type: RuntimeType,
    /// Enable tracing for this chunking
    enable_file_tracing: bool,
    /// Enable module merging
    enable_module_merging: bool,
    /// Enable dynamic chunk content loading.
    enable_dynamic_chunk_content_loading: bool,
    /// Whether to minify resulting chunks
    minify_type: MinifyType,
    /// Whether to generate source maps
    source_maps_type: SourceMapsType,
    /// Whether to use manifest chunks for lazy compilation
    manifest_chunks: bool,
    /// The strategy to use for generating module ids
    module_id_strategy: ResolvedVc<Box<dyn ModuleIdStrategy>>,
    /// The module export usage info, if available.
    export_usage: Option<ResolvedVc<ExportUsageInfo>>,
    /// Whether to use file:// uris for source map sources
    should_use_file_source_map_uris: bool,
    /// The chunking configs
    chunking_configs: Vec<(ResolvedVc<Box<dyn ChunkType>>, ChunkingConfig)>,
    /// Enable debug IDs for chunks and source maps.
    debug_ids: bool,
}

impl NodeJsChunkingContext {
    /// Creates a new chunking context builder.
    pub fn builder(
        root_path: FileSystemPath,
        output_root: FileSystemPath,
        output_root_to_root_path: RcStr,
        client_root: FileSystemPath,
        chunk_root_path: FileSystemPath,
        asset_root_path: FileSystemPath,
        environment: ResolvedVc<Environment>,
        runtime_type: RuntimeType,
    ) -> NodeJsChunkingContextBuilder {
        NodeJsChunkingContextBuilder {
            chunking_context: NodeJsChunkingContext {
                root_path,
                output_root,
                output_root_to_root_path,
                client_root,
                client_roots: Default::default(),
                chunk_root_path,
                asset_root_path,
                asset_root_paths: Default::default(),
                asset_prefix: None,
                asset_prefixes: Default::default(),
                enable_file_tracing: false,
                enable_module_merging: false,
                enable_dynamic_chunk_content_loading: false,
                environment,
                runtime_type,
                minify_type: MinifyType::NoMinify,
                source_maps_type: SourceMapsType::Full,
                manifest_chunks: false,
                should_use_file_source_map_uris: false,
                module_id_strategy: ResolvedVc::upcast(DevModuleIdStrategy::new_resolved()),
                export_usage: None,
                chunking_configs: Default::default(),
                debug_ids: false,
            },
        }
    }
}

#[turbo_tasks::value_impl]
impl NodeJsChunkingContext {
    #[turbo_tasks::function]
    async fn generate_chunk(
        self: Vc<Self>,
        chunk: ResolvedVc<Box<dyn Chunk>>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        Ok(
            if let Some(ecmascript_chunk) = ResolvedVc::try_downcast_type::<EcmascriptChunk>(chunk)
            {
                Vc::upcast(EcmascriptBuildNodeChunk::new(self, *ecmascript_chunk))
            } else if let Some(output_asset) =
                ResolvedVc::try_sidecast::<Box<dyn OutputAsset>>(chunk)
            {
                *output_asset
            } else {
                bail!("Unable to generate output asset for chunk");
            },
        )
    }

    /// Returns the kind of runtime to include in output chunks.
    ///
    /// This is defined directly on `NodeJsChunkingContext` so it is zero-cost
    /// when `RuntimeType` has a single variant.
    #[turbo_tasks::function]
    pub fn runtime_type(&self) -> Vc<RuntimeType> {
        self.runtime_type.cell()
    }

    /// Returns the minify type.
    #[turbo_tasks::function]
    pub fn minify_type(&self) -> Vc<MinifyType> {
        self.minify_type.cell()
    }

    #[turbo_tasks::function]
    pub fn asset_prefix(&self) -> Vc<Option<RcStr>> {
        Vc::cell(self.asset_prefix.clone())
    }
}

#[turbo_tasks::value_impl]
impl ChunkingContext for NodeJsChunkingContext {
    #[turbo_tasks::function]
    fn name(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("unknown"))
    }

    #[turbo_tasks::function]
    fn root_path(&self) -> Vc<FileSystemPath> {
        self.root_path.clone().cell()
    }

    #[turbo_tasks::function]
    fn output_root(&self) -> Vc<FileSystemPath> {
        self.output_root.clone().cell()
    }

    #[turbo_tasks::function]
    fn output_root_to_root_path(&self) -> Vc<RcStr> {
        Vc::cell(self.output_root_to_root_path.clone())
    }

    #[turbo_tasks::function]
    fn environment(&self) -> Vc<Environment> {
        *self.environment
    }

    #[turbo_tasks::function]
    fn is_tracing_enabled(&self) -> Vc<bool> {
        Vc::cell(self.enable_file_tracing)
    }

    #[turbo_tasks::function]
    fn is_module_merging_enabled(&self) -> Vc<bool> {
        Vc::cell(self.enable_module_merging)
    }

    #[turbo_tasks::function]
    fn is_dynamic_chunk_content_loading_enabled(&self) -> Vc<bool> {
        Vc::cell(self.enable_dynamic_chunk_content_loading)
    }

    #[turbo_tasks::function]
    pub fn minify_type(&self) -> Vc<MinifyType> {
        self.minify_type.cell()
    }

    #[turbo_tasks::function]
    async fn asset_url(&self, ident: FileSystemPath, tag: Option<RcStr>) -> Result<Vc<RcStr>> {
        let asset_path = ident.to_string();

        let client_root = tag
            .as_ref()
            .and_then(|tag| self.client_roots.get(tag))
            .unwrap_or(&self.client_root);

        let asset_prefix = tag
            .as_ref()
            .and_then(|tag| self.asset_prefixes.get(tag))
            .or(self.asset_prefix.as_ref());

        let asset_path = asset_path
            .strip_prefix(&format!("{}/", client_root.path))
            .context("expected client root to contain asset path")?;

        Ok(Vc::cell(
            format!(
                "{}{}",
                asset_prefix.map(|s| s.as_str()).unwrap_or("/"),
                asset_path
            )
            .into(),
        ))
    }

    #[turbo_tasks::function]
    fn chunk_root_path(&self) -> Vc<FileSystemPath> {
        self.chunk_root_path.clone().cell()
    }

    #[turbo_tasks::function]
    async fn chunk_path(
        &self,
        _asset: Option<Vc<Box<dyn Asset>>>,
        ident: Vc<AssetIdent>,
        prefix: Option<RcStr>,
        extension: RcStr,
    ) -> Result<Vc<FileSystemPath>> {
        let root_path = self.chunk_root_path.clone();
        let name = ident
            .output_name(self.root_path.clone(), prefix, extension)
            .owned()
            .await?;
        Ok(root_path.join(&name)?.cell())
    }

    #[turbo_tasks::function]
    fn reference_chunk_source_maps(&self, _chunk: Vc<Box<dyn OutputAsset>>) -> Vc<bool> {
        Vc::cell(match self.source_maps_type {
            SourceMapsType::Full => true,
            SourceMapsType::None => false,
        })
    }

    #[turbo_tasks::function]
    fn reference_module_source_maps(&self, _module: Vc<Box<dyn Module>>) -> Vc<bool> {
        Vc::cell(match self.source_maps_type {
            SourceMapsType::Full => true,
            SourceMapsType::None => false,
        })
    }

    #[turbo_tasks::function]
    fn should_use_file_source_map_uris(&self) -> Vc<bool> {
        Vc::cell(self.should_use_file_source_map_uris)
    }

    #[turbo_tasks::function]
    fn chunking_configs(&self) -> Result<Vc<ChunkingConfigs>> {
        Ok(Vc::cell(self.chunking_configs.iter().cloned().collect()))
    }

    #[turbo_tasks::function]
    async fn asset_path(
        &self,
        content_hash: RcStr,
        original_asset_ident: Vc<AssetIdent>,
        tag: Option<RcStr>,
    ) -> Result<Vc<FileSystemPath>> {
        let source_path = original_asset_ident.path().await?;
        let basename = source_path.file_name();
        let asset_path = match source_path.extension_ref() {
            Some(ext) => format!(
                "{basename}.{content_hash}.{ext}",
                basename = &basename[..basename.len() - ext.len() - 1],
                content_hash = &content_hash[..8]
            ),
            None => format!(
                "{basename}.{content_hash}",
                content_hash = &content_hash[..8]
            ),
        };

        let asset_root_path = tag
            .as_ref()
            .and_then(|tag| self.asset_root_paths.get(tag))
            .unwrap_or(&self.asset_root_path);

        Ok(asset_root_path.join(&asset_path)?.cell())
    }

    #[turbo_tasks::function]
    async fn chunk_group(
        self: ResolvedVc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
        availability_info: AvailabilityInfo,
    ) -> Result<Vc<ChunkGroupResult>> {
        let span = tracing::info_span!("chunking", name = display(ident.to_string().await?));
        async move {
            let modules = chunk_group.entries();
            let MakeChunkGroupResult {
                chunks,
                referenced_output_assets,
                availability_info,
            } = make_chunk_group(
                modules,
                module_graph,
                ResolvedVc::upcast(self),
                availability_info,
            )
            .await?;

            let assets = chunks
                .iter()
                .map(|chunk| self.generate_chunk(**chunk).to_resolved())
                .try_join()
                .await?;

            Ok(ChunkGroupResult {
                assets: ResolvedVc::cell(assets),
                referenced_assets: ResolvedVc::cell(referenced_output_assets),
                availability_info,
            }
            .cell())
        }
        .instrument(span)
        .await
    }

    #[turbo_tasks::function]
    pub async fn entry_chunk_group(
        self: ResolvedVc<Self>,
        path: FileSystemPath,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        extra_referenced_assets: Vc<OutputAssets>,
        availability_info: AvailabilityInfo,
    ) -> Result<Vc<EntryChunkGroupResult>> {
        let span = tracing::info_span!(
            "chunking",
            name = display(path.value_to_string().await?),
            chunking_type = "entry",
        );
        async move {
            let evaluatable_assets_ref = evaluatable_assets.await?;
            let entries = evaluatable_assets_ref
                .iter()
                .map(|&asset| ResolvedVc::upcast::<Box<dyn Module>>(asset));

            let MakeChunkGroupResult {
                chunks,
                mut referenced_output_assets,
                availability_info,
            } = make_chunk_group(
                entries,
                module_graph,
                ResolvedVc::upcast(self),
                availability_info,
            )
            .await?;

            let extra_chunks = extra_chunks.await?;
            let mut other_chunks = chunks
                .iter()
                .map(|chunk| self.generate_chunk(**chunk).to_resolved())
                .try_join()
                .await?;
            other_chunks.extend(extra_chunks.iter().copied());

            referenced_output_assets.extend(extra_referenced_assets.await?.iter().copied());

            let Some(module) = ResolvedVc::try_sidecast(*evaluatable_assets_ref.last().unwrap())
            else {
                bail!("module must be placeable in an ecmascript chunk");
            };

            let asset = ResolvedVc::upcast(
                EcmascriptBuildNodeEntryChunk::new(
                    path,
                    Vc::cell(other_chunks),
                    evaluatable_assets,
                    *module,
                    Vc::cell(referenced_output_assets),
                    module_graph,
                    *self,
                )
                .to_resolved()
                .await?,
            );

            Ok(EntryChunkGroupResult {
                asset,
                availability_info,
            }
            .cell())
        }
        .instrument(span)
        .await
    }

    #[turbo_tasks::function]
    fn evaluated_chunk_group(
        self: Vc<Self>,
        _ident: Vc<AssetIdent>,
        _chunk_group: ChunkGroup,
        _module_graph: Vc<ModuleGraph>,
        _availability_info: AvailabilityInfo,
    ) -> Result<Vc<ChunkGroupResult>> {
        bail!("the Node.js chunking context does not support evaluated chunk groups")
    }

    #[turbo_tasks::function]
    fn chunk_item_id_from_ident(&self, ident: Vc<AssetIdent>) -> Vc<ModuleId> {
        self.module_id_strategy.get_module_id(ident)
    }

    #[turbo_tasks::function]
    async fn async_loader_chunk_item(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
        module_graph: Vc<ModuleGraph>,
        availability_info: AvailabilityInfo,
    ) -> Result<Vc<Box<dyn ChunkItem>>> {
        Ok(if self.await?.manifest_chunks {
            let manifest_asset =
                ManifestAsyncModule::new(module, module_graph, Vc::upcast(self), availability_info);
            Vc::upcast(ManifestLoaderChunkItem::new(
                manifest_asset,
                module_graph,
                Vc::upcast(self),
            ))
        } else {
            let module = AsyncLoaderModule::new(module, Vc::upcast(self), availability_info);
            module.as_chunk_item(module_graph, Vc::upcast(self))
        })
    }

    #[turbo_tasks::function]
    async fn async_loader_chunk_item_id(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
    ) -> Result<Vc<ModuleId>> {
        Ok(if self.await?.manifest_chunks {
            self.chunk_item_id_from_ident(ManifestLoaderChunkItem::asset_ident_for(module))
        } else {
            self.chunk_item_id_from_ident(AsyncLoaderModule::asset_ident_for(module))
        })
    }

    #[turbo_tasks::function]
    async fn module_export_usage(
        self: Vc<Self>,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<ModuleExportUsage>> {
        if let Some(export_usage) = self.await?.export_usage {
            Ok(export_usage.await?.used_exports(module).await?)
        } else {
            // In development mode, we don't have export usage info, so we assume all exports are
            // used.
            Ok(ModuleExportUsage::all())
        }
    }

    #[turbo_tasks::function]
    fn debug_ids_enabled(&self) -> Vc<bool> {
        Vc::cell(self.debug_ids)
    }
}
