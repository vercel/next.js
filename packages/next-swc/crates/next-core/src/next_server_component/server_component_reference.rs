use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbopack_binding::turbopack::core::{
    asset::{Asset, AssetVc},
    chunk::{
        ChunkableModuleReference, ChunkableModuleReferenceVc, ChunkingType, ChunkingTypeOptionVc,
    },
    reference::{AssetReference, AssetReferenceVc},
    resolve::{ResolveResult, ResolveResultVc},
};

#[turbo_tasks::value]
pub struct NextServerComponentModuleReference {
    asset: AssetVc,
}

#[turbo_tasks::value_impl]
impl NextServerComponentModuleReferenceVc {
    #[turbo_tasks::function]
    pub fn new(asset: AssetVc) -> Self {
        NextServerComponentModuleReference { asset }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for NextServerComponentModuleReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "Next.js server component {}",
            self.asset.ident().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for NextServerComponentModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::asset(self.asset).cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for NextServerComponentModuleReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> ChunkingTypeOptionVc {
        // TODO(alexkirsz) Instead of isolated parallel, have the server component
        // reference create a new chunk group entirely?
        ChunkingTypeOptionVc::cell(Some(ChunkingType::IsolatedParallel))
    }
}
