use std::collections::HashMap;

use anyhow::Result;
use next_core::next_manifests::LoadableManifest;
use turbo_tasks::{RcStr, TryFlatJoinIterExt, Vc};
use turbopack_binding::{
    turbo::tasks_fs::{File, FileContent, FileSystemPath},
    turbopack::core::{
        asset::AssetContent,
        module::Module,
        output::{OutputAsset, OutputAssets},
        virtual_output::VirtualOutputAsset,
    },
};

use crate::dynamic_imports::DynamicImportedChunks;

#[turbo_tasks::function]
pub async fn create_react_loadable_manifest(
    dynamic_import_entries: Vc<DynamicImportedChunks>,
    client_relative_path: Vc<FileSystemPath>,
    output_path: Vc<FileSystemPath>,
) -> Result<Vc<OutputAssets>> {
    let dynamic_import_entries = &*dynamic_import_entries.await?;

    let mut output = vec![];
    let mut loadable_manifest: HashMap<RcStr, LoadableManifest> = Default::default();

    for (origin, dynamic_imports) in dynamic_import_entries.into_iter() {
        let origin_path = &*origin.ident().path().await?;

        for (import, chunk_output) in dynamic_imports {
            let chunk_output = chunk_output.await?;
            output.extend(chunk_output.iter().copied());

            let id: RcStr = format!("{} -> {}", origin_path, import).into();

            let client_relative_path_value = client_relative_path.await?;
            let files = chunk_output
                .iter()
                .map(move |&file| {
                    let client_relative_path_value = client_relative_path_value.clone();
                    async move {
                        Ok(client_relative_path_value
                            .get_path_to(&*file.ident().path().await?)
                            .map(|path| path.into()))
                    }
                })
                .try_flat_join()
                .await?;

            let manifest_item = LoadableManifest {
                id: id.clone(),
                files,
            };

            loadable_manifest.insert(id, manifest_item);
        }
    }

    let loadable_manifest = Vc::upcast(VirtualOutputAsset::new(
        output_path,
        AssetContent::file(
            FileContent::Content(File::from(serde_json::to_string_pretty(
                &loadable_manifest,
            )?))
            .cell(),
        ),
    ));

    output.push(loadable_manifest);
    Ok(Vc::cell(output))
}
