use anyhow::{bail, Result};
use serde_json::json;
use turbo_tasks::{RcStr, ValueToString, Vc};
use turbo_tasks_fs::{DiskFileSystem, File, FileSystem, FileSystemPath, VirtualFileSystem};
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    module::Module,
    output::OutputAsset,
    reference::all_assets_from_entries,
};

#[turbo_tasks::value(shared)]
pub struct NftJsonAsset {
    entry: Vc<Box<dyn Module>>,
    chunk: Option<Vc<Box<dyn OutputAsset>>>,
    only_externals: bool,
    output_fs: Vc<DiskFileSystem>,
    project_fs: Vc<DiskFileSystem>,
}

#[turbo_tasks::value_impl]
impl NftJsonAsset {
    #[turbo_tasks::function]
    pub fn new(
        entry: Vc<Box<dyn Module>>,
        chunk: Option<Vc<Box<dyn OutputAsset>>>,
        only_externals: bool,
        output_fs: Vc<DiskFileSystem>,
        project_fs: Vc<DiskFileSystem>,
    ) -> Vc<Self> {
        NftJsonAsset {
            entry,
            chunk,
            only_externals,
            output_fs,
            project_fs,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl NftJsonAsset {
    #[turbo_tasks::function]
    async fn ident_in_project_fs(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let project_fs = this.project_fs.await?;
        let output_fs = this.output_fs.await?;
        let nft_folder = self.ident().path().parent().await?;

        if let Some(subdir) = output_fs.root.strip_prefix(&*project_fs.root) {
            Ok(this
                .project_fs
                .root()
                .join(subdir.into())
                .join(nft_folder.path.clone()))
        } else {
            bail!("TODO output fs not inside project fs");
        }
    }

    #[turbo_tasks::function]
    async fn get_output_specifier(self: Vc<Self>, path: Vc<FileSystemPath>) -> Result<Vc<RcStr>> {
        let this = self.await?;
        let path_fs = path.fs().resolve().await?;
        let path_ref = path.await?;
        let nft_folder = self.ident().path().parent().await?;
        if path_fs == Vc::upcast(this.output_fs.resolve().await?) {
            // e.g. a referenced chunk
            return Ok(Vc::cell(
                nft_folder.get_relative_path_to(&path_ref).unwrap(),
            ));
        } else if path_fs == Vc::upcast(this.project_fs.resolve().await?) {
            return Ok(Vc::cell(
                self.ident_in_project_fs()
                    .await?
                    .get_relative_path_to(&path_ref)
                    .unwrap(),
            ));
        }

        if let Some(path_fs) = Vc::try_resolve_downcast_type::<VirtualFileSystem>(path_fs).await? {
            if path_fs.await?.name == "externals" {
                return Ok(Vc::cell(
                    self.ident_in_project_fs()
                        .await?
                        .get_relative_path_to(
                            &*this.project_fs.root().join(path_ref.path.clone()).await?,
                        )
                        .unwrap(),
                ));
            }
        }

        bail!("Unknown filesystem for {}", path.to_string().await?);
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for NftJsonAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        // TODO pass this as a parameter to NftJsonAsset
        let path = if let Some(chunk) = self.chunk {
            chunk.ident()
        } else {
            self.entry.ident()
        }
        .path()
        .await?;
        Ok(AssetIdent::from_path(
            path.fs
                .root()
                .join(format!("{}.nft.json", path.path).into()),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for NftJsonAsset {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = &*self.await?;
        let mut result = Vec::new();

        if let Some(chunk) = this.chunk {
            let chunk = chunk.resolve().await?;
            for referenced_chunk in all_assets_from_entries(Vc::cell(vec![chunk])).await? {
                if referenced_chunk.ident().path().await?.extension_ref() == Some("map") {
                    continue;
                }

                if chunk == referenced_chunk.resolve().await? {
                    continue;
                }

                let specifier = self
                    .get_output_specifier(referenced_chunk.ident().path())
                    .await?;
                result.push(specifier);
            }
        }

        result.sort();
        result.dedup();
        let json = json!({
          "version": 1,
          "files": result
        });

        Ok(AssetContent::file(File::from(json.to_string()).into()))
    }
}
