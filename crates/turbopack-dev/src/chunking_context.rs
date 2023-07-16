use anyhow::{bail, Result};
use indexmap::IndexSet;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal},
    TryJoinIterExt, Value, Vc,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::Asset,
    chunk::{Chunk, ChunkableModule, ChunkingContext, Chunks, EvaluatableAssets},
    environment::Environment,
    ident::AssetIdent,
    output::{OutputAsset, OutputAssets},
};
use turbopack_css::chunk::CssChunk;
use turbopack_ecmascript::chunk::{EcmascriptChunk, EcmascriptChunkingContext};
use turbopack_ecmascript_runtime::RuntimeType;

use crate::{
    css::optimize::optimize_css_chunks,
    ecmascript::{
        chunk::EcmascriptDevChunk,
        evaluate::chunk::EcmascriptDevEvaluateChunk,
        list::asset::{EcmascriptDevChunkList, EcmascriptDevChunkListSource},
        optimize::optimize_ecmascript_chunks,
    },
};

pub struct DevChunkingContextBuilder {
    context: DevChunkingContext,
}

impl DevChunkingContextBuilder {
    pub fn hot_module_replacement(mut self) -> Self {
        self.context.enable_hot_module_replacement = true;
        self
    }

    pub fn chunk_base_path(mut self, chunk_base_path: Vc<Option<String>>) -> Self {
        self.context.chunk_base_path = chunk_base_path;
        self
    }

    pub fn layer(mut self, layer: &str) -> Self {
        self.context.layer = (!layer.is_empty()).then(|| layer.to_string());
        self
    }

    pub fn reference_chunk_source_maps(mut self, source_maps: bool) -> Self {
        self.context.reference_chunk_source_maps = source_maps;
        self
    }

    pub fn reference_css_chunk_source_maps(mut self, source_maps: bool) -> Self {
        self.context.reference_css_chunk_source_maps = source_maps;
        self
    }

    pub fn runtime_type(mut self, runtime_type: RuntimeType) -> Self {
        self.context.runtime_type = runtime_type;
        self
    }

    pub fn build(self) -> Vc<DevChunkingContext> {
        DevChunkingContext::new(Value::new(self.context))
    }
}

/// A chunking context for development mode.
/// It uses readable filenames and module ids to improve development.
/// It also uses a chunking heuristic that is incremental and cacheable.
/// It splits "node_modules" separately as these are less likely to change
/// during development
#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash, PartialOrd, Ord)]
pub struct DevChunkingContext {
    /// This path get stripped off of chunk paths before generating output asset
    /// paths.
    context_path: Vc<FileSystemPath>,
    /// This path is used to compute the url to request chunks or assets from
    output_root: Vc<FileSystemPath>,
    /// Chunks are placed at this path
    chunk_root_path: Vc<FileSystemPath>,
    /// Chunks reference source maps assets
    reference_chunk_source_maps: bool,
    /// Css chunks reference source maps assets
    reference_css_chunk_source_maps: bool,
    /// Static assets are placed at this path
    asset_root_path: Vc<FileSystemPath>,
    /// Base path that will be prepended to all chunk URLs when loading them.
    /// This path will not appear in chunk paths or chunk data.
    chunk_base_path: Vc<Option<String>>,
    /// Layer name within this context
    layer: Option<String>,
    /// Enable HMR for this chunking
    enable_hot_module_replacement: bool,
    /// The environment chunks will be evaluated in.
    environment: Vc<Environment>,
    /// The kind of runtime to include in the output.
    runtime_type: RuntimeType,
}

impl DevChunkingContext {
    pub fn builder(
        context_path: Vc<FileSystemPath>,
        output_root: Vc<FileSystemPath>,
        chunk_root_path: Vc<FileSystemPath>,
        asset_root_path: Vc<FileSystemPath>,
        environment: Vc<Environment>,
    ) -> DevChunkingContextBuilder {
        DevChunkingContextBuilder {
            context: DevChunkingContext {
                context_path,
                output_root,
                chunk_root_path,
                reference_chunk_source_maps: true,
                reference_css_chunk_source_maps: true,
                asset_root_path,
                chunk_base_path: Default::default(),
                layer: None,
                enable_hot_module_replacement: false,
                environment,
                runtime_type: Default::default(),
            },
        }
    }
}

