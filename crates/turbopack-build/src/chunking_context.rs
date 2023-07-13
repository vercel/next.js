use anyhow::{bail, Result};
use indexmap::IndexSet;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal},
    primitives::{BoolVc, StringVc},
    TryJoinIterExt, Value,
};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{
        Chunk, ChunkVc, ChunkableModule, ChunkingContext, ChunkingContextVc, ChunksVc,
        EvaluatableAssetsVc,
    },
    environment::EnvironmentVc,
    ident::AssetIdentVc,
    output::{OutputAssetVc, OutputAssetsVc},
};
use turbopack_css::chunk::CssChunkVc;
use turbopack_ecmascript::chunk::{
    EcmascriptChunkPlaceableVc, EcmascriptChunkVc, EcmascriptChunkingContext,
    EcmascriptChunkingContextVc,
};
use turbopack_ecmascript_runtime::RuntimeType;

use crate::ecmascript::node::{
    chunk::EcmascriptBuildNodeChunkVc, entry::chunk::EcmascriptBuildNodeEntryChunkVc,
};

/// A builder for [`BuildChunkingContextVc`].
pub struct BuildChunkingContextBuilder {
    context: BuildChunkingContext,
}

impl BuildChunkingContextBuilder {
    pub fn runtime_type(mut self, runtime_type: RuntimeType) -> Self {
        self.context.runtime_type = runtime_type;
        self
    }

    pub fn layer(mut self, layer: impl Into<String>) -> Self {
        self.context.layer = Some(layer.into());
        self
    }

    /// Builds the chunking context.
    pub fn build(self) -> BuildChunkingContextVc {
        BuildChunkingContextVc::new(Value::new(self.context))
    }
}

/// A chunking context for build mode.
#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash, PartialOrd, Ord)]
pub struct BuildChunkingContext {
    /// This path get stripped off of chunk paths before generating output asset
    /// paths.
    context_path: FileSystemPathVc,
    /// This path is used to compute the url to request chunks or assets from
    output_root: FileSystemPathVc,
    /// Chunks are placed at this path
    chunk_root_path: FileSystemPathVc,
    /// Static assets are placed at this path
    asset_root_path: FileSystemPathVc,
    /// Layer name within this context
    layer: Option<String>,
    /// The environment chunks will be evaluated in.
    environment: EnvironmentVc,
    /// The kind of runtime to include in the output.
    runtime_type: RuntimeType,
}

impl BuildChunkingContextVc {
    /// Creates a new chunking context builder.
    pub fn builder(
        context_path: FileSystemPathVc,
        output_root: FileSystemPathVc,
        chunk_root_path: FileSystemPathVc,
        asset_root_path: FileSystemPathVc,
        environment: EnvironmentVc,
    ) -> BuildChunkingContextBuilder {
        BuildChunkingContextBuilder {
            context: BuildChunkingContext {
                context_path,
                output_root,
                chunk_root_path,
                asset_root_path,
                layer: None,
                environment,
                runtime_type: Default::default(),
            },
        }
    }
}

impl BuildChunkingContext {
    /// Returns the kind of runtime to include in output chunks.
    ///
    /// This is defined directly on `BuildChunkingContext` so it is zero-cost
    /// when `RuntimeType` has a single variant.
    pub fn runtime_type(&self) -> RuntimeType {
        self.runtime_type
    }
}

#[turbo_tasks::value_impl]
impl BuildChunkingContextVc {
    #[turbo_tasks::function]
    fn new(this: Value<BuildChunkingContext>) -> Self {
        this.into_value().cell()
    }

    /// Generates an output chunk that:
    /// * evaluates the given assets; and
    /// * exports the result of evaluating the given module as a CommonJS
    ///   default export.
    #[turbo_tasks::function]
    pub async fn entry_chunk(
        self_vc: BuildChunkingContextVc,
        path: FileSystemPathVc,
        module: EcmascriptChunkPlaceableVc,
        evaluatable_assets: EvaluatableAssetsVc,
    ) -> Result<OutputAssetVc> {
        let entry_chunk = module.as_root_chunk(self_vc.into());

        let other_chunks = self_vc
            .get_chunk_assets(entry_chunk, evaluatable_assets)
            .await?;

        let asset = EcmascriptBuildNodeEntryChunkVc::new(
            path,
            self_vc,
            OutputAssetsVc::cell(other_chunks),
            evaluatable_assets,
            module,
        )
        .into();

        Ok(asset)
    }

    #[turbo_tasks::function]
    async fn generate_chunk(self, chunk: ChunkVc) -> Result<OutputAssetVc> {
        Ok(
            if let Some(ecmascript_chunk) = EcmascriptChunkVc::resolve_from(chunk).await? {
                EcmascriptBuildNodeChunkVc::new(self, ecmascript_chunk).into()
            } else if let Some(output_asset) = OutputAssetVc::resolve_from(chunk).await? {
                output_asset
            } else {
                bail!("Unable to generate output asset for chunk");
            },
        )
    }
}

