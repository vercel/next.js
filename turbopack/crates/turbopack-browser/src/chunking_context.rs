use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ResolvedVc, TaskInput, TryJoinIterExt, Upcast, ValueToString, Vc,
    trace::TraceRawVcs,
};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{DeterministicHash, hash_xxh3_hash64};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        Chunk, ChunkGroupResult, ChunkItem, ChunkType, ChunkableModule, ChunkingConfig,
        ChunkingConfigs, ChunkingContext, EntryChunkGroupResult, EvaluatableAsset,
        EvaluatableAssets, MinifyType, ModuleId, SourceMapsType,
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

use crate::ecmascript::{
    chunk::EcmascriptBrowserChunk,
    evaluate::chunk::EcmascriptBrowserEvaluateChunk,
    list::asset::{EcmascriptDevChunkList, EcmascriptDevChunkListSource},
};

#[turbo_tasks::value]
#[derive(Debug, Clone, Copy, Hash, TaskInput)]
pub enum CurrentChunkMethod {
    StringLiteral,
    DocumentCurrentScript,
}

pub const CURRENT_CHUNK_METHOD_DOCUMENT_CURRENT_SCRIPT_EXPR: &str =
    "typeof document === \"object\" ? document.currentScript : undefined";

#[derive(
    Debug,
    TaskInput,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Hash,
    Serialize,
    Deserialize,
    TraceRawVcs,
    DeterministicHash,
    NonLocalValue,
)]
pub enum ContentHashing {
    /// Direct content hashing: Embeds the chunk content hash directly into the referencing chunk.
    /// Benefit: No hash manifest needed.
    /// Downside: Causes cascading hash invalidation.
    Direct {
        /// The length of the content hash in hex chars. Anything lower than 8 is not recommended
        /// due to the high risk of collisions.
        length: u8,
    },
}

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

    pub fn asset_base_path(mut self, asset_base_path: Option<RcStr>) -> Self {
        self.chunking_context.asset_base_path = asset_base_path;
        self
    }

    pub fn chunk_base_path(mut self, chunk_base_path: Option<RcStr>) -> Self {
        self.chunking_context.chunk_base_path = chunk_base_path;
        self
    }

    pub fn chunk_suffix_path(mut self, chunk_suffix_path: ResolvedVc<Option<RcStr>>) -> Self {
        self.chunking_context.chunk_suffix_path = Some(chunk_suffix_path);
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

    pub fn source_maps(mut self, source_maps: SourceMapsType) -> Self {
        self.chunking_context.source_maps_type = source_maps;
        self
    }

    pub fn current_chunk_method(mut self, method: CurrentChunkMethod) -> Self {
        self.chunking_context.current_chunk_method = method;
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

    pub fn debug_ids(mut self, debug_ids: bool) -> Self {
        self.chunking_context.debug_ids = debug_ids;
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

    pub fn asset_base_path_override(mut self, tag: RcStr, path: RcStr) -> Self {
        self.chunking_context.asset_base_paths.insert(tag, path);
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

    pub fn use_content_hashing(mut self, content_hashing: ContentHashing) -> Self {
        self.chunking_context.content_hashing = Some(content_hashing);
        self
    }

    pub fn build(self) -> Vc<BrowserChunkingContext> {
        BrowserChunkingContext::cell(self.chunking_context)
    }
}

/// A chunking context for development mode.
///
/// It uses readable filenames and module ids to improve development.
/// It also uses a chunking heuristic that is incremental and cacheable.
/// It splits "node_modules" separately as these are less likely to change
/// during development
#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub struct BrowserChunkingContext {
    name: Option<RcStr>,
    /// The root path of the project
    root_path: FileSystemPath,
    /// Whether to write file sources as file:// paths in source maps
    should_use_file_source_map_uris: bool,
    /// This path is used to compute the url to request chunks from
    output_root: FileSystemPath,
    /// The relative path from the output_root to the root_path.
    output_root_to_root_path: RcStr,
    /// This path is used to compute the url to request assets from
    client_root: FileSystemPath,
    /// This path is used to compute the url to request chunks or assets from
    client_roots: FxIndexMap<RcStr, FileSystemPath>,
    /// Chunks are placed at this path
    chunk_root_path: FileSystemPath,
    /// Static assets are placed at this path
    asset_root_path: FileSystemPath,
    /// Static assets are placed at this path
    asset_root_paths: FxIndexMap<RcStr, FileSystemPath>,
    /// Base path that will be prepended to all chunk URLs when loading them.
    /// This path will not appear in chunk paths or chunk data.
    chunk_base_path: Option<RcStr>,
    /// Suffix path that will be appended to all chunk URLs when loading them.
    /// This path will not appear in chunk paths or chunk data.
    chunk_suffix_path: Option<ResolvedVc<Option<RcStr>>>,
    /// URL prefix that will be prepended to all static asset URLs when loading
    /// them.
    asset_base_path: Option<RcStr>,
    /// URL prefix that will be prepended to all static asset URLs when loading
    /// them.
    asset_base_paths: FxIndexMap<RcStr, RcStr>,
    /// Enable HMR for this chunking
    enable_hot_module_replacement: bool,
    /// Enable tracing for this chunking
    enable_tracing: bool,
    /// Enable module merging
    enable_module_merging: bool,
    /// Enable dynamic chunk content loading.
    enable_dynamic_chunk_content_loading: bool,
    /// Enable debug IDs for chunks and source maps.
    debug_ids: bool,
    /// The environment chunks will be evaluated in.
    environment: ResolvedVc<Environment>,
    /// The kind of runtime to include in the output.
    runtime_type: RuntimeType,
    /// Whether to minify resulting chunks
    minify_type: MinifyType,
    /// Whether content hashing is enabled.
    content_hashing: Option<ContentHashing>,
    /// Whether to generate source maps
    source_maps_type: SourceMapsType,
    /// Method to use when figuring out the current chunk src
    current_chunk_method: CurrentChunkMethod,
    /// Whether to use manifest chunks for lazy compilation
    manifest_chunks: bool,
    /// The module id strategy to use
    module_id_strategy: ResolvedVc<Box<dyn ModuleIdStrategy>>,
    /// The module export usage info, if available.
    export_usage: Option<ResolvedVc<ExportUsageInfo>>,
    /// The chunking configs
    chunking_configs: Vec<(ResolvedVc<Box<dyn ChunkType>>, ChunkingConfig)>,
}

impl BrowserChunkingContext {
    pub fn builder(
        root_path: FileSystemPath,
        output_root: FileSystemPath,
        output_root_to_root_path: RcStr,
        client_root: FileSystemPath,
        chunk_root_path: FileSystemPath,
        asset_root_path: FileSystemPath,
        environment: ResolvedVc<Environment>,
        runtime_type: RuntimeType,
    ) -> BrowserChunkingContextBuilder {
        BrowserChunkingContextBuilder {
            chunking_context: BrowserChunkingContext {
                name: None,
                root_path,
                output_root,
                output_root_to_root_path,
                client_root,
                client_roots: Default::default(),
                chunk_root_path,
                should_use_file_source_map_uris: false,
                asset_root_path,
                asset_root_paths: Default::default(),
                chunk_base_path: None,
                chunk_suffix_path: None,
                asset_base_path: None,
                asset_base_paths: Default::default(),
                enable_hot_module_replacement: false,
                enable_tracing: false,
                enable_module_merging: false,
                enable_dynamic_chunk_content_loading: false,
                debug_ids: false,
                environment,
                runtime_type,
                minify_type: MinifyType::NoMinify,
                content_hashing: None,
                source_maps_type: SourceMapsType::Full,
                current_chunk_method: CurrentChunkMethod::StringLiteral,
                manifest_chunks: false,
                module_id_strategy: ResolvedVc::upcast(DevModuleIdStrategy::new_resolved()),
                export_usage: None,
                chunking_configs: Default::default(),
            },
        }
    }
}

#[turbo_tasks::value_impl]
impl BrowserChunkingContext {
    #[turbo_tasks::function]
    fn generate_evaluate_chunk(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        other_chunks: Vc<OutputAssets>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        // TODO(sokra) remove this argument and pass chunk items instead
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<Box<dyn OutputAsset>> {
        Vc::upcast(EcmascriptBrowserEvaluateChunk::new(
            self,
            ident,
            other_chunks,
            evaluatable_assets,
            module_graph,
        ))
    }

    #[turbo_tasks::function]
    fn generate_chunk_list_register_chunk(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        other_chunks: Vc<OutputAssets>,
        source: EcmascriptDevChunkListSource,
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
        chunk: ResolvedVc<Box<dyn Chunk>>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        Ok(
            if let Some(ecmascript_chunk) = ResolvedVc::try_downcast_type::<EcmascriptChunk>(chunk)
            {
                Vc::upcast(EcmascriptBrowserChunk::new(self, *ecmascript_chunk))
            } else if let Some(output_asset) =
                ResolvedVc::try_sidecast::<Box<dyn OutputAsset>>(chunk)
            {
                *output_asset
            } else {
                bail!("Unable to generate output asset for chunk");
            },
        )
    }

    #[turbo_tasks::function]
    pub fn current_chunk_method(&self) -> Vc<CurrentChunkMethod> {
        self.current_chunk_method.cell()
    }

    /// Returns the kind of runtime to include in output chunks.
    ///
    /// This is defined directly on `BrowserChunkingContext` so it is zero-cost
    /// when `RuntimeType` has a single variant.
    #[turbo_tasks::function]
    pub fn runtime_type(&self) -> Vc<RuntimeType> {
        self.runtime_type.cell()
    }

    /// Returns the asset base path.
    #[turbo_tasks::function]
    pub fn chunk_base_path(&self) -> Vc<Option<RcStr>> {
        Vc::cell(self.chunk_base_path.clone())
    }

    /// Returns the asset suffix path.
    #[turbo_tasks::function]
    pub fn chunk_suffix_path(&self) -> Vc<Option<RcStr>> {
        if let Some(chunk_suffix_path) = self.chunk_suffix_path {
            *chunk_suffix_path
        } else {
            Vc::cell(None)
        }
    }

    /// Returns the source map type.
    #[turbo_tasks::function]
    pub fn source_maps_type(&self) -> Vc<SourceMapsType> {
        self.source_maps_type.cell()
    }

    /// Returns the minify type.
    #[turbo_tasks::function]
    pub fn minify_type(&self) -> Vc<MinifyType> {
        self.minify_type.cell()
    }

    /// Returns the chunk path information.
    #[turbo_tasks::function]
    fn chunk_path_info(&self) -> Vc<ChunkPathInfo> {
        ChunkPathInfo {
            root_path: self.root_path.clone(),
            chunk_root_path: self.chunk_root_path.clone(),
            content_hashing: self.content_hashing,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkingContext for BrowserChunkingContext {
    #[turbo_tasks::function]
    fn name(&self) -> Vc<RcStr> {
        if let Some(name) = &self.name {
            Vc::cell(name.clone())
        } else {
            Vc::cell(rcstr!("unknown"))
        }
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
    fn chunk_root_path(&self) -> Vc<FileSystemPath> {
        self.chunk_root_path.clone().cell()
    }

    #[turbo_tasks::function]
    async fn chunk_path(
        self: Vc<Self>,
        asset: Option<Vc<Box<dyn Asset>>>,
        ident: Vc<AssetIdent>,
        prefix: Option<RcStr>,
        extension: RcStr,
    ) -> Result<Vc<FileSystemPath>> {
        debug_assert!(
            extension.starts_with("."),
            "`extension` should include the leading '.', got '{extension}'"
        );
        let ChunkPathInfo {
            chunk_root_path,
            content_hashing,
            root_path,
        } = &*self.chunk_path_info().await?;
        let name = match *content_hashing {
            None => {
                ident
                    .output_name(root_path.clone(), prefix, extension)
                    .owned()
                    .await?
            }
            Some(ContentHashing::Direct { length }) => {
                let Some(asset) = asset else {
                    bail!("chunk_path requires an asset when content hashing is enabled");
                };
                let content = asset.content().await?;
                if let AssetContent::File(file) = &*content {
                    let hash = hash_xxh3_hash64(&file.await?);
                    let length = length as usize;
                    if let Some(prefix) = prefix {
                        format!("{prefix}-{hash:0length$x}{extension}").into()
                    } else {
                        format!("{hash:0length$x}{extension}").into()
                    }
                } else {
                    bail!(
                        "chunk_path requires an asset with file content when content hashing is \
                         enabled"
                    );
                }
            }
        };
        Ok(chunk_root_path.join(&name)?.cell())
    }

    #[turbo_tasks::function]
    async fn asset_url(&self, ident: FileSystemPath, tag: Option<RcStr>) -> Result<Vc<RcStr>> {
        let asset_path = ident.to_string();

        let client_root = tag
            .as_ref()
            .and_then(|tag| self.client_roots.get(tag))
            .unwrap_or(&self.client_root);

        let asset_base_path = tag
            .as_ref()
            .and_then(|tag| self.asset_base_paths.get(tag))
            .or(self.asset_base_path.as_ref());

        let asset_path = asset_path
            .strip_prefix(&format!("{}/", client_root.path))
            .context("expected asset_path to contain client_root")?;

        Ok(Vc::cell(
            format!(
                "{}{}",
                asset_base_path.map(|s| s.as_str()).unwrap_or("/"),
                asset_path
            )
            .into(),
        ))
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
    fn is_hot_module_replacement_enabled(&self) -> Vc<bool> {
        Vc::cell(self.enable_hot_module_replacement)
    }

    #[turbo_tasks::function]
    fn chunking_configs(&self) -> Result<Vc<ChunkingConfigs>> {
        Ok(Vc::cell(self.chunking_configs.iter().cloned().collect()))
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
    async fn chunk_group(
        self: ResolvedVc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
        availability_info: AvailabilityInfo,
    ) -> Result<Vc<ChunkGroupResult>> {
        let span = tracing::info_span!("chunking", name = display(ident.to_string().await?));
        async move {
            let this = self.await?;
            let entries = chunk_group.entries();
            let input_availability_info = availability_info;
            let MakeChunkGroupResult {
                chunks,
                referenced_output_assets,
                availability_info,
            } = make_chunk_group(
                entries,
                module_graph,
                ResolvedVc::upcast(self),
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
                        ident = ident.with_modifier(rcstr!("untracked"));
                    }
                    AvailabilityInfo::Complete { available_modules } => {
                        ident =
                            ident.with_modifier(available_modules.hash().await?.to_string().into());
                    }
                }
                let other_assets = Vc::cell(assets.clone());
                assets.push(
                    self.generate_chunk_list_register_chunk(
                        ident,
                        EvaluatableAssets::empty(),
                        other_assets,
                        EcmascriptDevChunkListSource::Dynamic,
                    )
                    .to_resolved()
                    .await?,
                );
            }

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
    async fn evaluated_chunk_group(
        self: ResolvedVc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
        input_availability_info: AvailabilityInfo,
    ) -> Result<Vc<ChunkGroupResult>> {
        let span = tracing::info_span!(
            "chunking",
            name = display(ident.to_string().await?),
            chunking_type = "evaluated",
        );
        async move {
            let this = self.await?;
            let entries = chunk_group.entries();
            let MakeChunkGroupResult {
                chunks,
                referenced_output_assets,
                availability_info,
            } = make_chunk_group(
                entries,
                module_graph,
                ResolvedVc::upcast(self),
                input_availability_info,
            )
            .await?;

            let mut assets: Vec<ResolvedVc<Box<dyn OutputAsset>>> = chunks
                .iter()
                .map(|chunk| self.generate_chunk(**chunk).to_resolved())
                .try_join()
                .await?;

            let other_assets = Vc::cell(assets.clone());

            let entries = Vc::cell(
                chunk_group
                    .entries()
                    .map(|m| {
                        ResolvedVc::try_downcast::<Box<dyn EvaluatableAsset>>(m)
                            .context("evaluated_chunk_group entries must be evaluatable assets")
                    })
                    .collect::<Result<Vec<_>>>()?,
            );

            if this.enable_hot_module_replacement {
                let mut ident = ident;
                match input_availability_info {
                    AvailabilityInfo::Root => {}
                    AvailabilityInfo::Untracked => {
                        ident = ident.with_modifier(rcstr!("untracked"));
                    }
                    AvailabilityInfo::Complete { available_modules } => {
                        ident =
                            ident.with_modifier(available_modules.hash().await?.to_string().into());
                    }
                }
                assets.push(
                    self.generate_chunk_list_register_chunk(
                        ident,
                        entries,
                        other_assets,
                        EcmascriptDevChunkListSource::Entry,
                    )
                    .to_resolved()
                    .await?,
                );
            }

            assets.push(
                self.generate_evaluate_chunk(ident, other_assets, entries, module_graph)
                    .to_resolved()
                    .await?,
            );

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
    fn entry_chunk_group(
        self: Vc<Self>,
        _path: FileSystemPath,
        _evaluatable_assets: Vc<EvaluatableAssets>,
        _module_graph: Vc<ModuleGraph>,
        _extra_chunks: Vc<OutputAssets>,
        _extra_referenced_assets: Vc<OutputAssets>,
        _availability_info: AvailabilityInfo,
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
    async fn debug_ids_enabled(self: Vc<Self>) -> Result<Vc<bool>> {
        Ok(Vc::cell(self.await?.debug_ids))
    }
}

#[turbo_tasks::value]
struct ChunkPathInfo {
    root_path: FileSystemPath,
    chunk_root_path: FileSystemPath,
    content_hashing: Option<ContentHashing>,
}