impl DevChunkingContext {
    /// Returns the kind of runtime to include in output chunks.
    ///
    /// This is defined directly on `DevChunkingContext` so it is zero-cost when
    /// `RuntimeType` has a single variant.
    pub fn runtime_type(&self) -> RuntimeType {
        self.runtime_type
    }

    /// Returns the asset base path.
    pub fn chunk_base_path(&self) -> Vc<Option<String>> {
        self.chunk_base_path
    }
}

#[turbo_tasks::value_impl]
impl DevChunkingContext {
    #[turbo_tasks::function]
    fn new(this: Value<DevChunkingContext>) -> Vc<Self> {
        this.into_value().cell()
    }

    #[turbo_tasks::function]
    fn generate_evaluate_chunk(
        self: Vc<Self>,
        entry_chunk: Vc<Box<dyn Chunk>>,
        other_chunks: Vc<OutputAssets>,
        evaluatable_assets: Vc<EvaluatableAssets>,
    ) -> Vc<Box<dyn OutputAsset>> {
        Vc::upcast(EcmascriptDevEvaluateChunk::new(
            self,
            entry_chunk,
            other_chunks,
            evaluatable_assets,
        ))
    }

    #[turbo_tasks::function]
    fn generate_chunk_list_register_chunk(
        self: Vc<Self>,
        entry_chunk: Vc<Box<dyn Chunk>>,
        other_chunks: Vc<OutputAssets>,
        source: Value<EcmascriptDevChunkListSource>,
    ) -> Vc<Box<dyn OutputAsset>> {
        Vc::upcast(EcmascriptDevChunkList::new(
            self,
            entry_chunk,
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
impl ChunkingContext for DevChunkingContext {
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
    async fn chunk_path(
        &self,
        ident: Vc<AssetIdent>,
        extension: String,
    ) -> Result<Vc<FileSystemPath>> {
        let root_path = self.chunk_root_path;
        let root_path = if let Some(layer) = self.layer.as_deref() {
            root_path.join(layer.to_string())
        } else {
            root_path
        };
        let name = ident.output_name(self.context_path, extension).await?;
        Ok(root_path.join(name.clone_value()))
    }

    #[turbo_tasks::function]
    async fn reference_chunk_source_maps(&self, chunk: Vc<Box<dyn Asset>>) -> Result<Vc<bool>> {
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
    async fn can_be_in_same_chunk(
        &self,
        asset_a: Vc<Box<dyn Asset>>,
        asset_b: Vc<Box<dyn Asset>>,
    ) -> Result<Vc<bool>> {
        let parent_dir = asset_a.ident().path().parent().await?;

        let path = asset_b.ident().path().await?;
        if let Some(rel_path) = parent_dir.get_path_to(&path) {
            if !rel_path.starts_with("node_modules/") && !rel_path.contains("/node_modules/") {
                return Ok(Vc::cell(true));
            }
        }

        Ok(Vc::cell(false))
    }

    #[turbo_tasks::function]
    async fn asset_path(
        &self,
        content_hash: String,
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
        Ok(self.asset_root_path.join(asset_path))
    }

    #[turbo_tasks::function]
    fn is_hot_module_replacement_enabled(&self) -> Vc<bool> {
        Vc::cell(self.enable_hot_module_replacement)
    }

    #[turbo_tasks::function]
    fn layer(&self) -> Vc<String> {
        Vc::cell(self.layer.clone().unwrap_or_default())
    }

    #[turbo_tasks::function]
    async fn with_layer(self: Vc<Self>, layer: String) -> Result<Vc<Box<dyn ChunkingContext>>> {
        let mut context = self.await?.clone_value();
        context.layer = (!layer.is_empty()).then(|| layer.to_string());
        Ok(Vc::upcast(DevChunkingContext::new(Value::new(context))))
    }

    #[turbo_tasks::function]
    async fn chunk_group(
        self: Vc<Self>,
        entry_chunk: Vc<Box<dyn Chunk>>,
    ) -> Result<Vc<OutputAssets>> {
        let parallel_chunks = get_parallel_chunks([entry_chunk]).await?;

        let optimized_chunks = get_optimized_chunks(parallel_chunks).await?;

        let mut assets: Vec<Vc<Box<dyn OutputAsset>>> = optimized_chunks
            .await?
            .iter()
            .map(|chunk| self.generate_chunk(*chunk))
            .collect();

        assets.push(self.generate_chunk_list_register_chunk(
            entry_chunk,
            Vc::cell(assets.clone()),
            Value::new(EcmascriptDevChunkListSource::Dynamic),
        ));

        Ok(Vc::cell(assets))
    }

    #[turbo_tasks::function]
    async fn evaluated_chunk_group(
        self: Vc<Self>,
        entry_chunk: Vc<Box<dyn Chunk>>,
        evaluatable_assets: Vc<EvaluatableAssets>,
    ) -> Result<Vc<OutputAssets>> {
        let evaluatable_assets_ref = evaluatable_assets.await?;

        let mut entry_assets: IndexSet<_> = evaluatable_assets_ref
            .iter()
            .map({
                move |evaluatable_asset| async move {
                    evaluatable_asset
                        .as_root_chunk(Vc::upcast(self))
                        .resolve()
                        .await
                }
            })
            .try_join()
            .await?
            .into_iter()
            .collect();

        entry_assets.insert(entry_chunk.resolve().await?);

        let parallel_chunks = get_parallel_chunks(entry_assets).await?;

        let optimized_chunks = get_optimized_chunks(parallel_chunks).await?;

        let mut assets: Vec<Vc<Box<dyn OutputAsset>>> = optimized_chunks
            .await?
            .iter()
            .map(|chunk| self.generate_chunk(*chunk))
            .collect();

        let other_assets = Vc::cell(assets.clone());

        assets.push(self.generate_chunk_list_register_chunk(
            entry_chunk,
            other_assets,
            Value::new(EcmascriptDevChunkListSource::Entry),
        ));

        assets.push(self.generate_evaluate_chunk(entry_chunk, other_assets, evaluatable_assets));

        Ok(Vc::cell(assets))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkingContext for DevChunkingContext {
    #[turbo_tasks::function]
    fn has_react_refresh(&self) -> Vc<bool> {
        Vc::cell(true)
    }
}

async fn get_parallel_chunks<I>(entries: I) -> Result<impl Iterator<Item = Vc<Box<dyn Chunk>>>>
where
    I: IntoIterator<Item = Vc<Box<dyn Chunk>>>,
{
    Ok(AdjacencyMap::new()
        .skip_duplicates()
        .visit(entries, |chunk: Vc<Box<dyn Chunk>>| async move {
            Ok(chunk
                .parallel_chunks()
                .await?
                .iter()
                .copied()
                .collect::<Vec<_>>()
                .into_iter())
        })
        .await
        .completed()?
        .into_inner()
        .into_reverse_topological())
}

async fn get_optimized_chunks<I>(chunks: I) -> Result<Vc<Chunks>>
where
    I: IntoIterator<Item = Vc<Box<dyn Chunk>>>,
{
    let mut ecmascript_chunks = vec![];
    let mut css_chunks = vec![];
    let mut other_chunks = vec![];

    for chunk in chunks.into_iter() {
        if let Some(ecmascript_chunk) =
            Vc::try_resolve_downcast_type::<EcmascriptChunk>(chunk).await?
        {
            ecmascript_chunks.push(ecmascript_chunk);
        } else if let Some(css_chunk) = Vc::try_resolve_downcast_type::<CssChunk>(chunk).await? {
            css_chunks.push(css_chunk);
        } else {
            other_chunks.push(chunk);
        }
    }

    let ecmascript_chunks = optimize_ecmascript_chunks(Vc::cell(ecmascript_chunks)).await?;
    let css_chunks = optimize_css_chunks(Vc::cell(css_chunks)).await?;

    let chunks = ecmascript_chunks
        .iter()
        .copied()
        .map(Vc::upcast)
        .chain(css_chunks.iter().copied().map(Vc::upcast))
        .chain(other_chunks)
        .collect();

    Ok(Vc::cell(chunks))
}
