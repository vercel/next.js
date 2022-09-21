use turbo_tasks::{ValueToString, ValueToStringVc};
use turbopack_core::{asset::AssetVc, chunk::ChunkingContextVc, reference::AssetReferencesVc};

#[turbo_tasks::value_trait]
pub trait CssEmbeddable: ValueToString {
    fn as_css_embed(&self, context: ChunkingContextVc) -> CssEmbedVc;
}

#[turbo_tasks::value_trait]
pub trait CssEmbed {
    /// A [CssEmbed] can describe different `references` than its original
    /// [Asset].
    /// TODO(alexkirsz) This should have a default impl that returns empty
    /// references.
    fn references(&self) -> AssetReferencesVc;
    fn embeddable_asset(&self) -> AssetVc;
}
