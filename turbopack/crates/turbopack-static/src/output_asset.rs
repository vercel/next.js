use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    output::OutputAsset,
    source::Source,
};
#[turbo_tasks::value]
pub struct StaticOutputAsset {
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    source: ResolvedVc<Box<dyn Source>>,
    tag: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl StaticOutputAsset {
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        source: ResolvedVc<Box<dyn Source>>,
        tag: Option<RcStr>,
    ) -> Vc<Self> {
        Self::cell(StaticOutputAsset {
            chunking_context,
            source,
            tag,
        })
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for StaticOutputAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        let content = self.source.content();
        let content_hash = if let AssetContent::File(file) = &*content.await? {
            if let FileContent::Content(file) = &*file.await? {
                turbo_tasks_hash::hash_xxh3_hash64(file.content())
            } else {
                anyhow::bail!("StaticAsset::path: not found")
            }
        } else {
            anyhow::bail!("StaticAsset::path: unsupported file content")
        };
        let content_hash_b16 = turbo_tasks_hash::encode_hex(content_hash);
        Ok(self.chunking_context.asset_path(
            content_hash_b16.into(),
            self.source.ident(),
            self.tag.clone(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for StaticOutputAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}
