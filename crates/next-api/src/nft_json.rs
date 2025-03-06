use std::collections::BTreeSet;

use anyhow::{bail, Result};
use serde_json::json;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileSystem, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
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
    async fn dist_dir(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("/{}/", self.project.dist_dir().await?).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for NftJsonAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        let path = self.chunk.path().await?;
        Ok(path
            .fs
            .root()
            .join(format!("{}.nft.json", path.path).into()))
    }
}

#[turbo_tasks::value(transparent)]
pub struct OutputSpecifier(Option<RcStr>);

fn get_output_specifier(
    path_ref: &FileSystemPath,
    ident_folder: &FileSystemPath,
    ident_folder_in_project_fs: &FileSystemPath,
    ident_folder_in_client_fs: &FileSystemPath,
    output_root: &FileSystemPath,
    project_root: &FileSystemPath,
    client_root: &FileSystemPath,
    dist_dir: &RcStr,
) -> Result<RcStr> {
    // include assets in the outputs such as referenced chunks
    if path_ref.is_inside_ref(output_root) {
        return Ok(ident_folder.get_relative_path_to(path_ref).unwrap());
    }

    // include assets in the project root such as images and traced references (externals)
    if path_ref.is_inside_ref(project_root) {
        return Ok(ident_folder_in_project_fs
            .get_relative_path_to(path_ref)
            .unwrap());
    }

    // assets that are needed on the client side such as fonts and icons
    if path_ref.is_inside_ref(client_root) {
        return Ok(ident_folder_in_client_fs
            .get_relative_path_to(path_ref)
            .unwrap()
            .replace("/_next/", dist_dir)
            .into());
    }

    // Make this an error for now, this should effectively be unreachable
    bail!("NftJsonAsset: cannot handle filepath {}", path_ref);
}

#[turbo_tasks::value_impl]
impl Asset for NftJsonAsset {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = &*self.await?;
        let mut result = BTreeSet::new();

        let output_root_ref = this.project.output_fs().root().await?;
        let project_root_ref = this.project.project_fs().root().await?;
        let client_root = this.project.client_fs().root();
        let client_root_ref = client_root.await?;
        let dist_dir = self.dist_dir().await?;

        let ident_folder = self.path().parent().await?;
        let ident_folder_in_project_fs = this
            .project
            .project_path()
            .join(ident_folder.path.clone())
            .await?;
        let ident_folder_in_client_fs = client_root.join(ident_folder.path.clone()).await?;

        let chunk = this.chunk;
        let entries = this
            .additional_assets
            .iter()
            .copied()
            .chain(std::iter::once(chunk))
            .collect();
        for referenced_chunk in all_assets_from_entries(Vc::cell(entries)).await? {
            if chunk.eq(referenced_chunk) {
                continue;
            }

            let referenced_chunk_path = referenced_chunk.path().await?;
            if referenced_chunk_path.extension_ref() == Some("map") {
                continue;
            }

            let specifier = get_output_specifier(
                &referenced_chunk_path,
                &ident_folder,
                &ident_folder_in_project_fs,
                &ident_folder_in_client_fs,
                &output_root_ref,
                &project_root_ref,
                &client_root_ref,
                &dist_dir,
            )?;
            result.insert(specifier);
        }

        let json = json!({
          "version": 1,
          "files": result
        });

        Ok(AssetContent::file(File::from(json.to_string()).into()))
    }
}
