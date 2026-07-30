use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, ResolvedVc, TryJoinIterExt, Upcast, ValueToString, ValueToStringRef, Vc,
};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        AssetSuffix, Chunk, ChunkGroupResult, ChunkItem, ChunkLoadRetry, ChunkType,
        ChunkableModule, ChunkingConfig, ChunkingConfigs, ChunkingContext, ContentHashing,
        CrossOrigin, EntryChunkGroupResult, EvaluatableAsset, EvaluatableAssets, MinifyType,
        SourceMapSourceType, SourceMapsType, UnusedReferences, UrlBehavior,
        WorkerConfigurationOptions,
        availability_info::AvailabilityInfo,
        chunk_group::{MakeChunkGroupResult, make_chunk_group},
        chunk_id_strategy::ModuleIdStrategy,
    },
    environment::{ChunkLoading, Environment},
    ident::AssetIdent,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    module::Module,
    module_graph::{
        ModuleGraph,
        binding_usage_info::{BindingUsageInfo, ModuleExportUsage},
        chunk_group_info::ChunkGroup,
    },
    output::{ExpandOutputAssetsInput, OutputAsset, OutputAssets, expand_output_assets},
};
use turbopack_ecmascript::{
    async_chunk::module::AsyncLoaderModule,
    chunk::{EcmascriptChunk, EcmascriptChunkContent, EcmascriptChunkType},
    manifest::{chunk_asset::ManifestAsyncModule, loader_module::ManifestLoaderModule},
};
use turbopack_ecmascript_runtime::RuntimeType;

use crate::ecmascript::{
    chunk::EcmascriptBrowserChunk,
    evaluate::{
        chunk::EcmascriptBrowserEvaluateChunk, runtime::EcmascriptBrowserRuntimeChunk,
        single_entry_chunk::EcmascriptBrowserSingleEntryChunk,
    },
    list::asset::{EcmascriptDevChunkList, EcmascriptDevChunkListSource},
    worker::EcmascriptBrowserWorkerEntrypoint,
};

#[turbo_tasks::value]
#[derive(Debug, Clone, Copy, Hash)]
pub enum CurrentChunkMethod {
    StringLiteral,
    DocumentCurrentScript,
}

