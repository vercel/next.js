use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    ident::AssetIdent,
    module::Module,
    output::OutputAsset,
    source::Source,
};
use turbopack_css::embed::CssEmbed;

use crate::output_asset::StaticOutputAsset;

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("static in css".into())
}

#[turbo_tasks::value]
#[derive(Clone)]
pub struct StaticUrlCssModule {
    pub source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl StaticUrlCssModule {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>) -> Vc<Self> {
        Self::cell(StaticUrlCssModule { source })
    }

    #[turbo_tasks::function]
    async fn static_output_asset(
        &self,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<StaticOutputAsset> {
        StaticOutputAsset::new(*chunking_context, *self.source)
    }
}

#[turbo_tasks::value_impl]
impl Module for StaticUrlCssModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().with_modifier(modifier())
    }
}

#[turbo_tasks::value_impl]
impl Asset for StaticUrlCssModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl CssEmbed for StaticUrlCssModule {
    #[turbo_tasks::function]
    fn embedded_asset(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn OutputAsset>> {
        Vc::upcast(self.static_output_asset(chunking_context))
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
