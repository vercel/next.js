use turbo_tasks::Vc;
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkableModule, ChunkingContext},
    module::Module,
    output::{OutputAsset, OutputAssets},
};

#[turbo_tasks::value_trait]
pub trait CssEmbeddable: ChunkableModule + Module + Asset {
    fn as_css_embed(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn CssEmbed>>;
}

#[turbo_tasks::value_trait]
pub trait CssEmbed {
    /// A [CssEmbed] can describe different `references` than its original
    /// [Module].
    /// TODO(alexkirsz) This should have a default impl that returns empty
    /// references.
    fn references(self: Vc<Self>) -> Vc<OutputAssets>;
    fn embeddable_asset(self: Vc<Self>) -> Vc<Box<dyn OutputAsset>>;
}
