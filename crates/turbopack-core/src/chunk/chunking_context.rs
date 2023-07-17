use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;

use super::{Chunk, EvaluatableAssets};
use crate::{
    environment::Environment,
    ident::AssetIdent,
    module::Module,
    output::{OutputAsset, OutputAssets},
};

/// A context for the chunking that influences the way chunks are created
#[turbo_tasks::value_trait]
pub trait ChunkingContext {
    fn context_path(self: Vc<Self>) -> Vc<FileSystemPath>;
    fn output_root(self: Vc<Self>) -> Vc<FileSystemPath>;

    // TODO remove this, a chunking context should not be bound to a specific
    // environment since this can change due to transitions in the module graph
    fn environment(self: Vc<Self>) -> Vc<Environment>;

    // TODO(alexkirsz) Remove this from the chunking context. This should be at the
    // discretion of chunking context implementors. However, we currently use this
    // in a couple of places in `turbopack-css`, so we need to remove that
    // dependency first.
    fn chunk_path(self: Vc<Self>, ident: Vc<AssetIdent>, extension: String) -> Vc<FileSystemPath>;

    // TODO(alexkirsz) Remove this from the chunking context.
    /// Reference Source Map Assets for chunks
    fn reference_chunk_source_maps(self: Vc<Self>, chunk: Vc<Box<dyn OutputAsset>>) -> Vc<bool>;

    fn can_be_in_same_chunk(
        self: Vc<Self>,
        asset_a: Vc<Box<dyn Module>>,
        asset_b: Vc<Box<dyn Module>>,
    ) -> Vc<bool>;

    fn asset_path(
        self: Vc<Self>,
        content_hash: String,
        original_asset_ident: Vc<AssetIdent>,
    ) -> Vc<FileSystemPath>;

    fn is_hot_module_replacement_enabled(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }

    fn layer(self: Vc<Self>) -> Vc<String> {
        Vc::cell("".to_string())
    }

    fn with_layer(self: Vc<Self>, layer: String) -> Vc<Box<dyn ChunkingContext>>;

    fn chunk_group(self: Vc<Self>, entry: Vc<Box<dyn Chunk>>) -> Vc<OutputAssets>;

    fn evaluated_chunk_group(
        self: Vc<Self>,
        entry: Vc<Box<dyn Chunk>>,
        evaluatable_assets: Vc<EvaluatableAssets>,
    ) -> Vc<OutputAssets>;
}
