use anyhow::{bail, Context, Result};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo,
        chunk_group::{make_chunk_group, MakeChunkGroupResult},
        module_id_strategies::{DevModuleIdStrategy, ModuleIdStrategy},
        Chunk, ChunkGroupResult, ChunkItem, ChunkableModule, ChunkingContext,
        EntryChunkGroupResult, EvaluatableAssets, MinifyType, ModuleId,
    },
    environment::Environment,
    ident::AssetIdent,
    module::Module,
    output::{OutputAsset, OutputAssets},
};
use turbopack_ecmascript::{
    async_chunk::module::AsyncLoaderModule,
    chunk::EcmascriptChunk,
    manifest::{chunk_asset::ManifestAsyncModule, loader_item::ManifestLoaderChunkItem},
};
use turbopack_ecmascript_runtime::RuntimeType;

use crate::ecmascript::{
    chunk::EcmascriptDevChunk,
    evaluate::chunk::EcmascriptDevEvaluateChunk,
    list::asset::{EcmascriptDevChunkList, EcmascriptDevChunkListSource},
};

pub struct BrowserChunkingContextBuilder {
    chunking_context: BrowserChunkingContext,
}

impl BrowserChunkingContextBuilder {
    pub fn name(mut self, name: RcStr) -> Self {
        self.chunking_context.name = Some(name);
        self
    }

    pub fn hot_module_replacement(mut self) -> Self {
        self.chunking_context.enable_hot_module_replacement = true;
        self
    }

    pub fn use_file_source_map_uris(mut self) -> Self {
        self.chunking_context.should_use_file_source_map_uris = true;
        self
    }

    pub fn tracing(mut self, enable_tracing: bool) -> Self {
        self.chunking_context.enable_tracing = enable_tracing;
        self
    }

    pub fn asset_base_path(mut self, asset_base_path: ResolvedVc<Option<RcStr>>) -> Self {
        self.chunking_context.asset_base_path = asset_base_path;
        self
    }

    pub fn chunk_base_path(mut self, chunk_base_path: ResolvedVc<Option<RcStr>>) -> Self {
        self.chunking_context.chunk_base_path = chunk_base_path;
        self
    }

    pub fn reference_chunk_source_maps(mut self, source_maps: bool) -> Self {
        self.chunking_context.reference_chunk_source_maps = source_maps;
        self
    }