impl BuildChunkingContextVc {
    async fn get_chunk_assets(
        self,
        entry_chunk: ChunkVc,
        evaluatable_assets: EvaluatableAssetsVc,
    ) -> Result<Vec<OutputAssetVc>> {
        let evaluatable_assets_ref = evaluatable_assets.await?;

        let mut chunks: IndexSet<_> = evaluatable_assets_ref
            .iter()
            .map({
                move |evaluatable_asset| async move {
                    evaluatable_asset.as_root_chunk(self.into()).resolve().await
                }
            })
            .try_join()
            .await?
            .into_iter()
            .collect();

        chunks.insert(entry_chunk.resolve().await?);

        let chunks = get_parallel_chunks(chunks);

        let chunks = get_optimized_chunks(chunks.await?).await?;

        Ok(chunks
            .await?
            .iter()
            .map(|chunk| self.generate_chunk(*chunk))
            .collect())
    }
}

#[turbo_tasks::value_impl]
impl ChunkingContext for BuildChunkingContext {
    #[turbo_tasks::function]
    fn context_path(&self) -> FileSystemPathVc {
        self.context_path
    }

    #[turbo_tasks::function]
    fn output_root(&self) -> FileSystemPathVc {
        self.output_root
    }

    #[turbo_tasks::function]
    fn environment(&self) -> EnvironmentVc {
        self.environment
    }

    #[turbo_tasks::function]
    async fn chunk_path(&self, ident: AssetIdentVc, extension: &str) -> Result<FileSystemPathVc> {
        let root_path = self.chunk_root_path;
        let root_path = if let Some(layer) = self.layer.as_deref() {
            root_path.join(layer)
        } else {
            root_path
        };
        let name = ident.output_name(self.context_path, extension).await?;
        Ok(root_path.join(&name))
    }

    #[turbo_tasks::function]
    fn reference_chunk_source_maps(&self, _chunk: AssetVc) -> BoolVc {
        BoolVc::cell(true)
    }

    #[turbo_tasks::function]
    async fn can_be_in_same_chunk(&self, asset_a: AssetVc, asset_b: AssetVc) -> Result<BoolVc> {
        let parent_dir = asset_a.ident().path().parent().await?;

        let path = asset_b.ident().path().await?;
        if let Some(rel_path) = parent_dir.get_path_to(&path) {
            if !rel_path.starts_with("node_modules/") && !rel_path.contains("/node_modules/") {
                return Ok(BoolVc::cell(true));
            }
        }

        Ok(BoolVc::cell(false))
    }

    #[turbo_tasks::function]
    async fn asset_path(
        &self,
        content_hash: &str,
        original_asset_ident: AssetIdentVc,
    ) -> Result<FileSystemPathVc> {
        let source_path = original_asset_ident.path().await?;
        let basename = source_path.file_name();
        let asset_path = match source_path.extension() {
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
        Ok(self.asset_root_path.join(&asset_path))
    }

    #[turbo_tasks::function]
    fn layer(&self) -> StringVc {
        StringVc::cell(self.layer.clone().unwrap_or_default())
    }

    #[turbo_tasks::function]
    async fn with_layer(self_vc: BuildChunkingContextVc, layer: &str) -> Result<ChunkingContextVc> {
        let mut context = self_vc.await?.clone_value();
        context.layer = (!layer.is_empty()).then(|| layer.to_string());
        Ok(BuildChunkingContextVc::new(Value::new(context)).into())
    }

    #[turbo_tasks::function]
    async fn chunk_group(
        self_vc: BuildChunkingContextVc,
        entry_chunk: ChunkVc,
    ) -> Result<OutputAssetsVc> {
        let parallel_chunks = get_parallel_chunks([entry_chunk]).await?;

        let optimized_chunks = get_optimized_chunks(parallel_chunks).await?;

        let assets: Vec<OutputAssetVc> = optimized_chunks
            .await?
            .iter()
            .map(|chunk| self_vc.generate_chunk(*chunk))
            .collect();

        Ok(OutputAssetsVc::cell(assets))
    }

    #[turbo_tasks::function]
    async fn evaluated_chunk_group(
        _self_vc: BuildChunkingContextVc,
        _entry_chunk: ChunkVc,
        _evaluatable_assets: EvaluatableAssetsVc,
    ) -> Result<OutputAssetsVc> {
        // TODO(alexkirsz) This method should be part of a separate trait that is
        // only implemented for client/edge runtimes.
        bail!("the build chunking context does not support evaluated chunk groups")
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkingContext for BuildChunkingContext {}

async fn get_parallel_chunks<I>(entries: I) -> Result<impl Iterator<Item = ChunkVc>>
where
    I: IntoIterator<Item = ChunkVc>,
{
    Ok(AdjacencyMap::new()
        .skip_duplicates()
        .visit(entries, |chunk: ChunkVc| async move {
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

async fn get_optimized_chunks<I>(chunks: I) -> Result<ChunksVc>
where
    I: IntoIterator<Item = ChunkVc>,
{
    let mut ecmascript_chunks = vec![];
    let mut css_chunks = vec![];
    let mut other_chunks = vec![];

    for chunk in chunks.into_iter() {
        if let Some(ecmascript_chunk) = EcmascriptChunkVc::resolve_from(&chunk).await? {
            ecmascript_chunks.push(ecmascript_chunk);
        } else if let Some(css_chunk) = CssChunkVc::resolve_from(&chunk).await? {
            css_chunks.push(css_chunk);
        } else {
            other_chunks.push(chunk);
        }
    }

    // TODO(WEB-403) Optimize pass here.

    let chunks = ecmascript_chunks
        .iter()
        .copied()
        .map(|chunk| chunk.as_chunk())
        .chain(css_chunks.iter().copied().map(|chunk| chunk.as_chunk()))
        .chain(other_chunks)
        .collect();

    Ok(ChunksVc::cell(chunks))
}
