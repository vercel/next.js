use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{ChunkableModule, ChunkableModuleVc, ChunkingContextVc},
    module::{Module, ModuleVc},
    reference::AssetReferencesVc,
};

#[turbo_tasks::value_trait]
pub trait CssEmbeddable: ChunkableModule + Module + Asset {
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
