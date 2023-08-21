use std::io::Write;

use anyhow::{bail, Result};
use indexmap::indexmap;
use turbo_tasks::{TryJoinIterExt, Value, Vc};
use turbo_tasks_fs::FileSystemPathOption;
use turbopack_binding::{
    turbo::tasks_fs::{rope::RopeBuilder, File, FileContent, FileSystemPath},
    turbopack::{
        core::{
            asset::{Asset, AssetContent},
            chunk::{
                ChunkData, ChunkableModule, ChunkingContext, ChunksData, EvaluatableAsset,
                EvaluatableAssets,
            },
            context::AssetContext,
            ident::AssetIdent,
            module::Module,
            output::{OutputAsset, OutputAssets},
            proxied_asset::ProxiedAsset,
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::Source,
            virtual_source::VirtualSource,
        },
        dev_server::source::{asset_graph::AssetGraphContentSource, ContentSource},
        ecmascript::{chunk::EcmascriptChunkData, utils::StringifyJs},
    },
};

use crate::{embed_js::next_js_file_path, util::get_asset_path_from_pathname};

#[turbo_tasks::function]
pub async fn create_page_loader(
    server_root: Vc<FileSystemPath>,
    client_context: Vc<Box<dyn AssetContext>>,
    client_chunking_context: Vc<Box<dyn ChunkingContext>>,
    entry_asset: Vc<Box<dyn Source>>,
    pathname: Vc<String>,
    rebase_prefix_path: Vc<FileSystemPathOption>,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let asset = PageLoaderAsset {
        server_root,
        client_context,
        client_chunking_context,
        entry_asset,
        pathname,
        rebase_prefix_path,
    }
    .cell();

    Ok(Vc::upcast(AssetGraphContentSource::new_lazy(
        server_root,
        Vc::upcast(asset),
    )))
}

#[turbo_tasks::function]
pub async fn create_page_loader_entry_module(
    client_context: Vc<Box<dyn AssetContext>>,
    entry_asset: Vc<Box<dyn Source>>,
    pathname: Vc<String>,
) -> Result<Vc<Box<dyn Module>>> {
    let mut result = RopeBuilder::default();
    writeln!(
        result,
        "const PAGE_PATH = {};\n",
        StringifyJs(&*pathname.await?)
    )?;

    let page_loader_path = next_js_file_path("entry/page-loader.ts".to_string());
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

    Ok(client_context.process(
        virtual_source,
        Value::new(ReferenceType::Internal(Vc::cell(indexmap! {
            "PAGE".to_string() => client_context.process(
                entry_asset,
                Value::new(ReferenceType::Entry(EntryReferenceSubType::Page))
            ),
        }))),
    ))
}

#[turbo_tasks::value(shared)]
pub struct PageLoaderAsset {
    pub server_root: Vc<FileSystemPath>,
    pub client_context: Vc<Box<dyn AssetContext>>,
    pub client_chunking_context: Vc<Box<dyn ChunkingContext>>,
    pub entry_asset: Vc<Box<dyn Source>>,
    pub pathname: Vc<String>,
    pub rebase_prefix_path: Vc<FileSystemPathOption>,
}

#[turbo_tasks::value_impl]
impl PageLoaderAsset {
    #[turbo_tasks::function]
    pub fn new(
        server_root: Vc<FileSystemPath>,
        client_context: Vc<Box<dyn AssetContext>>,
        client_chunking_context: Vc<Box<dyn ChunkingContext>>,
        entry_asset: Vc<Box<dyn Source>>,
        pathname: Vc<String>,
        rebase_prefix_path: Vc<FileSystemPathOption>,
    ) -> Vc<Self> {
        Self {
            server_root,
            client_context,
            client_chunking_context,
            entry_asset,
            pathname,
            rebase_prefix_path,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn get_page_chunks(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = &*self.await?;

        let page_loader_entry_asset =
            create_page_loader_entry_module(this.client_context, this.entry_asset, this.pathname);

        let Some(module) =
            Vc::try_resolve_sidecast::<Box<dyn EvaluatableAsset>>(page_loader_entry_asset).await?
        else {
            bail!("internal module must be evaluatable");
        };

        Ok(this.client_chunking_context.evaluated_chunk_group(
            module.as_root_chunk(this.client_chunking_context),
            EvaluatableAssets::one(module),
        ))
    }

    #[turbo_tasks::function]
    async fn chunks_data(
        self: Vc<Self>,
        rebase_prefix_path: Vc<FileSystemPathOption>,
    ) -> Result<Vc<ChunksData>> {
        let this = self.await?;
        let mut chunks = self.get_page_chunks();

        // If we are provided a prefix path, we need to rewrite our chunk paths to
        // remove that prefix.
        if let Some(rebase_path) = &*rebase_prefix_path.await? {
            let root_path = rebase_path.root();
            let rebased = chunks
                .await?
                .iter()
                .map(|chunk| {
                    Vc::upcast(ProxiedAsset::new(
                        *chunk,
                        FileSystemPath::rebase(chunk.ident().path(), *rebase_path, root_path),
                    ))
                })
                .collect();
            chunks = Vc::cell(rebased);
        };

        Ok(ChunkData::from_assets(this.server_root, chunks))
    }
}

#[turbo_tasks::function]
fn page_loader_chunk_reference_description() -> Vc<String> {
    Vc::cell("page loader chunk".to_string())
}

#[turbo_tasks::value_impl]
impl OutputAsset for PageLoaderAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(AssetIdent::from_path(self.server_root.join(format!(
            "_next/static/chunks/pages{}",
            get_asset_path_from_pathname(&self.pathname.await?, ".js")
        ))))
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let chunks = self.get_page_chunks().await?;

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

        // The asset emits `__turbopack_load_page_chunks__`, which is implemented using
        // `__turbopack_load__`. `__turbopack_load__` will prefix the path with the
        // relative client path (`_next/`), so we need to remove that when we emit the
        // chunk paths.
        let chunks_data = self.chunks_data(this.rebase_prefix_path).await?;
        let chunks_data = chunks_data.iter().try_join().await?;
        let chunks_data: Vec<_> = chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let content = format!(
            "__turbopack_load_page_chunks__({}, {:#})\n",
            StringifyJs(&this.pathname.await?),
            StringifyJs(&chunks_data)
        );

        Ok(AssetContent::file(File::from(content).into()))
    }
}
