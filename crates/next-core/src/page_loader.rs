use std::io::Write;

use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc, fxindexmap};
use turbo_tasks_fs::{
    self, File, FileContent, FileSystemPath, FileSystemPathOption, rope::RopeBuilder,
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkData, ChunkingContext, ChunksData},
    context::AssetContext,
    ident::AssetIdent,
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

    let page_loader_path = next_js_file_path(rcstr!("entry/page-loader.ts"))
        .owned()
        .await?;
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

#[turbo_tasks::value(shared)]
pub struct PageLoaderAsset {
    pub server_root: FileSystemPath,
    pub pathname: RcStr,
    pub rebase_prefix_path: ResolvedVc<FileSystemPathOption>,
    pub page_chunks: ResolvedVc<OutputAssets>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub use_fixed_path: bool,
}

#[turbo_tasks::value_impl]
impl PageLoaderAsset {
    #[turbo_tasks::function]
    pub fn new(
        server_root: FileSystemPath,
        pathname: RcStr,
        rebase_prefix_path: ResolvedVc<FileSystemPathOption>,
        page_chunks: ResolvedVc<OutputAssets>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        use_fixed_path: bool,
    ) -> Vc<Self> {
        Self {
            server_root,
            pathname,
            rebase_prefix_path,
            page_chunks,
            chunking_context,
            use_fixed_path,
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
            let root_path = rebase_path.root().owned().await?;
            let rebased = chunks
                .await?
                .iter()
                .map(|&chunk| {
                    let root_path = root_path.clone();

                    async move {
                        Vc::upcast::<Box<dyn OutputAsset>>(ProxiedAsset::new(
                            *chunk,
                            FileSystemPath::rebase(
                                chunk.path().owned().await?,
                                rebase_path.clone(),
                                root_path.clone(),
                            )
                            .owned()
                            .await?,
                        ))
                        .to_resolved()
                        .await
                    }
                })
                .try_join()
                .await?;
            chunks = ResolvedVc::cell(rebased);
        };

        Ok(ChunkData::from_assets(self.server_root.clone(), *chunks))
    }
}

impl PageLoaderAsset {
    async fn ident_for_path(&self) -> Result<Vc<AssetIdent>> {
        let rebase_prefix_path = self.rebase_prefix_path.await?;
        let root = rebase_prefix_path.as_ref().unwrap_or(&self.server_root);
        Ok(AssetIdent::from_path(root.join(&format!(
            "static/chunks/pages{}",
            get_asset_path_from_pathname(&self.pathname, ".js")
        ))?)
        .with_modifier(rcstr!("page loader asset")))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for PageLoaderAsset {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let ident = this.ident_for_path().await?;
        if this.use_fixed_path {
            // In development mode, don't include a content hash and put the chunk at e.g.
            // `static/chunks/pages/page2.js`, so that the dev runtime can request it at a known
            // path.
            // https://github.com/vercel/next.js/blob/84873e00874e096e6c4951dcf070e8219ed414e5/packages/next/src/client/route-loader.ts#L256-L271
            Ok(ident.path())
        } else {
            Ok(this
                .chunking_context
                .chunk_path(Some(Vc::upcast(self)), ident, None, rcstr!(".js")))
        }
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        Ok(*self.await?.page_chunks)
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
