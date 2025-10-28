use anyhow::Result;
use next_core::{next_manifests::LoadableManifest, util::NextRuntime};
use turbo_tasks::{FxIndexMap, ResolvedVc, TryFlatJoinIterExt, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    output::{OutputAsset, OutputAssets},
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::utils::StringifyJs;

use crate::dynamic_imports::DynamicImportedChunks;

#[turbo_tasks::function]
pub async fn create_react_loadable_manifest(
    dynamic_import_entries: Vc<DynamicImportedChunks>,
    client_relative_path: FileSystemPath,
    output_path: FileSystemPath,
    runtime: NextRuntime,
) -> Result<Vc<OutputAssets>> {
    let dynamic_import_entries = &*dynamic_import_entries.await?;

    let mut loadable_manifest: FxIndexMap<String, LoadableManifest> = FxIndexMap::default();

    for (_, (module_id, chunk_output)) in dynamic_import_entries.into_iter() {
        let chunk_output = chunk_output.await?;

        let id = &*module_id.await?;

        let client_relative_path_value = client_relative_path.clone();
        let files = chunk_output
            .iter()
            .map(move |&file| {
                let client_relative_path_value = client_relative_path_value.clone();
                async move {
                    Ok(client_relative_path_value
                        .get_path_to(&*file.path().await?)
                        .map(|path| path.into()))
                }
            })
            .try_flat_join()
            .await?;

        let manifest_item = LoadableManifest {
            id: id.into(),
            files,
        };

        loadable_manifest.insert(id.to_string(), manifest_item);
    }

    let manifest_json = serde_json::to_string_pretty(&loadable_manifest)?;

    Ok(Vc::cell(match runtime {
        NextRuntime::NodeJs => vec![ResolvedVc::upcast(
            VirtualOutputAsset::new(
                output_path.with_extension("json"),
                AssetContent::file(FileContent::Content(File::from(manifest_json)).cell()),
            )
            .to_resolved()
            .await?,
        )],
        NextRuntime::Edge => vec![
            ResolvedVc::upcast(
                VirtualOutputAsset::new(
                    output_path.with_extension("js"),
                    AssetContent::file(
                        FileContent::Content(File::from(format!(
                            "self.__REACT_LOADABLE_MANIFEST={};",
                            StringifyJs(&manifest_json)
                        )))
                        .cell(),
                    ),
                )
                .to_resolved()
                .await?,
            ),
            ResolvedVc::upcast(
                VirtualOutputAsset::new(
                    output_path.with_extension("json"),
                    AssetContent::file(FileContent::Content(File::from(manifest_json)).cell()),
                )
                .to_resolved()
                .await?,
            ),
        ],
    }))
}
