use turbo_tasks::Vc;
use turbopack_core::{asset::Asset, chunk::ChunkingContext, module::Module, output::OutputAsset};

#[turbo_tasks::value_trait]
pub trait CssEmbed: Module + Asset {
    #[turbo_tasks::function]
    fn embedded_asset(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn OutputAsset>>;
}
