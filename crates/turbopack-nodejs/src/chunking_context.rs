use std::iter::once;

use anyhow::{bail, Context, Result};
use tracing::Instrument;
use turbo_tasks::{RcStr, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo,
        chunk_group::{make_chunk_group, MakeChunkGroupResult},
        Chunk, ChunkGroupResult, ChunkItem, ChunkableModule, ChunkingContext,
        EntryChunkGroupResult, EvaluatableAssets, MinifyType, ModuleId,
    },
    environment::Environment,
    ident::AssetIdent,
    module::Module,
    output::OutputAsset,
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
    pub fn asset_prefix(mut self, asset_prefix: Vc<Option<RcStr>>) -> Self {
        self.chunking_context.asset_prefix = asset_prefix;
        self
    }

    pub fn minify_type(mut self, minify_type: MinifyType) -> Self {
        self.chunking_context.minify_type = minify_type;
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

    /// Builds the chunking context.
    pub fn build(self) -> Vc<NodeJsChunkingContext> {
        NodeJsChunkingContext::new(Value::new(self.chunking_context))
    }
}

/// A chunking context for build mode.
#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash, PartialOrd, Ord)]
pub struct NodeJsChunkingContext {
    /// This path get stripped off of chunk paths before generating output asset
    /// paths.
    context_path: Vc<FileSystemPath>,
    /// This path is used to compute the url to request chunks or assets from
    output_root: Vc<FileSystemPath>,
    /// This path is used to compute the url to request chunks or assets from
    client_root: Vc<FileSystemPath>,
    /// Chunks are placed at this path
    chunk_root_path: Vc<FileSystemPath>,
    /// Static assets are placed at this path
    asset_root_path: Vc<FileSystemPath>,
    /// Static assets requested from this url base
    asset_prefix: Vc<Option<RcStr>>,
    /// The environment chunks will be evaluated in.
    environment: Vc<Environment>,
    /// The kind of runtime to include in the output.
    runtime_type: RuntimeType,
    /// Whether to minify resulting chunks
    minify_type: MinifyType,
    /// Whether to use manifest chunks for lazy compilation
    manifest_chunks: bool,
}

impl NodeJsChunkingContext {
    /// Creates a new chunking context builder.
    pub fn builder(
        context_path: Vc<FileSystemPath>,
        output_root: Vc<FileSystemPath>,
        client_root: Vc<FileSystemPath>,
        chunk_root_path: Vc<FileSystemPath>,
        asset_root_path: Vc<FileSystemPath>,
        environment: Vc<Environment>,
        runtime_type: RuntimeType,
    ) -> NodeJsChunkingContextBuilder {
        NodeJsChunkingContextBuilder {
            chunking_context: NodeJsChunkingContext {
                context_path,
                output_root,
                client_root,
                chunk_root_path,
                asset_root_path,
                asset_prefix: Default::default(),
                environment,
                runtime_type,
                minify_type: MinifyType::NoMinify,
                manifest_chunks: false,
            },
        }
    }
}

impl NodeJsChunkingContext {
    /// Returns the kind of runtime to include in output chunks.
    ///
    /// This is defined directly on `NodeJsChunkingContext` so it is zero-cost
    /// when `RuntimeType` has a single variant.
    pub fn runtime_type(&self) -> RuntimeType {
        self.runtime_type
    }

    /// Returns the minify type.
    pub fn minify_type(&self) -> MinifyType {
        self.minify_type
    }
}

#[turbo_tasks::value_impl]
impl NodeJsChunkingContext {
    #[turbo_tasks::function]
    fn new(this: Value<NodeJsChunkingContext>) -> Vc<Self> {
        this.into_value().cell()
    }