pub const CURRENT_CHUNK_METHOD_DOCUMENT_CURRENT_SCRIPT_EXPR: &str =
    "typeof document === \"object\" ? document.currentScript : undefined";

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

    pub fn service_worker_scope_base_path(
        mut self,
        service_worker_scope_base_path: Option<RcStr>,
    ) -> Self {
        self.chunking_context.service_worker_scope_base_path = service_worker_scope_base_path;
        self
    }

    pub fn chunk_base_path(mut self, chunk_base_path: Option<RcStr>) -> Self {
        self.chunking_context.chunk_base_path = chunk_base_path;
        self
    }

    pub fn worker_asset_prefix(mut self, worker_asset_prefix: Option<RcStr>) -> Self {
        self.chunking_context.worker_asset_prefix = worker_asset_prefix;
        self
    }

    pub fn asset_suffix(mut self, asset_suffix: ResolvedVc<AssetSuffix>) -> Self {
        self.chunking_context.asset_suffix = Some(asset_suffix);
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

    pub fn module_id_strategy(mut self, module_id_strategy: ResolvedVc<ModuleIdStrategy>) -> Self {
        self.chunking_context.module_id_strategy = Some(module_id_strategy);
        self
    }

    pub fn export_usage(mut self, export_usage: Option<ResolvedVc<BindingUsageInfo>>) -> Self {
        self.chunking_context.export_usage = export_usage;
        self
    }

    pub fn unused_references(mut self, unused_references: ResolvedVc<UnusedReferences>) -> Self {
        self.chunking_context.unused_references = Some(unused_references);
        self
    }

    pub fn debug_ids(mut self, debug_ids: bool) -> Self {
        self.chunking_context.debug_ids = debug_ids;
        self
    }

    pub fn shared_runtime(mut self, shared_runtime: bool) -> Self {
        self.chunking_context.shared_runtime = shared_runtime;
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

    pub fn url_behavior_override(mut self, tag: RcStr, behavior: UrlBehavior) -> Self {
        self.chunking_context.url_behaviors.insert(tag, behavior);
        self
    }

    pub fn default_url_behavior(mut self, behavior: UrlBehavior) -> Self {
        self.chunking_context.default_url_behavior = Some(behavior);
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

    pub fn chunk_content_hashing(mut self, content_hashing: ContentHashing) -> Self {
        self.chunking_context.chunk_content_hashing = Some(content_hashing);
        self
    }

    pub fn asset_content_hashing(mut self, content_hashing: ContentHashing) -> Self {
        self.chunking_context.asset_content_hashing = content_hashing;
        self
    }

    pub fn worker_forwarded_globals(mut self, globals: Vec<RcStr>) -> Self {
        self.chunking_context
            .worker_forwarded_globals
            .extend(globals);
        self
    }

    pub fn chunk_loading_global(mut self, chunk_loading_global: RcStr) -> Self {
        self.chunking_context.chunk_loading_global = Some(chunk_loading_global);
        self
    }

    pub fn hash_salt(mut self, salt: ResolvedVc<RcStr>) -> Self {
        self.chunking_context.hash_salt = salt;
        self
    }

    pub fn cross_origin(mut self, cross_origin: CrossOrigin) -> Self {
        self.chunking_context.cross_origin = cross_origin;
        self
    }

    pub fn chunk_load_retry(mut self, chunk_load_retry: ChunkLoadRetry) -> Self {
        self.chunking_context.chunk_load_retry = chunk_load_retry;
        self
    }

    pub async fn single_chunk(mut self) -> Result<Self> {
        self.chunking_context.single_chunk = true;
        // Force every ECMAScript chunk item into a single output chunk.
        let ecmascript_ty: ResolvedVc<Box<dyn ChunkType>> =
            ResolvedVc::upcast(Vc::<EcmascriptChunkType>::default().to_resolved().await?);
        self.chunking_context.chunking_configs.push((
            ecmascript_ty,
            ChunkingConfig {
                min_chunk_size: usize::MAX,
                max_chunk_count_per_group: 1,
                max_merge_chunk_size: usize::MAX,
                ..Default::default()
            },
        ));
        Ok(self)
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
    /// Base path for Web Worker URLs (the entrypoint and the module chunks
    /// loaded inside the worker). When `Some`, overrides `chunk_base_path`
    /// for those URLs. Mirrors webpack's `output.workerPublicPath`. Primary
    /// use case: keep Worker URLs same-origin when
    /// `chunk_base_path`/`assetPrefix` points to a cross-origin CDN
    /// (browsers reject cross-origin Worker construction, and the worker
    /// bootstrap rejects cross-origin module chunks).
    worker_asset_prefix: Option<RcStr>,
    /// Suffix that will be appended to all chunk URLs when loading them.
    /// This path will not appear in chunk paths or chunk data.
    asset_suffix: Option<ResolvedVc<AssetSuffix>>,
    /// URL prefix that will be prepended to all static asset URLs when loading
    /// them.
    asset_base_path: Option<RcStr>,
    /// URL prefix that will be prepended to all static asset URLs when loading
    /// them.
    #[bincode(with = "turbo_bincode::indexmap")]
    asset_base_paths: FxIndexMap<RcStr, RcStr>,
    /// This is the base path used to generate the service worker scope, it is
    /// not used for output subdirectory logic
    service_worker_scope_base_path: Option<RcStr>,
    /// URL behavior overrides for different tags.
    #[bincode(with = "turbo_bincode::indexmap")]
    url_behaviors: FxIndexMap<RcStr, UrlBehavior>,
    /// Default URL behavior when no tag-specific override is found.
    default_url_behavior: Option<UrlBehavior>,
    /// Enable HMR for this chunking
    enable_hot_module_replacement: bool,
    /// Enable nested async availability for this chunking
    enable_nested_async_availability: bool,
    /// Enable module merging
    enable_module_merging: bool,
    /// Enable dynamic chunk content loading.
    enable_dynamic_chunk_content_loading: bool,
    /// Enable debug IDs for chunks and source maps.
    debug_ids: bool,
    /// Share the browser runtime across routes as a single `runtime.js` asset and expose each
    /// entrypoint's chunk group bootstrap params via
    /// `ChunkGroupResult.chunk_group_bootstrap_params`.
    shared_runtime: bool,
    /// The environment chunks will be evaluated in.
    environment: ResolvedVc<Environment>,
    /// The kind of runtime to include in the output.
    runtime_type: RuntimeType,
    /// Whether to minify resulting chunks
    minify_type: MinifyType,
    /// Whether content hashing is enabled for chunk filenames.
    chunk_content_hashing: Option<ContentHashing>,
    /// Content hashing for asset filenames.
    asset_content_hashing: ContentHashing,
    /// Whether to generate source maps
    source_maps_type: SourceMapsType,
    /// Method to use when figuring out the current chunk src
    current_chunk_method: CurrentChunkMethod,
    /// Whether to use manifest chunks for lazy compilation
    manifest_chunks: bool,
    /// The module id strategy to use
    module_id_strategy: Option<ResolvedVc<ModuleIdStrategy>>,
    /// The module export usage info, if available.
    export_usage: Option<ResolvedVc<BindingUsageInfo>>,
    /// Which references are unused and should be skipped (e.g. during codegen).
    unused_references: Option<ResolvedVc<UnusedReferences>>,
    /// The chunking configs
    chunking_configs: Vec<(ResolvedVc<Box<dyn ChunkType>>, ChunkingConfig)>,
    /// Whether to use absolute URLs for static assets (e.g. in CSS: `url("/absolute/path")`)
    should_use_absolute_url_references: bool,
    /// Global variable names to forward to workers (e.g. NEXT_DEPLOYMENT_ID)
    worker_forwarded_globals: Vec<RcStr>,
    /// The global variable name used for chunk loading.
    /// Default: "TURBOPACK"
    chunk_loading_global: Option<RcStr>,
    /// Salt mixed into chunk and asset content hashes. Empty string means no salt.
    hash_salt: ResolvedVc<RcStr>,
    /// The crossorigin mode for dynamically loaded chunks.
    cross_origin: CrossOrigin,
    /// The retry policy for transient chunk load failures in the browser runtime.
    chunk_load_retry: ChunkLoadRetry,
    /// When enabled, module closure is inlined into a single output chunk
    /// (no runtime chunk loading).
    single_chunk: bool,
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
                worker_asset_prefix: None,
                asset_suffix: None,
                asset_base_path: None,
                asset_base_paths: Default::default(),
                service_worker_scope_base_path: None,
                url_behaviors: Default::default(),
                default_url_behavior: None,
                enable_hot_module_replacement: false,
                enable_nested_async_availability: false,
                enable_module_merging: false,
                enable_dynamic_chunk_content_loading: false,
                debug_ids: false,
                shared_runtime: false,
                environment,
                runtime_type,
                minify_type: MinifyType::NoMinify,
                chunk_content_hashing: None,
                asset_content_hashing: ContentHashing::Direct { length: 13 },
                source_maps_type: SourceMapsType::Full,
                current_chunk_method: CurrentChunkMethod::StringLiteral,
                manifest_chunks: false,
                module_id_strategy: None,
                export_usage: None,
                unused_references: None,
                chunking_configs: Default::default(),
                should_use_absolute_url_references: false,
                worker_forwarded_globals: vec![],
                chunk_loading_global: Default::default(),
                hash_salt: ResolvedVc::cell(RcStr::default()),
                cross_origin: Default::default(),
                chunk_load_retry: Default::default(),
                single_chunk: false,
            },
        }
    }
}
impl BrowserChunkingContext {
    fn generate_evaluate_chunk(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        other_chunks: Vc<OutputAssets>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<EcmascriptBrowserEvaluateChunk> {
        EcmascriptBrowserEvaluateChunk::new(
            self,
            ident,
            other_chunks,
            evaluatable_assets,
            module_graph,
        )
    }

    /// The shared browser runtime chunk for this chunking context.
    ///
    /// Returns the same asset every time: [`EcmascriptBrowserRuntimeChunk::new`] is a
    /// `#[turbo_tasks::function]` memoized on `(chunking_context, has_async_modules)`.
    pub(crate) async fn generate_runtime_chunk(
        self: Vc<Self>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<EcmascriptBrowserRuntimeChunk>> {
        // Detect async modules from the whole-app graph in production. In development, the graph
        // is per-page. To keep the shared `runtime.js` stable, always include the machinery.
        let runtime_type = self.await?.runtime_type;
        let has_async_modules = matches!(runtime_type, RuntimeType::Development)
            || !module_graph.async_module_info().await?.is_empty();
        Ok(EcmascriptBrowserRuntimeChunk::new(self, has_async_modules))
    }

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
    async fn generate_chunk(
        self: Vc<Self>,
        chunk: ResolvedVc<Box<dyn Chunk>>,
    ) -> Result<ResolvedVc<Box<dyn OutputAsset>>> {
        Ok(
            if let Some(ecmascript_chunk) = ResolvedVc::try_downcast_type::<EcmascriptChunk>(chunk)
            {
                ResolvedVc::upcast(
                    EcmascriptBrowserChunk::new(self, *ecmascript_chunk)
                        .to_resolved()
                        .await?,
                )
            } else if let Some(output_asset) =
                ResolvedVc::try_sidecast::<Box<dyn OutputAsset>>(chunk)
            {
                output_asset
            } else {
                bail!("Unable to generate output asset for chunk");
            },
        )
    }
}

#[turbo_tasks::value_impl]
impl BrowserChunkingContext {
    #[turbo_tasks::function]
    pub fn current_chunk_method(&self) -> Vc<CurrentChunkMethod> {
        self.current_chunk_method.cell()
    }

    #[turbo_tasks::function]
    pub fn hash_salt(&self) -> Vc<RcStr> {
        *self.hash_salt
    }

    /// Returns the kind of runtime to include in output chunks.
    ///
    /// This is defined directly on `BrowserChunkingContext` so it is zero-cost
    /// when `RuntimeType` has a single variant.
    #[turbo_tasks::function]
    pub fn runtime_type(&self) -> Vc<RuntimeType> {
        self.runtime_type.cell()
    }

    /// Whether the browser runtime is shared across routes (as a single `runtime.js` asset) and
    /// the chunk-group bootstrap is inlined by the consumer. When `false`, the runtime is emitted
    /// inline in each route's evaluate chunk (the pre-shared-runtime behavior).
    #[turbo_tasks::function]
    pub fn shared_runtime(&self) -> Vc<bool> {
        Vc::cell(self.shared_runtime)
    }

    /// Returns the asset base path.
    #[turbo_tasks::function]
    pub fn chunk_base_path(&self) -> Vc<Option<RcStr>> {
        Vc::cell(self.chunk_base_path.clone())
    }

    /// Returns the asset suffix path.
    #[turbo_tasks::function]
    pub fn asset_suffix(&self) -> Vc<AssetSuffix> {
        if let Some(asset_suffix) = self.asset_suffix {
            *asset_suffix
        } else {
            AssetSuffix::None.cell()
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
            chunk_content_hashing: self.chunk_content_hashing,
        }
        .cell()
    }

    /// Returns the chunk loading global variable name.
    /// Defaults to "TURBOPACK" if not set.
    #[turbo_tasks::function]
    pub fn chunk_loading_global(&self) -> Vc<RcStr> {
        Vc::cell(
            self.chunk_loading_global
                .clone()
                .unwrap_or_else(|| rcstr!("TURBOPACK")),
        )
    }

    #[turbo_tasks::function]
    pub fn cross_origin(&self) -> Vc<CrossOrigin> {
        self.cross_origin.cell()
    }

    #[turbo_tasks::function]
    pub fn chunk_load_retry(&self) -> Vc<ChunkLoadRetry> {
        self.chunk_load_retry.cell()
    }

    /// Whether the ECMAScript chunking config emits component chunks alongside merged chunks.
    #[turbo_tasks::function]
    pub async fn generate_component_chunks(&self) -> Result<Vc<bool>> {
        let ecmascript_ty: ResolvedVc<Box<dyn ChunkType>> =
            ResolvedVc::upcast(Vc::<EcmascriptChunkType>::default().to_resolved().await?);
        Ok(Vc::cell(self.chunking_configs.iter().any(
            |(ty, config)| *ty == ecmascript_ty && config.generate_component_chunks,
        )))
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
            chunk_content_hashing,
            root_path,
        } = &*self.chunk_path_info().await?;
        let name = match *chunk_content_hashing {
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
                let hash = asset
                    .content()
                    .content_hash(self.hash_salt(), HashAlgorithm::Xxh3Hash128Base38)
                    .await?;
                let hash = hash.as_ref().context(
                    "chunk_path requires an asset with file content when content hashing is \
                     enabled",
                )?;
                let hash = &hash[..length as usize];
                if let Some(prefix) = prefix {
                    format!("{prefix}-{hash}{extension}").into()
                } else {
                    format!("{hash}{extension}").into()
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
    fn service_worker_scope_base_path(&self) -> Vc<RcStr> {
        Vc::cell(
            self.service_worker_scope_base_path
                .clone()
                .unwrap_or_default(),
        )
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
        self: Vc<Self>,
        content: Vc<AssetContent>,
        original_asset_ident: Vc<AssetIdent>,
        tag: Option<RcStr>,
    ) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let ident = original_asset_ident.await?;
        let source_path = &ident.path;
        let basename = source_path.file_name();
        let ContentHashing::Direct { length } = this.asset_content_hashing;
        let hash = content
            .content_hash(self.hash_salt(), HashAlgorithm::Xxh3Hash128Base38)
            .await?;
        let hash = hash
            .as_ref()
            .context("Missing content when trying to generate the content hash for static asset")?;
        let short_hash = &hash[..length as usize];
        let asset_path = match source_path.extension() {
            Some(ext) => format!(
                "{basename}.{short_hash}.{ext}",
                basename = &basename[..basename.len() - ext.len() - 1],
            ),
            None => format!("{basename}.{short_hash}"),
        };

        let asset_root_path = tag
            .as_ref()
            .and_then(|tag| this.asset_root_paths.get(tag))
            .unwrap_or(&this.asset_root_path);

        Ok(asset_root_path.join(&asset_path)?.cell())
    }

    #[turbo_tasks::function]
    fn url_behavior(&self, tag: Option<RcStr>) -> Vc<UrlBehavior> {
        tag.as_ref()
            .and_then(|tag| self.url_behaviors.get(tag))
            .cloned()
            .or_else(|| self.default_url_behavior.clone())
            .unwrap_or(UrlBehavior {
                suffix: AssetSuffix::Inferred,
                static_suffix: ResolvedVc::cell(None),
            })
            .cell()
    }

    #[turbo_tasks::function]
    fn chunking_configs(&self) -> Vc<ChunkingConfigs> {
        Vc::cell(self.chunking_configs.iter().cloned().collect())
    }

    #[turbo_tasks::function]
    fn source_map_source_type(&self) -> Vc<SourceMapSourceType> {
        self.source_map_source_type.cell()
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
        module_graph: ResolvedVc<ModuleGraph>,
        availability_info: AvailabilityInfo,
    ) -> Result<Vc<ChunkGroupResult>> {
        let span = tracing::info_span!("chunking", name = display(ident.to_string().await?));
        async move {
            let input_availability_info = availability_info;
            let MakeChunkGroupResult {
                chunks,
                references,
                availability_info,
            } = make_chunk_group(
                chunk_group,
                module_graph,
                ResolvedVc::upcast(self),
                input_availability_info,
            )
            .await?;

            let chunks = chunks.await?;

            let assets = chunks
                .iter()
                .map(|chunk| self.generate_chunk(*chunk))
                .try_join()
                .await?;

            Ok(ChunkGroupResult {
                assets: ResolvedVc::cell(assets),
                referenced_assets: OutputAssets::empty_resolved(),
                references: ResolvedVc::cell(references),
                availability_info,
                chunk_group_bootstrap_params: None,
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
        module_graph: ResolvedVc<ModuleGraph>,
        // Extra chunks to include in the HMR chunk list beyond what is reachable from this chunk
        // group. Used to cover RSC client reference chunks that are built separately.
        extra_chunks: Vc<OutputAssets>,
        input_availability_info: AvailabilityInfo,
    ) -> Result<Vc<ChunkGroupResult>> {
        let span = tracing::info_span!(
            "chunking",
            name = display(ident.to_string().await?),
            chunking_type = "evaluated",
        );
        async move {
            let this = self.await?;
            let MakeChunkGroupResult {
                chunks,
                references,
                availability_info,
            } = make_chunk_group(
                chunk_group.clone(),
                module_graph,
                ResolvedVc::upcast(self),
                input_availability_info,
            )
            .await?;

            let chunks = chunks.await?;

            let mut assets: Vec<ResolvedVc<Box<dyn OutputAsset>>> = chunks
                .iter()
                .map(|chunk| self.generate_chunk(*chunk))
                .try_join()
                .await?;

            // The evaluate chunk loads `other_assets` as `SourceType.Runtime` (without script
            // tags), so it must contain only the directly-generated chunks for this chunk group.
            // `extra_chunks` are loaded separately (already in the HTML), so excluding them here
            // prevents the runtime from blocking on a load that will never happen.
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
                // Follow references (async loaders) to get actual dynamic component chunks, so
                // the single HMR chunk list covers all lazily-loaded modules.
                // inner=false: we only follow Reference inputs transitively, not Asset inputs,
                // to avoid pulling in source maps and other asset-adjacent files that can't be
                // reloaded by the DOM backend (which only handles CSS chunks via reloadChunk).
                let all_dynamic_chunks = expand_output_assets(
                    references
                        .iter()
                        .copied()
                        .map(ExpandOutputAssetsInput::Reference)
                        .chain(assets.iter().copied().map(ExpandOutputAssetsInput::Asset)),
                    false,
                )
                .await?;

                // Combine direct chunks, transitively-reachable dynamic chunks, and any caller-
                // provided extras (e.g. RSC client reference chunks built outside this graph).
                let extra_chunks_ref = extra_chunks.await?;
                let mut hmr_chunks: FxIndexSet<ResolvedVc<Box<dyn OutputAsset>>> =
                    all_dynamic_chunks.into_iter().collect();
                hmr_chunks.extend(extra_chunks_ref.iter().copied());
                let hmr_other_assets = Vc::cell(hmr_chunks.into_iter().collect());

                let ident = if let Some(input_availability_info_ident) =
                    input_availability_info.ident().await?
                {
                    ident
                        .owned()
                        .await?
                        .with_modifier(input_availability_info_ident)
                        .into_vc()
                } else {
                    ident
                };
                assets.push(
                    self.generate_chunk_list_register_chunk(
                        ident,
                        entries,
                        hmr_other_assets,
                        EcmascriptDevChunkListSource::Entry,
                    )
                    .to_resolved()
                    .await?,
                );
            }

            // The evaluate chunk registers this entry's chunks/modules onto the
            // `globalThis[TURBOPACK]` queue. When `shared_runtime` is enabled we return that chunk
            // group's bootstrap params for Next to inline into the HTML and skip emitting the
            // per-route evaluate chunk file. Only `ChunkGroup::Entry` groups (the page/app client
            // entries Next renders into HTML) can be inlined. When `shared_runtime` is disabled the
            // evaluate chunk itself carries the runtime, so it is always emitted as an asset.
            let evaluate_chunk = self
                .generate_evaluate_chunk(ident, other_assets, entries, *module_graph)
                .to_resolved()
                .await?;
            let chunk_group_bootstrap_params =
                if this.shared_runtime && matches!(chunk_group, ChunkGroup::Entry(_)) {
                    Some(
                        evaluate_chunk
                            .chunk_group_bootstrap_params()
                            .owned()
                            .await?,
                    )
                } else {
                    assets.push(ResolvedVc::upcast(evaluate_chunk));
                    None
                };

            // The shared runtime chunk must be the LAST asset of the group. It drains
            // the registration queue set up by the chunks above, so it has to load
            // after them: on a page it is the last `<script>`, and in a web worker the
            // bootstrap relies on it being last to load it after the module chunks and
            // to keep it out of `TURBOPACK_NEXT_CHUNK_URLS` (see
            // `EcmascriptBrowserWorkerEntrypoint`).
            //
            // Only emitted when `shared_runtime` is enabled; otherwise the runtime lives inline in
            // the evaluate chunk above.
            if this.shared_runtime {
                assets.push(ResolvedVc::upcast(
                    self.generate_runtime_chunk(*module_graph)
                        .await?
                        .to_resolved()
                        .await?,
                ));
            }

            Ok(ChunkGroupResult {
                assets: ResolvedVc::cell(assets),
                referenced_assets: OutputAssets::empty_resolved(),
                references: ResolvedVc::cell(references),
                availability_info,
                chunk_group_bootstrap_params,
            }
            .cell())
        }
        .instrument(span)
        .await
    }

    #[turbo_tasks::function]
    async fn hmr_chunk_list(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        chunks: Vc<OutputAssets>,
    ) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        if !this.enable_hot_module_replacement {
            unreachable!("hmr_chunk_list called with enable_hot_module_replacement disabled");
        }
        if chunks.await?.is_empty() {
            return Ok(OutputAssets::empty());
        }
        Ok(Vc::cell(vec![
            self.generate_chunk_list_register_chunk(
                ident,
                EvaluatableAssets::empty(),
                chunks,
                EcmascriptDevChunkListSource::Entry,
            )
            .to_resolved()
            .await?,
        ]))
    }

    #[turbo_tasks::function]
    async fn entry_chunk_group(
        self: ResolvedVc<Self>,
        path: FileSystemPath,
        chunk_group: ChunkGroup,
        module_graph: ResolvedVc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        extra_referenced_assets: Vc<OutputAssets>,
        availability_info: AvailabilityInfo,
    ) -> Result<Vc<EntryChunkGroupResult>> {
        if !self.await?.single_chunk {
            bail!("Browser chunking context only supports entry chunk groups in single-chunk mode");
        }

        if !extra_chunks.await?.is_empty() {
            bail!("single-chunk entry does not support extra chunks");
        }

        let span = tracing::info_span!(
            "chunking",
            name = display(path.to_string_ref().await?),
            chunking_type = "single-chunk entry",
        );
        async move {
            let MakeChunkGroupResult {
                chunks,
                references,
                availability_info,
            } = make_chunk_group(
                chunk_group.clone(),
                module_graph,
                ResolvedVc::upcast(self),
                availability_info,
            )
            .await?;

            let chunks = chunks.await?;

            let ecmascript_chunk = chunks
                .iter()
                .find_map(|chunk| ResolvedVc::try_downcast_type::<EcmascriptChunk>(*chunk));

            if chunks.len() != 1 || ecmascript_chunk.is_none() {
                SingleChunkProducedMultipleChunksIssue {
                    path: path.clone(),
                    chunk_count: chunks.len(),
                }
                .resolved_cell()
                .emit();
            }

            // use a stub if chunks == 0, we already emitted an issue
            let ecmascript_chunk = match ecmascript_chunk {
                Some(ecmascript_chunk) => ecmascript_chunk,
                None => {
                    EcmascriptChunk::new(
                        Vc::upcast(*self),
                        EcmascriptChunkContent {
                            chunk_items: Vec::new(),
                            batch_groups: Vec::new(),
                        }
                        .cell(),
                        Vec::new(),
                    )
                    .to_resolved()
                    .await?
                }
            };

            let evaluatable_assets = chunk_group
                .entries()
                .map(|entry| {
                    ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(entry)
                        .context("entry_chunk_group entries must be evaluatable assets")
                })
                .collect::<Result<Vec<_>>>()?;

            let asset = ResolvedVc::upcast(
                EcmascriptBrowserSingleEntryChunk::new(
                    *self,
                    path,
                    *ecmascript_chunk,
                    Vc::cell(evaluatable_assets),
                    extra_referenced_assets,
                    Vc::cell(references),
                    *module_graph,
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
    fn chunk_item_id_strategy(&self) -> Vc<ModuleIdStrategy> {
        *self
            .module_id_strategy
            .unwrap_or_else(|| ModuleIdStrategy::default().resolved_cell())
    }

    #[turbo_tasks::function]
    async fn async_loader_chunk_item(
        self: ResolvedVc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
        module_graph: Vc<ModuleGraph>,
        availability_info: AvailabilityInfo,
    ) -> Result<Vc<Box<dyn ChunkItem>>> {
        let chunking_context = ResolvedVc::upcast::<Box<dyn ChunkingContext>>(self);
        if self.await?.single_chunk {
            // Single-chunk (eg. service-workers) entries cannot split a
            // separate async chunk.
            SingleChunkAsyncLoaderIssue {
                path: module.ident().await?.path.clone(),
            }
            .resolved_cell()
            .emit();
            return Ok(module.as_chunk_item(module_graph, *chunking_context));
        }
        Ok(if self.await?.manifest_chunks {
            let manifest_asset = ManifestAsyncModule::new(
                module,
                module_graph,
                *chunking_context,
                availability_info,
            );
            let loader_module = ManifestLoaderModule::new(manifest_asset);
            loader_module.as_chunk_item(module_graph, *chunking_context)
        } else {
            let module = AsyncLoaderModule::new(module, *chunking_context, availability_info);
            module.as_chunk_item(module_graph, *chunking_context)
        })
    }

    #[turbo_tasks::function]
    async fn async_loader_chunk_item_ident(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
    ) -> Result<Vc<AssetIdent>> {
        Ok(if self.await?.manifest_chunks {
            ManifestLoaderModule::asset_ident_for(module)
        } else {
            AsyncLoaderModule::asset_ident_for(module)
        })
    }

    #[turbo_tasks::function]
    async fn module_export_usage(
        &self,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<ModuleExportUsage>> {
        if let Some(export_usage) = self.export_usage {
            Ok(export_usage.await?.used_exports(module).await?)
        } else {
            Ok(ModuleExportUsage::all())
        }
    }

    #[turbo_tasks::function]
    fn unused_references(&self) -> Vc<UnusedReferences> {
        if let Some(unused_references) = self.unused_references {
            *unused_references
        } else {
            Vc::cell(Default::default())
        }
    }

    #[turbo_tasks::function]
    async fn debug_ids_enabled(self: Vc<Self>) -> Result<Vc<bool>> {
        Ok(Vc::cell(self.await?.debug_ids))
    }

    #[turbo_tasks::function]
    fn worker_configuration_options(&self) -> Vc<WorkerConfigurationOptions> {
        WorkerConfigurationOptions {
            asset_prefix: self.worker_asset_prefix.clone(),
            forwarded_globals: self.worker_forwarded_globals.clone(),
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn worker_entrypoint(self: Vc<Self>) -> Result<Vc<Box<dyn OutputAsset>>> {
        let chunking_context: Vc<Box<dyn ChunkingContext>> = Vc::upcast(self);
        let resolved = chunking_context.to_resolved().await?;
        let forwarded_globals = Vc::cell(self.await?.worker_forwarded_globals.clone());
        let entrypoint = EcmascriptBrowserWorkerEntrypoint::new(*resolved, forwarded_globals);
        Ok(Vc::upcast(entrypoint))
    }

    #[turbo_tasks::function]
    fn chunk_loading(&self) -> Vc<ChunkLoading> {
        if self.single_chunk {
            ChunkLoading::SingleChunk.cell()
        } else {
            self.environment.chunk_loading()
        }
    }
}

#[turbo_tasks::value]
struct ChunkPathInfo {
    root_path: FileSystemPath,
    chunk_root_path: FileSystemPath,
    chunk_content_hashing: Option<ContentHashing>,
}

#[turbo_tasks::value(shared)]
struct SingleChunkProducedMultipleChunksIssue {
    path: FileSystemPath,
    chunk_count: usize,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for SingleChunkProducedMultipleChunksIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    fn stage(&self) -> IssueStage {
        IssueStage::CodeGen
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Single-chunk entry could not be reduced to a single ECMAScript chunk"
        )))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Stack(vec![
            StyledString::Line(vec![
                StyledString::Text(rcstr!(
                    "A single-chunk entry must produce exactly one ECMAScript chunk, but it \
                     produced "
                )),
                StyledString::Strong(RcStr::from(format!("{}", self.chunk_count))),
                StyledString::Text(rcstr!(" chunk(s).")),
            ]),
            StyledString::Text(rcstr!(
                "This usually means the module graph contains non-ECMAScript chunkable items \
                 (e.g. CSS, image or font imports), which cannot be inlined into a single chunk."
            )),
        ])))
    }
}

#[turbo_tasks::value(shared)]
struct SingleChunkAsyncLoaderIssue {
    path: FileSystemPath,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for SingleChunkAsyncLoaderIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    fn stage(&self) -> IssueStage {
        IssueStage::CodeGen
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Async loaders are not supported in single-chunk mode"
        )))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Stack(vec![StyledString::Text(rcstr!(
            "The dynamically imported module is inlined into the single chunk and cannot be \
             code-split. Remove the dynamic import (import the module statically) if separate \
             loading is not required."
        ))])))
    }
}
