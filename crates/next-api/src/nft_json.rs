use anyhow::{bail, Result};
use serde_json::json;
use turbo_tasks::{RcStr, ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{DiskFileSystem, File, FileSystem, FileSystemPath, VirtualFileSystem};
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    output::OutputAsset,
    reference::all_assets_from_entries,
};

/// A json file that produces references to all files that are needed by the given module
/// at runtime. This will include, for example, node native modules, unanalyzable packages,
/// client side chunks, etc.
///
/// With this file, users can determine the minimum set of files that are needed alongside
/// their bundle.
#[turbo_tasks::value(shared)]
pub struct NftJsonAsset {
    /// The chunk for which the asset is being generated
    chunk: Vc<Box<dyn OutputAsset>>,
    output_fs: Vc<DiskFileSystem>,
    project_fs: Vc<DiskFileSystem>,
    client_fs: Vc<Box<dyn FileSystem>>,
    /// Additional assets to include in the nft json. This can be used to manually collect assets
    /// that are known to be required but are not in the graph yet, for whatever reason.
    ///
    /// An example of this is the two-phase approach used by the `ClientReferenceManifest` in
    /// next.js.
    additional_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
}

#[turbo_tasks::value_impl]
impl NftJsonAsset {
    #[turbo_tasks::function]
    pub fn new(
        chunk: Vc<Box<dyn OutputAsset>>,
        output_fs: Vc<DiskFileSystem>,
        project_fs: Vc<DiskFileSystem>,
        client_fs: Vc<Box<dyn FileSystem>>,
        additional_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
    ) -> Vc<Self> {
        NftJsonAsset {
            chunk,
            output_fs,
            project_fs,
            client_fs,
            additional_assets,
        }
        .cell()
    }
}

#[turbo_tasks::value(transparent)]
pub struct OutputSpecifier(Option<RcStr>);

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
            // TODO: what are the implications of this?
            bail!("output fs not inside project fs");
        }
    }

    #[turbo_tasks::function]
    async fn ident_in_client_fs(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(self
            .await?
            .client_fs
            .root()
            .join(self.ident().path().parent().await?.path.clone()))
    }

    #[turbo_tasks::function]
    async fn get_output_specifier(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
    ) -> Result<Vc<OutputSpecifier>> {
        let this = self.await?;
        let path_fs = path.fs().resolve().await?;
        let path_ref = path.await?;
        let nft_folder = self.ident().path().parent().await?;

        if path_fs == Vc::upcast(this.output_fs.resolve().await?) {
            // e.g. a referenced chunk
            return Ok(Vc::cell(Some(
                nft_folder.get_relative_path_to(&path_ref).unwrap(),
            )));
        } else if path_fs == Vc::upcast(this.project_fs.resolve().await?) {
            return Ok(Vc::cell(Some(
                self.ident_in_project_fs()
                    .await?
                    .get_relative_path_to(&path_ref)
                    .unwrap(),
            )));
        } else if path_fs == Vc::upcast(this.client_fs.resolve().await?) {
            return Ok(Vc::cell(Some(
                self.ident_in_client_fs()
                    .await?
                    .get_relative_path_to(&path_ref)
                    .unwrap()
                    .replace("/_next/", "/.next/")
                    .into(),
            )));
        }

        if let Some(path_fs) = Vc::try_resolve_downcast_type::<VirtualFileSystem>(path_fs).await? {
            if path_fs.await?.name == "externals" || path_fs.await?.name == "traced" {
                return Ok(Vc::cell(Some(
                    self.ident_in_project_fs()
                        .await?
                        .get_relative_path_to(
                            &*this.project_fs.root().join(path_ref.path.clone()).await?,
                        )
                        .unwrap(),
                )));
            }
        }

        println!("Unknown filesystem for {}", path.to_string().await?);
        Ok(Vc::cell(None))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for NftJsonAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let path = self.chunk.ident().path().await?;
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

        let chunk = this.chunk.to_resolved().await?;
        let entries = this
            .additional_assets
            .iter()
            .copied()
            .chain(std::iter::once(chunk))
            .collect();
        for referenced_chunk in all_assets_from_entries(Vc::cell(entries)).await? {
            if referenced_chunk.ident().path().await?.extension_ref() == Some("map") {
                continue;
            }

            if chunk == referenced_chunk.to_resolved().await? {
                continue;
            }

            let specifier = self
                .get_output_specifier(referenced_chunk.ident().path())
                .await?;
            if let Some(specifier) = &*specifier {
                result.push(specifier.clone());
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