    #[turbo_tasks::function]
    pub fn asset_prefix(&self) -> Vc<Option<RcStr>> {
        self.asset_prefix
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
                Vc::upcast(EcmascriptBuildNodeChunk::new(self, ecmascript_chunk))
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
impl ChunkingContext for NodeJsChunkingContext {
    #[turbo_tasks::function]
    fn name(&self) -> Vc<RcStr> {
        Vc::cell("unknown".into())
    }

    #[turbo_tasks::function]
    fn context_path(&self) -> Vc<FileSystemPath> {
        self.context_path
    }

    #[turbo_tasks::function]
    fn output_root(&self) -> Vc<FileSystemPath> {
        self.output_root
    }

    #[turbo_tasks::function]
    fn environment(&self) -> Vc<Environment> {
        self.environment
    }

    #[turbo_tasks::function]
    async fn asset_url(self: Vc<Self>, ident: Vc<AssetIdent>) -> Result<Vc<RcStr>> {
        let this = self.await?;
        let asset_path = ident.path().await?.to_string();
        let asset_path = asset_path
            .strip_prefix(&format!("{}/", this.client_root.await?.path))
            .context("expected client root to contain asset path")?;

        Ok(Vc::cell(
            format!(
                "{}{}",
                this.asset_prefix
                    .await?
                    .as_ref()
                    .map(|s| s.clone())
                    .unwrap_or_else(|| "/".into()),
                asset_path
            )
            .into(),
        ))
    }

    #[turbo_tasks::function]
    async fn chunk_path(
        &self,
        ident: Vc<AssetIdent>,
        extension: RcStr,
    ) -> Result<Vc<FileSystemPath>> {
        let root_path = self.chunk_root_path;
        let name = ident.output_name(self.context_path, extension).await?;
        Ok(root_path.join(name.clone_value()))
    }

    #[turbo_tasks::function]
    fn reference_chunk_source_maps(&self, _chunk: Vc<Box<dyn OutputAsset>>) -> Vc<bool> {
        Vc::cell(true)
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
    async fn chunk_group(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<ChunkGroupResult>> {
        let span = tracing::info_span!(
            "chunking",
            module = module.ident().to_string().await?.to_string()
        );
        async move {
            let MakeChunkGroupResult {
                chunks,
                availability_info,
            } = make_chunk_group(
                Vc::upcast(self),
                [Vc::upcast(module)],
                availability_info.into_value(),
            )
            .await?;

            let mut assets: Vec<Vc<Box<dyn OutputAsset>>> = chunks
                .iter()
                .map(|chunk| self.generate_chunk(*chunk))
                .collect();

            // Resolve assets
            for asset in assets.iter_mut() {
                *asset = asset.resolve().await?;
            }

            Ok(ChunkGroupResult {
                assets: Vc::cell(assets),
                availability_info,
            }
            .cell())
        }
        .instrument(span)
        .await
    }

    /// Generates an output chunk that:
    /// * evaluates the given assets; and
    /// * exports the result of evaluating the given module as a CommonJS
    ///   default export.
    #[turbo_tasks::function]
    pub async fn entry_chunk_group(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
        module: Vc<Box<dyn Module>>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<EntryChunkGroupResult>> {
        let availability_info = availability_info.into_value();

        let MakeChunkGroupResult {
            chunks,
            availability_info,
        } = make_chunk_group(
            Vc::upcast(self),
            once(module).chain(
                evaluatable_assets
                    .await?
                    .iter()
                    .map(|&asset| Vc::upcast(asset)),
            ),
            availability_info,
        )
        .await?;

        let other_chunks: Vec<_> = chunks
            .iter()
            .map(|chunk| self.generate_chunk(*chunk))
            .collect();

        let Some(module) = Vc::try_resolve_downcast(module).await? else {
            bail!("module must be placeable in an ecmascript chunk");
        };

        let asset = Vc::upcast(EcmascriptBuildNodeEntryChunk::new(
            path,
            self,
            Vc::cell(other_chunks),
            evaluatable_assets,
            module,
        ));

        Ok(EntryChunkGroupResult {
            asset,
            availability_info,
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn evaluated_chunk_group(
        self: Vc<Self>,
        _ident: Vc<AssetIdent>,
        _evaluatable_assets: Vc<EvaluatableAssets>,
        _availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<ChunkGroupResult>> {
        // TODO(alexkirsz) This method should be part of a separate trait that is
        // only implemented for client/edge runtimes.
        bail!("the build chunking context does not support evaluated chunk groups")
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
