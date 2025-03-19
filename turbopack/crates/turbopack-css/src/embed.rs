use turbo_tasks::Vc;
use turbopack_core::{chunk::ChunkItem, output::OutputAsset};

#[turbo_tasks::value_trait]
pub trait CssEmbed: ChunkItem {
    fn embedded_asset(self: Vc<Self>) -> Vc<Box<dyn OutputAsset>>;
}