    pub fn reference_css_chunk_source_maps(mut self, source_maps: bool) -> Self {
        self.chunking_context.reference_css_chunk_source_maps = source_maps;
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

    pub fn minify_type(mut self, minify_type: MinifyType) -> Self {
        self.chunking_context.minify_type = minify_type;
        self
    }

    pub fn module_id_strategy(
        mut self,
        module_id_strategy: ResolvedVc<Box<dyn ModuleIdStrategy>>,
    ) -> Self {
        self.chunking_context.module_id_strategy = module_id_strategy;
        self
    }

    pub fn build(self) -> Vc<BrowserChunkingContext> {
        BrowserChunkingContext::new(Value::new(self.chunking_context))
    }
}

/// A chunking context for development mode.
///
/// It uses readable filenames and module ids to improve development.
/// It also uses a chunking heuristic that is incremental and cacheable.
/// It splits "node_modules" separately as these are less likely to change
/// during development
#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash)]
pub struct BrowserChunkingContext {
    name: Option<RcStr>,
    /// This path get stripped off of chunk paths before generating output asset
    /// paths.
    context_path: ResolvedVc<FileSystemPath>,
    /// Whether to write file sources as file:// paths in source maps
    should_use_file_source_map_uris: bool,
    /// This path is used to compute the url to request chunks from
    output_root: ResolvedVc<FileSystemPath>,
    /// This path is used to compute the url to request assets from
    client_root: ResolvedVc<FileSystemPath>,
    /// Chunks are placed at this path
    chunk_root_path: ResolvedVc<FileSystemPath>,
    /// Chunks reference source maps assets
    reference_chunk_source_maps: bool,
    /// Css chunks reference source maps assets
    reference_css_chunk_source_maps: bool,
    /// Static assets are placed at this path
    asset_root_path: ResolvedVc<FileSystemPath>,
    /// Base path that will be prepended to all chunk URLs when loading them.
    /// This path will not appear in chunk paths or chunk data.
    chunk_base_path: ResolvedVc<Option<RcStr>>,
    /// URL prefix that will be prepended to all static asset URLs when loading
    /// them.
    asset_base_path: ResolvedVc<Option<RcStr>>,
    /// Enable HMR for this chunking
    enable_hot_module_replacement: bool,
    /// Enable tracing for this chunking
    enable_tracing: bool,
    /// The environment chunks will be evaluated in.
    environment: ResolvedVc<Environment>,
    /// The kind of runtime to include in the output.
    runtime_type: RuntimeType,
    /// Whether to minify resulting chunks
    minify_type: MinifyType,
    /// Whether to use manifest chunks for lazy compilation
    manifest_chunks: bool,
    /// The module id strategy to use
    module_id_strategy: ResolvedVc<Box<dyn ModuleIdStrategy>>,
}

impl BrowserChunkingContext {
    pub fn builder(
        context_path: ResolvedVc<FileSystemPath>,
        output_root: ResolvedVc<FileSystemPath>,
        client_root: ResolvedVc<FileSystemPath>,
        chunk_root_path: ResolvedVc<FileSystemPath>,
        asset_root_path: ResolvedVc<FileSystemPath>,
        environment: ResolvedVc<Environment>,
        runtime_type: RuntimeType,
    ) -> BrowserChunkingContextBuilder {
        BrowserChunkingContextBuilder {
            chunking_context: BrowserChunkingContext {
                name: None,
                context_path,
                output_root,
                client_root,
                chunk_root_path,
                should_use_file_source_map_uris: false,
                reference_chunk_source_maps: true,
                reference_css_chunk_source_maps: true,
                asset_root_path,
                chunk_base_path: ResolvedVc::cell(None),
                asset_base_path: ResolvedVc::cell(None),
                enable_hot_module_replacement: false,
                enable_tracing: false,
                environment,
                runtime_type,
                minify_type: MinifyType::NoMinify,
                manifest_chunks: false,
                module_id_strategy: ResolvedVc::upcast(DevModuleIdStrategy::new_resolved()),
            },
        }
    }
}

impl BrowserChunkingContext {
    /// Returns the kind of runtime to include in output chunks.
    ///
    /// This is defined directly on `BrowserChunkingContext` so it is zero-cost
    /// when `RuntimeType` has a single variant.
    pub fn runtime_type(&self) -> RuntimeType {
        self.runtime_type
    }

    /// Returns the asset base path.
    pub fn chunk_base_path(&self) -> Vc<Option<RcStr>> {
        *self.chunk_base_path
    }

    /// Returns the minify type.
    pub fn minify_type(&self) -> MinifyType {
        self.minify_type
    }
}

#[turbo_tasks::value_impl]
impl BrowserChunkingContext {
    #[turbo_tasks::function]
    fn new(this: Value<BrowserChunkingContext>) -> Vc<Self> {
        this.into_value().cell()
    }

    #[turbo_tasks::function]
    fn generate_evaluate_chunk(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        other_chunks: Vc<OutputAssets>,
        evaluatable_assets: Vc<EvaluatableAssets>,
    ) -> Vc<Box<dyn OutputAsset>> {
        Vc::upcast(EcmascriptDevEvaluateChunk::new(
            self,
            ident,
            other_chunks,
            evaluatable_assets,
        ))
    }

    #[turbo_tasks::function]
    fn generate_chunk_list_register_chunk(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        other_chunks: Vc<OutputAssets>,
        source: Value<EcmascriptDevChunkListSource>,
    ) -> Vc<Box<dyn OutputAsset>> {
        Vc::upcast(EcmascriptDevChunkList::new(
            self,
            ident,
            evaluatable_assets,
            other_chunks,
            source,
        ))
    }

