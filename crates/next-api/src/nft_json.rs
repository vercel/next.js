use std::collections::BTreeSet;

use anyhow::{bail, Result};
use serde_json::json;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystem, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    output::OutputAsset,
    reference::all_assets_from_entries,
};

use crate::project::Project;

/// A json file that produces references to all files that are needed by the given module
/// at runtime. This will include, for example, node native modules, unanalyzable packages,
/// client side chunks, etc.
///
/// With this file, users can determine the minimum set of files that are needed alongside
/// their bundle.
#[turbo_tasks::value(shared)]
pub struct NftJsonAsset {
    project: ResolvedVc<Project>,
    /// The chunk for which the asset is being generated
    chunk: ResolvedVc<Box<dyn OutputAsset>>,
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
        project: ResolvedVc<Project>,
        chunk: ResolvedVc<Box<dyn OutputAsset>>,
        additional_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
    ) -> Vc<Self> {
        NftJsonAsset {
            chunk,
            project,
            additional_assets,
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn output_root(&self) -> Vc<FileSystemPath> {
        self.project.output_fs().root()
    }

    #[turbo_tasks::function]
    fn project_root(&self) -> Vc<FileSystemPath> {
        self.project.project_fs().root()
    }

    #[turbo_tasks::function]
    fn client_root(&self) -> Vc<FileSystemPath> {
        self.project.client_fs().root()
    }

    #[turbo_tasks::function]
    fn project_path(&self) -> Vc<FileSystemPath> {
        self.project.project_path()
    }

    #[turbo_tasks::function]
    async fn dist_dir(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("/{}/", self.project.dist_dir().await?).into(),
        ))
    }
}

#[turbo_tasks::value(transparent)]
pub struct OutputSpecifier(Option<RcStr>);

#[turbo_tasks::value_impl]
impl NftJsonAsset {
    #[turbo_tasks::function]
    async fn ident_folder(self: Vc<Self>) -> Vc<FileSystemPath> {
        self.ident().path().parent()
    }

    #[turbo_tasks::function]
    async fn ident_folder_in_project_fs(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(self
            .project_path()
            .join(self.ident_folder().await?.path.clone()))
    }

    #[turbo_tasks::function]
    async fn ident_folder_in_client_fs(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(self
            .client_root()
            .join(self.ident_folder().await?.path.clone()))
    }

    #[turbo_tasks::function]
    async fn get_output_specifier(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
    ) -> Result<Vc<OutputSpecifier>> {
        let path_ref = path.await?;

        // include assets in the outputs such as referenced chunks
        if path_ref.is_inside_ref(&*(self.output_root().await?)) {
            return Ok(Vc::cell(Some(
                self.ident_folder()
                    .await?
                    .get_relative_path_to(&path_ref)
                    .unwrap(),
            )));
        }

        // include assets in the project root such as images and traced references (externals)
        if path_ref.is_inside_ref(&*(self.project_root().await?)) {
            return Ok(Vc::cell(Some(
                self.ident_folder_in_project_fs()
                    .await?
                    .get_relative_path_to(&path_ref)
                    .unwrap(),
            )));
        }

        // assets that are needed on the client side such as fonts and icons
        if path_ref.is_inside_ref(&*(self.client_root().await?)) {
            return Ok(Vc::cell(Some(
                self.ident_folder_in_client_fs()
                    .await?
                    .get_relative_path_to(&path_ref)
                    .unwrap()
                    .replace("/_next/", &self.dist_dir().await?)
                    .into(),
            )));
        }

        // Make this an error for now, this should effectively be unreachable
        bail!(
            "NftJsonAsset: cannot handle filepath {}",
            path.to_string().await?
        );
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

        let chunk = this.chunk;
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

            if chunk.eq(referenced_chunk) {
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
