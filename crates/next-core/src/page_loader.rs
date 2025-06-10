use std::io::Write;

use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc, fxindexmap};
use turbo_tasks_fs::{
    self, File, FileContent, FileSystemPath, FileSystemPathOption, rope::RopeBuilder,
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkData, ChunksData},
    context::AssetContext,
    module::Module,
    output::{OutputAsset, OutputAssets},
    proxied_asset::ProxiedAsset,
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::{chunk::EcmascriptChunkData, utils::StringifyJs};

use crate::{embed_js::next_js_file_path, util::get_asset_path_from_pathname};

#[turbo_tasks::function]
pub async fn create_page_loader_entry_module(
    client_context: Vc<Box<dyn AssetContext>>,
    entry_asset: Vc<Box<dyn Source>>,
    pathname: RcStr,
) -> Result<Vc<Box<dyn Module>>> {
    let mut result = RopeBuilder::default();
    writeln!(result, "const PAGE_PATH = {};\n", StringifyJs(&pathname))?;

    let page_loader_path = next_js_file_path(rcstr!("entry/page-loader.ts"));
    let base_code = page_loader_path.read();
    if let FileContent::Content(base_file) = &*base_code.await? {
        result += base_file.content()
    } else {
        bail!("required file `entry/page-loader.ts` not found");
    }

    let file = File::from(result.build());

    let virtual_source = Vc::upcast(VirtualSource::new(
        page_loader_path,
        AssetContent::file(file.into()),
    ));

    let module = client_context
        .process(
            entry_asset,
            ReferenceType::Entry(EntryReferenceSubType::Page),
        )
        .module()
        .to_resolved()
        .await?;

    let module = client_context
        .process(
            virtual_source,
            ReferenceType::Internal(ResolvedVc::cell(fxindexmap! {
                rcstr!("PAGE") => module,
            })),
        )
        .module();
    Ok(module)
}

// This is only used in development mode. A special chunk is emitted for each page that contains the
// page's chunks. This chunk is used to load the page's chunks in the browser on navigation.
// In production, the page's chunks are loaded by the page loader using the build manifest.
// The reason we need this in development is that the chunks are not known ahead of time.
#[turbo_tasks::value(shared)]
pub struct PageLoaderAsset {
    pub server_root: ResolvedVc<FileSystemPath>,
    pub pathname: RcStr,
    pub rebase_prefix_path: ResolvedVc<FileSystemPathOption>,
    pub page_chunks: ResolvedVc<OutputAssets>,
}

#[turbo_tasks::value_impl]
impl PageLoaderAsset {
    #[turbo_tasks::function]
    pub fn new(
        server_root: ResolvedVc<FileSystemPath>,
        pathname: RcStr,
        rebase_prefix_path: ResolvedVc<FileSystemPathOption>,
        page_chunks: ResolvedVc<OutputAssets>,
    ) -> Vc<Self> {
        Self {
            server_root,
            pathname,
            rebase_prefix_path,
            page_chunks,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn chunks_data(
        &self,
        rebase_prefix_path: Vc<FileSystemPathOption>,
    ) -> Result<Vc<ChunksData>> {
        let mut chunks = self.page_chunks;

        // If we are provided a prefix path, we need to rewrite our chunk paths to
        // remove that prefix.
        if let Some(rebase_path) = &*rebase_prefix_path.await? {
            let root_path = rebase_path.root();
            let rebased = chunks
                .await?
                .iter()
                .map(|&chunk| {
                    Vc::upcast::<Box<dyn OutputAsset>>(ProxiedAsset::new(
                        *chunk,
                        FileSystemPath::rebase(chunk.path(), **rebase_path, root_path),
                    ))
                    .to_resolved()
                })
                .try_join()
                .await?;
            chunks = ResolvedVc::cell(rebased);
        };

        Ok(ChunkData::from_assets(*self.server_root, *chunks))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for PageLoaderAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        let root = self
            .rebase_prefix_path
            .await?
            .map_or(*self.server_root, |path| *path);
        Ok(root.join(
            format!(
                "static/chunks/pages{}",
                get_asset_path_from_pathname(&self.pathname, ".js")
            )
            .into(),
        ))
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let chunks = self.await?.page_chunks.await?;

        let mut references = Vec::with_capacity(chunks.len());
        for &chunk in chunks.iter() {
            references.push(chunk);
        }

        // We don't need to strip the client relative prefix, because we won't be using
        // these reference paths with `__turbopack_load__`.
        for chunk_data in &*self.chunks_data(FileSystemPathOption::none()).await? {
            references.extend(chunk_data.references().await?.iter().copied());
        }

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for PageLoaderAsset {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = &*self.await?;

        let chunks_data = self.chunks_data(*this.rebase_prefix_path).await?;
        let chunks_data = chunks_data.iter().try_join().await?;
        let chunks_data: Vec<_> = chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let content = format!(
            "__turbopack_load_page_chunks__({}, {:#})\n",
            StringifyJs(&this.pathname),
            StringifyJs(&chunks_data)
        );

        Ok(AssetContent::file(File::from(content).into()))
    }
}
