use std::collections::BTreeSet;

use anyhow::{bail, Result};
use serde_json::json;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileSystem, FileSystemPath, VirtualFileSystem};
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
    output_root: ResolvedVc<FileSystemPath>,
    project_root: ResolvedVc<FileSystemPath>,
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
        output_root: ResolvedVc<FileSystemPath>,
        project_root: ResolvedVc<FileSystemPath>,
        client_fs: Vc<Box<dyn FileSystem>>,
        additional_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
    ) -> Vc<Self> {
        NftJsonAsset {
            chunk,
            output_root,
            project_root,
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
        let project_root = this.project_root.await?;
        let output_root = this.output_root.await?;
        let nft_folder = self.ident().path().parent().await?;

        if let Some(subdir) = output_root.path.strip_prefix(&*project_root.path) {
            Ok(this
                .project_root
                .root()
                .join(subdir.into())
                .join(nft_folder.path.clone()))
        } else {
            // TODO: what are the implications of this?
            bail!("output fs not inside project fs");
        }
    }

    #[turbo_tasks::function]
    async fn nft_folder(self: Vc<Self>) -> Vc<FileSystemPath> {
        self.ident().path().parent()
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
        let path_ref = path.await?;
        let path_fs = path_ref.fs;
        let nft_folder = self.ident().path().parent().await?;

        // include assets in the outputs such as referenced chunks
        if path_ref.is_inside_ref(&*(this.output_root.await?)) {
            return Ok(Vc::cell(Some(
                nft_folder.get_relative_path_to(&path_ref).unwrap(),
            )));
        }

        // include assets in the project root such as images
        if path_ref.is_inside_ref(&*(this.project_root.await?)) {
            return Ok(Vc::cell(Some(
                self.ident_in_project_fs()
                    .await?
                    .get_relative_path_to(&path_ref)
                    .unwrap(),
            )));
        }

        // assets that are needed on the client side such as fonts and icons
        if path_fs == this.client_fs.to_resolved().await? {
            return Ok(Vc::cell(Some(
                self.ident_in_client_fs()
                    .await?
                    .get_relative_path_to(&path_ref)
                    .unwrap()
                    .replace("/_next/", "/.next/")
                    .into(),
            )));
        }

        // items that are on the externals file system
        if let Some(path_fs) = Vc::try_resolve_downcast_type::<VirtualFileSystem>(*path_fs).await? {
            if path_fs.await?.name == "traced" {
                return Ok(Vc::cell(Some(
                    self.ident_in_project_fs()
                        .await?
                        .get_relative_path_to(
                            &*this.project_root.root().join(path_ref.path.clone()).await?,
                        )
                        .unwrap(),
                )));
            }
        }

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
        let mut result = BTreeSet::new();

        let chunk = this.chunk.to_resolved().await?;
        let entries = this
            .additional_assets
            .iter()
            .copied()
            .chain(std::iter::once(chunk))
            .collect();
        for referenced_chunk in all_assets_from_entries(Vc::cell(entries)).await? {
            if chunk == referenced_chunk.to_resolved().await? {
                continue;
            }

            let specifier = self
                .get_output_specifier(referenced_chunk.ident().path())
                .await?;
            if let Some(specifier) = &*specifier {
                result.insert(specifier.clone());
            }
        }

        let json = json!({
          "version": 1,
          "files": result
        });

        Ok(AssetContent::file(File::from(json.to_string()).into()))
    }
}
