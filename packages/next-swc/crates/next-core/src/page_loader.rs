use std::io::Write;

use anyhow::{bail, Result};
use indexmap::indexmap;
use turbo_binding::{
    turbo::tasks_fs::{rope::RopeBuilder, File, FileContent, FileSystemPathVc},
    turbopack::{
        core::{
            asset::{Asset, AssetContentVc, AssetVc, AssetsVc},
            chunk::{ChunkableAsset, ChunkingContext, ChunkingContextVc, EvaluatableAssetsVc},
            context::{AssetContext, AssetContextVc},
            ident::AssetIdentVc,
            reference::{AssetReferencesVc, SingleAssetReferenceVc},
            reference_type::{EntryReferenceSubType, ReferenceType},
            virtual_asset::VirtualAssetVc,
        },
        dev_server::source::{asset_graph::AssetGraphContentSourceVc, ContentSourceVc},
        ecmascript::{
            utils::StringifyJs, EcmascriptInputTransform, EcmascriptInputTransformsVc,
            EcmascriptModuleAssetType, EcmascriptModuleAssetVc, InnerAssetsVc,
        },
    },
};
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value};

use crate::{embed_js::next_js_file_path, util::get_asset_path_from_route};

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

#[turbo_tasks::value_impl]
impl PageLoaderAssetVc {
    #[turbo_tasks::function]
    async fn get_loader_entry_asset(self) -> Result<AssetVc> {
        let this = &*self.await?;

        let mut result = RopeBuilder::default();
        writeln!(
            result,
            "const PAGE_PATH = {};\n",
            StringifyJs(&format_args!("/{}", &*this.pathname.await?))
        )?;

        let page_loader_path = next_js_file_path("entry/page-loader.ts");
        let base_code = page_loader_path.read();
        if let FileContent::Content(base_file) = &*base_code.await? {
            result += base_file.content()
        } else {
            bail!("required file `entry/page-loader.ts` not found");
        }

        let file = File::from(result.build());

        Ok(VirtualAssetVc::new(page_loader_path, file.into()).into())
    }

    #[turbo_tasks::function]
    async fn get_page_chunks(self) -> Result<AssetsVc> {
        let this = &*self.await?;

        let loader_entry_asset = self.get_loader_entry_asset();

        let asset = EcmascriptModuleAssetVc::new_with_inner_assets(
            loader_entry_asset,
            this.client_context,
            Value::new(EcmascriptModuleAssetType::Typescript),
            EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::TypeScript {
                use_define_for_class_fields: false,
            }]),
            Default::default(),
            this.client_context.compile_time_info(),
            InnerAssetsVc::cell(indexmap! {
                "PAGE".to_string() => this.client_context.process(this.entry_asset, Value::new(ReferenceType::Entry(EntryReferenceSubType::Page)))
            }),
        );

        Ok(this.client_chunking_context.evaluated_chunk_group(
            asset.as_root_chunk(this.client_chunking_context),
            EvaluatableAssetsVc::one(asset.into()),
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
        Ok(AssetIdentVc::from_path(
            self.server_root
                .join("_next/static/chunks/pages")
                .join(&get_asset_path_from_route(&self.pathname.await?, ".js")),
        ))
    }

    #[turbo_tasks::function]
    async fn content(self_vc: PageLoaderAssetVc) -> Result<AssetContentVc> {
        let this = &*self_vc.await?;

        let chunks = self_vc.get_page_chunks().await?;
        let server_root = this.server_root.await?;

        let chunk_paths: Vec<_> = chunks
            .iter()
            .map(|chunk| {
                let server_root = server_root.clone();
                async move {
                    Ok(server_root
                        .get_path_to(&*chunk.ident().path().await?)
                        .map(|path| path.to_string()))
                }
            })
            .try_join()
            .await?
            .into_iter()
            .flatten()
            .collect();

        let content = format!(
            "__turbopack_load_page_chunks__({}, {:#})\n",
            StringifyJs(&this.pathname.await?),
            StringifyJs(&chunk_paths)
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

        Ok(AssetReferencesVc::cell(references))
    }
}