    #[turbo_tasks::function]
    async fn generate_chunk(
        self: Vc<Self>,
        chunk: Vc<Box<dyn Chunk>>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        Ok(
            if let Some(ecmascript_chunk) =
                Vc::try_resolve_downcast_type::<EcmascriptChunk>(chunk).await?
            {
                Vc::upcast(EcmascriptDevChunk::new(self, ecmascript_chunk))
            } else if let Some(output_asset) =
                Vc::try_resolve_sidecast::<Box<dyn OutputAsset>>(chunk).await?
            {
                output_asset
            } else {
                bail!("Unable to generate output asset for chunk");
            },
        )
    }
}

#[turbo_tasks::value_impl]
impl ChunkingContext for BrowserChunkingContext {
    #[turbo_tasks::function]
    fn name(&self) -> Vc<RcStr> {
        if let Some(name) = &self.name {
            Vc::cell(name.clone())
        } else {
            Vc::cell("unknown".into())
        }
    }

    #[turbo_tasks::function]
    fn context_path(&self) -> Vc<FileSystemPath> {
        *self.context_path
    }

    #[turbo_tasks::function]
    fn output_root(&self) -> Vc<FileSystemPath> {
        *self.output_root
    }

    #[turbo_tasks::function]
    fn environment(&self) -> Vc<Environment> {
        *self.environment
    }

    #[turbo_tasks::function]
    async fn chunk_path(
        &self,
        ident: Vc<AssetIdent>,
        extension: RcStr,
    ) -> Result<Vc<FileSystemPath>> {
        let root_path = self.chunk_root_path;
        let name = ident.output_name(*self.context_path, extension).await?;
        Ok(root_path.join(name.clone_value()))
    }

    #[turbo_tasks::function]
    async fn asset_url(self: Vc<Self>, ident: Vc<AssetIdent>) -> Result<Vc<RcStr>> {
        let this = self.await?;
        let asset_path = ident.path().await?.to_string();
        let asset_path = asset_path
            .strip_prefix(&format!("{}/", this.client_root.await?.path))
            .context("expected asset_path to contain client_root")?;

        Ok(Vc::cell(
            format!(
                "{}{}",
                this.asset_base_path
                    .await?
                    .as_ref()
                    .map(|s| s.as_str())
                    .unwrap_or("/"),
                asset_path
            )
            .into(),
        ))
    }

    #[turbo_tasks::function]
    async fn reference_chunk_source_maps(
        &self,
        chunk: Vc<Box<dyn OutputAsset>>,
    ) -> Result<Vc<bool>> {
        let mut source_maps = self.reference_chunk_source_maps;
        let path = chunk.ident().path().await?;
        let extension = path.extension_ref().unwrap_or_default();
        #[allow(clippy::single_match, reason = "future extensions")]
        match extension {
            ".css" => {
                source_maps = self.reference_css_chunk_source_maps;
            }
            _ => {}
        }
        Ok(Vc::cell(source_maps))
    }

    #[turbo_tasks::function]
    async fn asset_path(
        &self,
        content_hash: RcStr,
        original_asset_ident: Vc<AssetIdent>,
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
        Ok(self.asset_root_path.join(asset_path.into()))
    }

    #[turbo_tasks::function]
    fn is_hot_module_replacement_enabled(&self) -> Vc<bool> {
        Vc::cell(self.enable_hot_module_replacement)
    }

    #[turbo_tasks::function]
    fn should_use_file_source_map_uris(&self) -> Vc<bool> {
        Vc::cell(self.should_use_file_source_map_uris)
    }

    #[turbo_tasks::function]
    fn is_tracing_enabled(&self) -> Vc<bool> {
        Vc::cell(self.enable_tracing)
    }

