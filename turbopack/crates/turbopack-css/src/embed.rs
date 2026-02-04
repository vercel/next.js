use turbo_tasks::Vc;
use turbopack_core::{chunk::ChunkingContext, module::Module, output::OutputAsset};

#[turbo_tasks::value_trait]
pub trait CssEmbed: Module {
    #[turbo_tasks::function]
    fn embedded_asset(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn OutputAsset>>;
}
