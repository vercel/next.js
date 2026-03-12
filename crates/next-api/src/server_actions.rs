use anyhow::{Context, Result, bail};
use bincode::{Decode, Encode};
use next_core::{
    next_manifests::{ActionLayer, ActionManifestWorkerEntry, ServerReferenceManifest},
    util::NextRuntime,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ResolvedVc, TryJoinIterExt, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{self, File, FileContent, FileSystem, FileSystemPath, VirtualFileSystem};
use turbopack_core::{
    self,
    asset::AssetContent,
    chunk::{
        AsyncModuleInfo, ChunkItem, ChunkableModule, ChunkingContext, ChunkingType,
        EvaluatableAsset,
    },
    emit_collect::{CollectingModule, EmittedModuleReference},
    ident::AssetIdent,
    module::{Module, ModuleSideEffects, Modules},
    module_graph::{ModuleGraph, async_module_info::AsyncModulesInfo},
    output::OutputAsset,
    reference::ModuleReferences,
    source::OptionSource,
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports, ecmascript_chunk_item,
};

/// Scans the RSC entry point's full module graph looking for emitted Server
/// Actions, and a manifest describing the found actions.
///
/// If Server Actions are not enabled, this returns an empty manifest and a None
/// loader.
#[turbo_tasks::function]
pub(crate) async fn create_server_actions_manifest(
    server_action_loader_modules: Vc<Modules>,
    node_root: FileSystemPath,
    page_name: RcStr,
    runtime: NextRuntime,
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Vc<Box<dyn OutputAsset>> {
    let actions = collect_actions(server_action_loader_modules, module_graph);
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
    server_action_loader_modules: Vc<Modules>,
    module_graph: Vc<ModuleGraph>,
) -> Result<Vc<AllActions>> {
    // This mirrors what the ServerActionCollectModule ends up chunking into the chunk.
    let collected_modules = module_graph.collected_modules().await?;
    let server_action_loader_modules = server_action_loader_modules.await?;
    assert_eq!(server_action_loader_modules.len(), 2);

    let actions = collected_modules
        .collected_references
        .iter()
        .filter(|((_entry_modules, loader), _)| {
            // No need to check entry_modules. Each page (ChunkGroup::Entry) has its own loader
            // module anyway.

            // server_action_loader_modules contains only 2 modules, so converting that into a
            // hashset for quicker lookup is not necessary.
            server_action_loader_modules.contains(loader)
        })
        // Early stop the search. There can only ever be two matches
        .take(2)
        .flat_map(|(_, actions)| actions.iter());

    Ok(Vc::cell(
        actions
            .map(async |(data, module, _)| {
                let namespace = match &data.chunking_type {
                    ChunkingType::Collected { merge_tag, .. } => merge_tag,
                    _ => bail!("unexpected chunking type for collected reference"),
                };
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
                        match namespace.as_str() {
                            "next/server-actions/rsc-edge" | "next/server-actions/rsc-nodejs" => {
                                ActionLayer::Rsc
                            }
                            "next/server-actions/browser-edge"
                            | "next/server-actions/browser-nodejs" => ActionLayer::ActionBrowser,
                            _ => bail!("unexpected namespace {namespace} for collected reference"),
                        },
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

/// This module performs what `__turbopack_collect__({namespace: 'next/server-actions/*'})` would
/// do chunking-wise. Except that we collect the list manually into a separate JSON, so
/// __turbopack_collect__ would unnecessarily codegen a big list of server actions.
#[turbo_tasks::value]
pub struct ServerActionCollectModule {
    namespace: RcStr,
    page: RcStr,
}

#[turbo_tasks::value_impl]
impl ServerActionCollectModule {
    #[turbo_tasks::function]
    pub fn new(namespace: RcStr, page: RcStr) -> Vc<Self> {
        ServerActionCollectModule { namespace, page }.cell()
    }
}

#[turbo_tasks::function]
fn server_actions_collect_virtual_fs() -> Vc<VirtualFileSystem> {
    VirtualFileSystem::new_with_name(rcstr!("next-server-actions-collect"))
}

#[turbo_tasks::value_impl]
impl Module for ServerActionCollectModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(
            AssetIdent::from_path(server_actions_collect_virtual_fs().root().owned().await?)
                .with_modifier(self.namespace.clone())
                .with_modifier(self.page.clone()),
        )
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        ModuleReferences::empty()
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectful.cell()
    }
}

#[turbo_tasks::value_impl]
impl CollectingModule for ServerActionCollectModule {
    #[turbo_tasks::function]
    fn namespace(&self) -> Vc<RcStr> {
        Vc::cell(self.namespace.clone())
    }

    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        _chunk_group: Vc<Modules>,
    ) -> Vc<Box<dyn ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for ServerActionCollectModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ServerActionCollectModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::None.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        // There is no runtime behavior needed here.
        // - __turbopack_collect__ causes all modules to chunked together with this one
        // - server-reference-manifest.json will contains all the module ids from above. It will do
        //   the loading itself
        // In the future, when server-reference-manifest might be loaded/handled by the templates
        // themselves, then it could happen here instead.
        Ok(EcmascriptChunkItemContent {
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for ServerActionCollectModule {}