    #[turbo_tasks::function]
    async fn chunk_group(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        module: ResolvedVc<Box<dyn ChunkableModule>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<ChunkGroupResult>> {
        let span = tracing::info_span!("chunking", ident = ident.to_string().await?.to_string());
        async move {
            let this = self.await?;
            let input_availability_info = availability_info.into_value();
            let MakeChunkGroupResult {
                chunks,
                availability_info,
            } = make_chunk_group(
                Vc::upcast(self),
                [ResolvedVc::upcast(module)],
                input_availability_info,
            )
            .await?;

            let mut assets = chunks
                .iter()
                .map(|chunk| self.generate_chunk(**chunk).to_resolved())
                .try_join()
                .await?;

            if this.enable_hot_module_replacement {
                let mut ident = ident;
                match input_availability_info {
                    AvailabilityInfo::Root => {}
                    AvailabilityInfo::Untracked => {
                        ident = ident.with_modifier(Vc::cell("untracked".into()));
                    }
                    AvailabilityInfo::Complete {
                        available_chunk_items,
                    } => {
                        ident = ident.with_modifier(Vc::cell(
                            available_chunk_items.hash().await?.to_string().into(),
                        ));
                    }
                }
                assets.push(
                    self.generate_chunk_list_register_chunk(
                        ident,
                        EvaluatableAssets::empty(),
                        Vc::cell(assets.clone()),
                        Value::new(EcmascriptDevChunkListSource::Dynamic),
                    )
                    .to_resolved()
                    .await?,
                );
            }

            Ok(ChunkGroupResult {
                assets: ResolvedVc::cell(assets),
                availability_info,
            }
            .cell())
        }
        .instrument(span)
        .await
    }

    #[turbo_tasks::function]
    async fn evaluated_chunk_group(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<ChunkGroupResult>> {
        let span = {
            let ident = ident.to_string().await?.to_string();
            tracing::info_span!("chunking", chunking_type = "evaluated", ident = ident)
        };
        async move {
            let this = self.await?;
            let availability_info = availability_info.into_value();

            let evaluatable_assets_ref = evaluatable_assets.await?;

            let entries = evaluatable_assets_ref
                .iter()
                .map(|&evaluatable| ResolvedVc::upcast(evaluatable));

            let MakeChunkGroupResult {
                chunks,
                availability_info,
            } = make_chunk_group(Vc::upcast(self), entries, availability_info).await?;

            let mut assets: Vec<ResolvedVc<Box<dyn OutputAsset>>> = chunks
                .iter()
                .map(|chunk| self.generate_chunk(**chunk).to_resolved())
                .try_join()
                .await?;

            let other_assets = Vc::cell(assets.clone());

            if this.enable_hot_module_replacement {
                assets.push(
                    self.generate_chunk_list_register_chunk(
                        ident,
                        evaluatable_assets,
                        other_assets,
                        Value::new(EcmascriptDevChunkListSource::Entry),
                    )
                    .to_resolved()
                    .await?,
                );
            }

            assets.push(
                self.generate_evaluate_chunk(ident, other_assets, evaluatable_assets)
                    .to_resolved()
                    .await?,
            );

            Ok(ChunkGroupResult {
                assets: ResolvedVc::cell(assets),
                availability_info,
            }
            .cell())
        }
        .instrument(span)
        .await
    }

    #[turbo_tasks::function]
    fn entry_chunk_group(
        self: Vc<Self>,
        _path: Vc<FileSystemPath>,
        _module: Vc<Box<dyn Module>>,
        _evaluatable_assets: Vc<EvaluatableAssets>,
        _extra_chunks: Vc<OutputAssets>,
        _availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<EntryChunkGroupResult>> {
        bail!("Browser chunking context does not support entry chunk groups")
    }

    #[turbo_tasks::function]
    fn chunk_item_id_from_ident(&self, ident: Vc<AssetIdent>) -> Vc<ModuleId> {
        self.module_id_strategy.get_module_id(ident)
    }

    #[turbo_tasks::function]
    async fn async_loader_chunk_item(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<Box<dyn ChunkItem>>> {
        Ok(if self.await?.manifest_chunks {
            let manifest_asset =
                ManifestAsyncModule::new(module, Vc::upcast(self), availability_info);
            Vc::upcast(ManifestLoaderChunkItem::new(
                manifest_asset,
                Vc::upcast(self),
            ))
        } else {
            let module = AsyncLoaderModule::new(module, Vc::upcast(self), availability_info);
            Vc::upcast(module.as_chunk_item(Vc::upcast(self)))
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
}
