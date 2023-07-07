use std::io::Write;

use anyhow::{bail, Result};
use indexmap::indexmap;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value};
use turbopack_binding::{
    turbo::tasks_fs::{rope::RopeBuilder, File, FileContent, FileSystemPathVc},
    turbopack::{
        core::{
            asset::{Asset, AssetContentVc, AssetVc, AssetsVc},
            chunk::{
                ChunkDataVc, ChunkableAsset, ChunkingContext, ChunkingContextVc, ChunksDataVc,
                EvaluatableAssetVc, EvaluatableAssetsVc,
            },
            context::{AssetContext, AssetContextVc},
            ident::AssetIdentVc,
            module::ModuleVc,
            reference::{AssetReferencesVc, SingleAssetReferenceVc},
            reference_type::{EntryReferenceSubType, InnerAssetsVc, ReferenceType},
            virtual_asset::VirtualAssetVc,
        },
        dev_server::source::{asset_graph::AssetGraphContentSourceVc, ContentSourceVc},
        ecmascript::{chunk::EcmascriptChunkData, utils::StringifyJs},
    },
};

use crate::{embed_js::next_js_file_path, util::get_asset_path_from_pathname};

#[turbo_tasks::function]
pub async fn create_page_loader(
    server_root: FileSystemPathVc,
    client_context: AssetContextVc,
    client_chunking_context: ChunkingContextVc,
    entry_asset: AssetVc,
    pathname: StringVc,
) -> Result<ContentSourceVc> {
    let asset = PageLoaderAsset {
        server_root,
        client_context,
        client_chunking_context,
        entry_asset,
        pathname,
    }
    .cell();

    Ok(AssetGraphContentSourceVc::new_lazy(server_root, asset.into()).into())
}

#[turbo_tasks::value(shared)]
pub struct PageLoaderAsset {
    pub server_root: FileSystemPathVc,
    pub client_context: AssetContextVc,
    pub client_chunking_context: ChunkingContextVc,
    pub entry_asset: AssetVc,
    pub pathname: StringVc,
}

#[turbo_tasks::function]
pub async fn create_page_loader_entry_asset(
    client_context: AssetContextVc,
    entry_asset: AssetVc,
    pathname: StringVc,
) -> Result<ModuleVc> {
    let mut result = RopeBuilder::default();
    writeln!(
        result,
        "const PAGE_PATH = {};\n",
        StringifyJs(&*pathname.await?)
    )?;

    let page_loader_path = next_js_file_path("entry/page-loader.ts");
    let base_code = page_loader_path.read();
    if let FileContent::Content(base_file) = &*base_code.await? {
        result += base_file.content()
    } else {
        bail!("required file `entry/page-loader.ts` not found");
    }

    let file = File::from(result.build());

    let virtual_asset = VirtualAssetVc::new(page_loader_path, file.into()).into();

    Ok(client_context.process(
        virtual_asset,
        Value::new(ReferenceType::Internal(InnerAssetsVc::cell(indexmap! {
            "PAGE".to_string() => client_context.process(
                entry_asset,
                Value::new(ReferenceType::Entry(EntryReferenceSubType::Page))
            ).into(),
        }))),
    ))
}

#[turbo_tasks::value_impl]
impl PageLoaderAssetVc {
    #[turbo_tasks::function]
    async fn get_page_chunks(self) -> Result<AssetsVc> {
        let this = &*self.await?;

        let page_loader_entry_asset =
            create_page_loader_entry_asset(this.client_context, this.entry_asset, this.pathname);

        let Some(module) = EvaluatableAssetVc::resolve_from(page_loader_entry_asset).await? else {
            bail!("internal module must be evaluatable");
        };

        Ok(this.client_chunking_context.evaluated_chunk_group(
            module.as_root_chunk(this.client_chunking_context),
            EvaluatableAssetsVc::one(module),
        ))
    }

    #[turbo_tasks::function]
    async fn chunks_data(self) -> Result<ChunksDataVc> {
        let this = self.await?;
        Ok(ChunkDataVc::from_assets(
            this.server_root,
            self.get_page_chunks(),
        ))
    }
}

#[turbo_tasks::function]
fn page_loader_chunk_reference_description() -> StringVc {
    StringVc::cell("page loader chunk".to_string())
}

#[turbo_tasks::value_impl]
impl Asset for PageLoaderAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<AssetIdentVc> {
        Ok(AssetIdentVc::from_path(self.server_root.join(&format!(
            "_next/static/chunks/pages{}",
            get_asset_path_from_pathname(&self.pathname.await?, ".js")
        ))))
    }

    #[turbo_tasks::function]
    async fn content(self_vc: PageLoaderAssetVc) -> Result<AssetContentVc> {
        let this = &*self_vc.await?;

        let chunks_data = self_vc.chunks_data().await?;
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

        Ok(AssetContentVc::from(File::from(content)))
    }

    #[turbo_tasks::function]
    async fn references(self_vc: PageLoaderAssetVc) -> Result<AssetReferencesVc> {
        let chunks = self_vc.get_page_chunks().await?;

        let mut references = Vec::with_capacity(chunks.len());
        for chunk in chunks.iter() {
            references.push(
                SingleAssetReferenceVc::new(*chunk, page_loader_chunk_reference_description())
                    .into(),
            );
        }

        for chunk_data in &*self_vc.chunks_data().await? {
            references.extend(chunk_data.references().await?.iter().copied());
        }

        Ok(AssetReferencesVc::cell(references))
    }
}
