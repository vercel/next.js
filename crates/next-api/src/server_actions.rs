use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use next_core::{
    next_manifests::{ActionLayer, ActionManifestWorkerEntry, ServerReferenceManifest},
    util::NextRuntime,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, TryJoinIterExt, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{self, File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    chunk::ChunkingContext,
    emit_collect::EmittedModuleReference,
    module::Module,
    module_graph::{ModuleGraph, async_module_info::AsyncModulesInfo},
    output::OutputAsset,
    virtual_output::VirtualOutputAsset,
};

/// Scans the RSC entry point's full module graph looking for emitted Server
/// Actions, and a manifest describing the found actions.
///
/// If Server Actions are not enabled, this returns an empty manifest and a None
/// loader.
#[turbo_tasks::function]
pub(crate) async fn create_server_actions_manifest(
    server_action_loader: Vc<Box<dyn Module>>,
    node_root: FileSystemPath,
    page_name: RcStr,
    runtime: NextRuntime,
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Vc<Box<dyn OutputAsset>> {
    let actions = collect_actions(server_action_loader, module_graph);
    build_manifest(
        node_root,
        page_name,
        runtime,
        actions,
        chunking_context,
        module_graph.async_module_info(),
    )
}

#[turbo_tasks::function]
async fn collect_actions(
    server_action_loader: ResolvedVc<Box<dyn Module>>,
    module_graph: Vc<ModuleGraph>,
) -> Result<Vc<AllActions>> {
    let collected_modules = module_graph.collected_modules().await?;

    // This mirrors what the __turbopack_collect__ in
    // packages/next/src/build/templates/turbopack-action-loader.ts ends up chunking into the chunk.

    // This can be none if there are no server actions
    let actions =
        collected_modules
            .collected_references
            .iter()
            .find_map(|((entry, _loader), actions)| {
                if *entry == server_action_loader {
                    // TODO also filter based on _loader
                    Some(actions)
                } else {
                    None
                }
            });

    Ok(Vc::cell(
        actions
            .into_iter()
            .flatten()
            .map(async |(data, module, _)| {
                let data =
                    ResolvedVc::try_sidecast::<Box<dyn EmittedModuleReference>>(data.reference)
                        .context(
                            "Expected collected server action reference to be \
                             EmittedModuleReference",
                        )?
                        .data()
                        .await?;
                let mut data = data
                    .as_ref()
                    .context("Expected emitted module reference data to be not empty")?
                    .split("|");
                let hash = data.next().unwrap();
                let name = data.next().unwrap();

                Ok((
                    hash.to_string(),
                    (
                        ActionLayer::ActionBrowser, // TODO
                        ActionMeta {
                            name: name.to_string(),
                            source_path: "".to_string(), // TODO
                        },
                        *module,
                    ),
                ))
            })
            .try_join()
            .await?,
    ))
}

/// Builds a manifest containing every action's hashed id, with an internal
/// module id which exports a function using that hashed name.
#[turbo_tasks::function]
async fn build_manifest(
    node_root: FileSystemPath,
    page_name: RcStr,
    runtime: NextRuntime,
    actions: Vc<AllActions>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    async_module_info: Vc<AsyncModulesInfo>,
) -> Result<Vc<Box<dyn OutputAsset>>> {
    let manifest_path_prefix = &page_name;
    let manifest_path = node_root.join(&format!(
        "server/app{manifest_path_prefix}/server-reference-manifest.json",
    ))?;
    let mut manifest = ServerReferenceManifest {
        ..Default::default()
    };

    let key = format!("app{page_name}");

    let actions_value = actions.await?;
    let mapping = match runtime {
        NextRuntime::Edge => &mut manifest.edge,
        NextRuntime::NodeJs => &mut manifest.node,
    };

    let chunk_item_id_strategy = chunking_context.chunk_item_id_strategy().await?;

    // Collect all the action metadata including filenames and location
    let mut action_metadata = Vec::new();
    for (hash_id, (layer, meta, module)) in actions_value.iter() {
        // Use source_path from the action comment if available (contains original .ts/.tsx path),
        // otherwise fall back to module.ident().path() (may be compiled .js path)
        let filename = if !meta.source_path.is_empty() {
            meta.source_path.clone()
        } else {
            let module_path = module.ident().path().await?;
            module_path.to_string()
        };

        action_metadata.push((
            hash_id.clone(),
            (
                *layer,
                meta.name.clone(),
                filename,
                chunk_item_id_strategy.get_id_from_module(**module).await?,
                async_module_info.is_async(*module).await?,
            ),
        ));
    }

    // println!("build_manifest {} {:#?}", page_name, action_metadata);

    // Now create the manifest entries
    for (hash_id, (_layer, name, filename, module_id, is_async)) in &action_metadata {
        let entry = mapping.entry(hash_id.as_str()).or_default();
        entry.workers.insert(
            &key,
            ActionManifestWorkerEntry {
                module_id: module_id.into(),
                is_async: *is_async,
                exported_name: name.as_str(),
                filename: filename.as_str(),
            },
        );

        // Hoist the filename and exported_name to the entry level
        entry.exported_name = name.as_str();
        entry.filename = filename.as_str();
    }

    Ok(Vc::upcast(VirtualOutputAsset::new(
        manifest_path,
        AssetContent::file(
            FileContent::Content(File::from(serde_json::to_string_pretty(&manifest)?)).cell(),
        ),
    )))
}

/// Action metadata including name and source path
#[derive(Clone, Debug, PartialEq, Eq, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub struct ActionMeta {
    pub name: String,
    /// The original source file path (from entry_path in the action comment)
    pub source_path: String,
}

type HashToLayerNameModule = Vec<(
    String,
    (ActionLayer, ActionMeta, ResolvedVc<Box<dyn Module>>),
)>;
/// A mapping of every module which exports a Server Action, with the hashed id
/// and exported name of each found action.
#[turbo_tasks::value(transparent)]
pub struct AllActions(HashToLayerNameModule);
