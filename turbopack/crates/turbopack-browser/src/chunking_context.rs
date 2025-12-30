use anyhow::{Context, Result, bail};
use bincode::{Decode, Encode};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ResolvedVc, TaskInput, Upcast, Vc, trace::TraceRawVcs,
};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{DeterministicHash, hash_xxh3_hash64};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkGroupResult, ChunkItem, ChunkType, ChunkableModule, ChunkingConfig, ChunkingConfigs,
        ChunkingContext, EntryChunkGroupResult, EvaluatableAssets, MinifyType, ModuleId,
        SourceMapSourceType, SourceMapsType,
        availability_info::AvailabilityInfo,
        module_id_strategies::{DevModuleIdStrategy, ModuleIdStrategy},
    },
    environment::Environment,
    ident::AssetIdent,
    module::Module,
    module_graph::{
        ModuleGraph,
        binding_usage_info::{BindingUsageInfo, ModuleExportUsage},
        chunk_group_info::ChunkGroup,
    },
    output::{OutputAsset, OutputAssets},
    reference::ModuleReference,
};
use turbopack_ecmascript_runtime::{ChunkSuffix, RuntimeType};

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
    TraceRawVcs,
    DeterministicHash,
    NonLocalValue,
    Encode,
    Decode,
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

    pub fn source_map_source_type(mut self, source_map_source_type: SourceMapSourceType) -> Self {
        self.chunking_context.source_map_source_type = source_map_source_type;
        self
    }

    pub fn tracing(mut self, enable_tracing: bool) -> Self {
        self.chunking_context.enable_tracing = enable_tracing;
        self
    }

    pub fn nested_async_availability(mut self, enable_nested_async_availability: bool) -> Self {
        self.chunking_context.enable_nested_async_availability = enable_nested_async_availability;
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

    pub fn chunk_suffix(mut self, chunk_suffix: ResolvedVc<ChunkSuffix>) -> Self {
        self.chunking_context.chunk_suffix = Some(chunk_suffix);
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

    pub fn export_usage(mut self, export_usage: Option<ResolvedVc<BindingUsageInfo>>) -> Self {
        self.chunking_context.export_usage = export_usage;
        self
    }

    pub fn unused_references(
        mut self,
        unused_references: Option<ResolvedVc<BindingUsageInfo>>,
    ) -> Self {
        self.chunking_context.unused_references = unused_references;
        self
    }

    pub fn debug_ids(mut self, debug_ids: bool) -> Self {
        self.chunking_context.debug_ids = debug_ids;
        self
    }

    pub fn should_use_absolute_url_references(
        mut self,
        should_use_absolute_url_references: bool,
    ) -> Self {
        self.chunking_context.should_use_absolute_url_references =
            should_use_absolute_url_references;
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
    /// The strategy to use for generating source map source uris
    source_map_source_type: SourceMapSourceType,
    /// This path is used to compute the url to request chunks from
    output_root: FileSystemPath,
    /// The relative path from the output_root to the root_path.
    output_root_to_root_path: RcStr,
    /// This path is used to compute the url to request assets from
    client_root: FileSystemPath,
    /// This path is used to compute the url to request chunks or assets from
    #[bincode(with = "turbo_bincode::indexmap")]
    client_roots: FxIndexMap<RcStr, FileSystemPath>,
    /// Chunks are placed at this path
    chunk_root_path: FileSystemPath,
    /// Static assets are placed at this path
    asset_root_path: FileSystemPath,
    /// Static assets are placed at this path
    #[bincode(with = "turbo_bincode::indexmap")]
    asset_root_paths: FxIndexMap<RcStr, FileSystemPath>,
    /// Base path that will be prepended to all chunk URLs when loading them.
    /// This path will not appear in chunk paths or chunk data.
    chunk_base_path: Option<RcStr>,
    /// Suffix that will be appended to all chunk URLs when loading them.
    /// This path will not appear in chunk paths or chunk data.
    chunk_suffix: Option<ResolvedVc<ChunkSuffix>>,
    /// URL prefix that will be prepended to all static asset URLs when loading
    /// them.
    asset_base_path: Option<RcStr>,
    /// URL prefix that will be prepended to all static asset URLs when loading
    /// them.
    #[bincode(with = "turbo_bincode::indexmap")]
    asset_base_paths: FxIndexMap<RcStr, RcStr>,
    /// Enable HMR for this chunking
    enable_hot_module_replacement: bool,
    /// Enable tracing for this chunking
    enable_tracing: bool,
    /// Enable nested async availability for this chunking
    enable_nested_async_availability: bool,
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
    export_usage: Option<ResolvedVc<BindingUsageInfo>>,
    /// Which references are unused and should be skipped (e.g. during codegen).
    unused_references: Option<ResolvedVc<BindingUsageInfo>>,
    /// The chunking configs
    chunking_configs: Vec<(ResolvedVc<Box<dyn ChunkType>>, ChunkingConfig)>,
    /// Whether to use absolute URLs for static assets (e.g. in CSS: `url("/absolute/path")`)
    should_use_absolute_url_references: bool,
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
                source_map_source_type: SourceMapSourceType::TurbopackUri,
                asset_root_path,
                asset_root_paths: Default::default(),
                chunk_base_path: None,
                chunk_suffix: None,
                asset_base_path: None,
                asset_base_paths: Default::default(),
                enable_hot_module_replacement: false,
                enable_tracing: false,
                enable_nested_async_availability: false,
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
                unused_references: None,
                chunking_configs: Default::default(),
                should_use_absolute_url_references: false,
            },
        }
    }
}
// Implement the ecmascript-specific factory trait
impl turbopack_ecmascript::chunk::chunking_context_impl::EcmascriptChunkingContextExt
    for BrowserChunkingContext
{
    fn generate_chunk_from_ecmascript_chunk(
        self: Vc<Self>,
        chunk: ResolvedVc<turbopack_ecmascript::chunk::EcmascriptChunk>,
    ) -> Vc<Box<dyn OutputAsset>> {
        Vc::upcast(EcmascriptBrowserChunk::new(self, *chunk))
    }

    fn generate_evaluate_chunk(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        other_chunks: Vc<OutputAssets>,
        evaluatable_assets: Vc<EvaluatableAssets>,
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

    async fn generate_evaluated_chunk_group_extra_assets(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        entries: Vc<EvaluatableAssets>,
        other_assets: Vc<OutputAssets>,
        input_availability_info: AvailabilityInfo,
    ) -> Result<Vec<ResolvedVc<Box<dyn OutputAsset>>>> {
        let this = self.await?;
        if this.enable_hot_module_replacement {
            let mut ident = ident;
            if let Some(input_availability_info_ident) = input_availability_info.ident().await? {
                ident = ident.with_modifier(input_availability_info_ident);
            }
            Ok(vec![
                self.generate_chunk_list_register_chunk(
                    ident,
                    entries,
                    other_assets,
                    EcmascriptDevChunkListSource::Entry,
                )
                .to_resolved()
                .await?,
            ])
        } else {
            Ok(vec![])
        }
    }

    async fn generate_chunk_group_extra_assets(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        other_assets: Vc<OutputAssets>,
        input_availability_info: AvailabilityInfo,
    ) -> Result<Vec<ResolvedVc<Box<dyn OutputAsset>>>> {
        let this = self.await?;
        if this.enable_hot_module_replacement {
            let mut ident = ident;
            if let Some(input_availability_info_ident) = input_availability_info.ident().await? {
                ident = ident.with_modifier(input_availability_info_ident);
            }
            Ok(vec![
                self.generate_chunk_list_register_chunk(
                    ident,
                    EvaluatableAssets::empty(),
                    other_assets,
                    EcmascriptDevChunkListSource::Dynamic,
                )
                .to_resolved()
                .await?,
            ])
        } else {
            Ok(vec![])
        }
    }
}

impl BrowserChunkingContext {
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
}

#[turbo_tasks::value_impl]
impl BrowserChunkingContext {
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
    pub fn chunk_suffix(&self) -> Vc<ChunkSuffix> {
        if let Some(chunk_suffix) = self.chunk_suffix {
            *chunk_suffix
        } else {
            ChunkSuffix::None.cell()
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
            SourceMapsType::Partial => true,
            SourceMapsType::None => false,
        })
    }

    #[turbo_tasks::function]
    fn reference_module_source_maps(&self, _module: Vc<Box<dyn Module>>) -> Vc<bool> {
        Vc::cell(match self.source_maps_type {
            SourceMapsType::Full => true,
            SourceMapsType::Partial => true,
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
        let path = turbopack_ecmascript::chunk::chunking_context_impl::asset_path_impl(
            &content_hash,
            &source_path,
            tag.as_ref().map(|s| s.as_str()),
            &self.asset_root_paths,
            &self.asset_root_path,
        )?;
        Ok(path.cell())
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
    fn source_map_source_type(&self) -> Vc<SourceMapSourceType> {
        self.source_map_source_type.cell()
    }

    #[turbo_tasks::function]
    fn is_tracing_enabled(&self) -> Vc<bool> {
        Vc::cell(self.enable_tracing)
    }

    #[turbo_tasks::function]
    fn is_nested_async_availability_enabled(&self) -> Vc<bool> {
        Vc::cell(self.enable_nested_async_availability)
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
    fn should_use_absolute_url_references(&self) -> Vc<bool> {
        Vc::cell(self.should_use_absolute_url_references)
    }

    #[turbo_tasks::function]
    async fn chunk_group(
        self: ResolvedVc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
        availability_info: AvailabilityInfo,
    ) -> Result<Vc<ChunkGroupResult>> {
        turbopack_ecmascript::chunk::chunking_context_impl::chunk_group_impl(
            *self,
            ident,
            chunk_group,
            module_graph,
            availability_info,
        )
        .await
    }

    #[turbo_tasks::function]
    async fn evaluated_chunk_group(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
        input_availability_info: AvailabilityInfo,
    ) -> Result<Vc<ChunkGroupResult>> {
        turbopack_ecmascript::chunk::chunking_context_impl::evaluated_chunk_group_impl(
            self,
            ident,
            chunk_group,
            module_graph,
            input_availability_info,
        )
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
        turbopack_ecmascript::chunk::chunking_context_impl::async_loader_chunk_item_impl(
            self.await?.manifest_chunks,
            module,
            module_graph,
            Vc::upcast(self),
            availability_info,
        )
        .await
    }

    #[turbo_tasks::function]
    async fn async_loader_chunk_item_id(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
    ) -> Result<Vc<ModuleId>> {
        Ok(
            turbopack_ecmascript::chunk::chunking_context_impl::async_loader_chunk_item_id_impl(
                self.await?.manifest_chunks,
                module,
                self,
            ),
        )
    }

    #[turbo_tasks::function]
    async fn module_export_usage(
        self: Vc<Self>,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<ModuleExportUsage>> {
        turbopack_ecmascript::chunk::chunking_context_impl::module_export_usage_impl(
            self.await?.export_usage,
            module,
        )
        .await
    }

    #[turbo_tasks::function]
    async fn is_reference_unused(
        self: Vc<Self>,
        reference: ResolvedVc<Box<dyn ModuleReference>>,
    ) -> Result<Vc<bool>> {
        turbopack_ecmascript::chunk::chunking_context_impl::is_reference_unused_impl(
            self.await?.unused_references,
            reference,
        )
        .await
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
