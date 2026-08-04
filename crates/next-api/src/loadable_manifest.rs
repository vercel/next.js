use anyhow::Result;
use next_core::{next_manifests::LoadableManifest, util::NextRuntime};
use turbo_tasks::{FxIndexMap, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    chunk::{ChunkingContext, ModuleChunkItemIdExt},
    output::{OutputAsset, OutputAssets},
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::utils::StringifyJs;

use crate::dynamic_imports::DynamicImportedChunks;

#[turbo_tasks::function]
pub async fn create_react_loadable_manifest(
    dynamic_import_entries: Vc<DynamicImportedChunks>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    client_relative_path: FileSystemPath,
    output_path: FileSystemPath,
    runtime: NextRuntime,
) -> Result<Vc<OutputAssets>> {
    let dynamic_import_entries = &*turbo_tasks::read!(dynamic_import_entries)?;

    let mut loadable_manifest: FxIndexMap<String, LoadableManifest> = FxIndexMap::default();

    #[cfg(not(feature = "sync"))]
    let entries = turbo_tasks::read!(
        dynamic_import_entries
            .iter()
            .map(|(_, (dynamic_entry, chunk_output))| {
                let client_relative_path = client_relative_path.clone();
                async move {
                    let module_id =
                        turbo_tasks::read!(dynamic_entry.chunk_item_id(chunking_context))?;
                    let chunk_output = turbo_tasks::read!(chunk_output.primary_assets())?;

                    let client_relative_path_value = client_relative_path.clone();
                    let files = turbo_tasks::read!(
                        chunk_output
                            .iter()
                            .map(move |&file| {
                                let client_relative_path_value = client_relative_path_value.clone();
                                async move {
                                    Ok(client_relative_path_value
                                        .get_path_to(&*turbo_tasks::read!(file.path())?)
                                        .map(|path| path.into()))
                                }
                            })
                            .try_flat_join()
                    )?;

                    Ok((module_id, files))
                }
            })
            .try_join()
    )?;
    #[cfg(feature = "sync")]
    let entries = {
        let mut entries = Vec::new();
        for (_, (dynamic_entry, chunk_output)) in dynamic_import_entries.iter() {
            let module_id = turbo_tasks::read!(dynamic_entry.chunk_item_id(chunking_context))?;
            let chunk_output = turbo_tasks::read!(chunk_output.primary_assets())?;

            let files = {
                let mut files = Vec::new();
                for &file in chunk_output.iter() {
                    files.extend(
                        client_relative_path
                            .get_path_to(&*turbo_tasks::read!(file.path())?)
                            .map(|path| path.into()),
                    );
                }
                files
            };

            entries.push((module_id, files));
        }
        entries
    };

    for (module_id, files) in entries {
        let manifest_item = LoadableManifest {
            id: (&module_id).into(),
            files,
        };

        loadable_manifest.insert(module_id.to_string(), manifest_item);
    }

    let manifest_json = serde_json::to_string_pretty(&loadable_manifest)?;

    Ok(Vc::cell(match runtime {
        NextRuntime::NodeJs => vec![ResolvedVc::upcast(turbo_tasks::read!(
            VirtualOutputAsset::new(
                output_path.with_extension("json"),
                AssetContent::file(FileContent::Content(File::from(manifest_json)).cell()),
            )
            .to_resolved()
        )?)],
        NextRuntime::Edge => vec![
            ResolvedVc::upcast(turbo_tasks::read!(
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
            )?),
            ResolvedVc::upcast(turbo_tasks::read!(
                VirtualOutputAsset::new(
                    output_path.with_extension("json"),
                    AssetContent::file(FileContent::Content(File::from(manifest_json)).cell()),
                )
                .to_resolved()
            )?),
        ],
    }))
}
