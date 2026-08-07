use std::{borrow::Cow, collections::BTreeMap, sync::LazyLock};

use anyhow::{Context, Result, bail};
use bincode::{Decode, Encode};
use next_core::{
    next_client_reference::{CssClientReferenceModule, EcmascriptClientReferenceModule},
    next_manifests::{ActionManifestEntry, ActionManifestWorkerEntry, ServerReferenceManifest},
    util::NextRuntime,
};
use swc_core::{
    atoms::{Atom, atom},
    common::comments::Comments,
    ecma::{
        ast::{
            Decl, ExportSpecifier, Id, ModuleDecl, ModuleItem, ObjectLit, Program,
            PropOrSpread::Prop,
        },
        utils::find_pat_ids,
    },
};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc,
    trace::TraceRawVcs, turbofmt,
};
use turbo_tasks_fs::{self, File, FileContent, FileSystem, FileSystemPath, VirtualFileSystem};
use turbo_tasks_hash::{HashAlgorithm, deterministic_hash};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        AsyncModuleInfo, ChunkItem, ChunkableModule, ChunkingContext, ChunkingType,
        EvaluatableAsset, ModuleId,
    },
    compile_time_info::CompileTimeDefineValue,
    emit_collect::{CollectingModule, EmittedModuleReference},
    ident::AssetIdent,
    module::{Module, ModuleSideEffects, Modules},
    module_graph::{GraphTraversalAction, ModuleGraph, async_module_info::AsyncModulesInfo},
    output::{OutputAsset, OutputAssetsReference},
    reference::ModuleReferences,
    resolve::ModulePart,
    source::OptionSource,
};
use turbopack_ecmascript::{
    EcmascriptParsable,
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemExt,
        EcmascriptChunkPlaceable, EcmascriptExports, ecmascript_chunk_item,
    },
    module_fragments::part::module::EcmascriptModulePartAsset,
    parse::ParseResult,
};

use crate::project::Project;

#[turbo_tasks::value]
pub(crate) struct ServerActionsManifest {
    pub loader: ResolvedVc<Box<dyn EvaluatableAsset>>,
    pub manifest: ResolvedVc<Box<dyn OutputAsset>>,
}

/// Scans the RSC entry point's full module graph looking for exported Server
/// Actions (identifiable by a magic comment in the transformed module's
/// output), and constructs a evaluatable "action loader" entry point and
/// manifest describing the found actions.
///
/// If Server Actions are not enabled, this returns an empty manifest and a None
/// loader.
#[turbo_tasks::function]
pub(crate) async fn create_server_actions_manifest(
    server_action_loader_modules: Vc<Modules>,
    project: Vc<Project>,
    node_root: FileSystemPath,
    page_name: RcStr,
    runtime: NextRuntime,
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<Box<dyn OutputAsset>>> {
    let actions = collect_actions(server_action_loader_modules, module_graph);

    let manifest = Vc::upcast(ServerActionManifestAsset::new(
        node_root,
        page_name,
        runtime,
        actions,
        module_graph,
        chunking_context,
        project,
    ));
    Ok(manifest)
}

#[turbo_tasks::function]
async fn collect_actions(
    server_action_loader_modules: Vc<Modules>,
    module_graph: Vc<ModuleGraph>,
) -> Result<Vc<AllActions>> {
    // This mirrors what the ServerActionCollectModule ends up chunking into the chunk.
    let collected_modules = module_graph.collected_modules();
    let server_action_loader_modules = server_action_loader_modules.await?;
    let [loader_module1, loader_module2] = &**server_action_loader_modules else {
        bail!(
            "Expected exactly two server action loader modules, but got {}",
            server_action_loader_modules.len()
        );
    };

    let actions1 = collected_modules.get(loader_module1).await?;
    let actions2 = collected_modules.get(loader_module2).await?;

    let actions = actions1
        .iter()
        .chain(actions2.iter())
        .flat_map(|v| v.iter())
        // No need to filter on entry_group_modules. Each page (ChunkGroup::Entry) has its own
        // loader module anyway.
        .flat_map(|(_, refs)| refs.iter());

    Ok(Vc::cell(
        actions
            .map(async |(data, module)| {
                if cfg!(debug_assertions) {
                    match &data.chunking_type {
                        ChunkingType::Collected { namespace, .. } => match namespace.as_str() {
                            "next/server-actions/rsc-edge"
                            | "next/server-actions/rsc-nodejs"
                            | "next/server-actions/browser-edge"
                            | "next/server-actions/browser-nodejs" => {}
                            _ => bail!("unexpected namespace {namespace} for collected reference"),
                        },
                        _ => bail!("unexpected chunking type for collected reference"),
                    };
                }

                let data =
                    ResolvedVc::try_sidecast::<Box<dyn EmittedModuleReference>>(data.reference)
                        .context(
                            "Expected collected server action reference to be a \
                             EmittedModuleReference",
                        )?
                        .data()
                        .await?;
                let data = match &*data {
                    CompileTimeDefineValue::String(s) => s.as_str(),
                    _ => bail!("Expected emitted module reference data to be string"),
                };
                let mut data = data
                    // `{action_id}|{export_name}|{source_path}`
                    .splitn(3, '\0');
                let hash = data.next().context("expected more data")?;
                let name = data.next().context("expected more data")?;
                let source_path = data.next().context("expected more data")?;

                Ok((
                    hash.to_string(),
                    (
                        ActionMeta {
                            name: name.to_string(),
                            source_path: source_path.to_string(),
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
#[turbo_tasks::value]
struct ServerActionManifestAsset {
    node_root: FileSystemPath,
    page_name: RcStr,
    runtime: NextRuntime,
    actions: ResolvedVc<AllActions>,
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    project: ResolvedVc<Project>,
}

#[turbo_tasks::value_impl]
impl ServerActionManifestAsset {
    #[turbo_tasks::function]
    pub fn new(
        node_root: FileSystemPath,
        page_name: RcStr,
        runtime: NextRuntime,
        actions: ResolvedVc<AllActions>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        project: ResolvedVc<Project>,
    ) -> Vc<Self> {
        Self {
            node_root,
            page_name,
            runtime,
            actions,
            module_graph,
            chunking_context,
            project,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for ServerActionManifestAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Result<Vc<FileSystemPath>> {
        let manifest_path_prefix = &self.page_name;
        let manifest_path = self.node_root.join(&format!(
            "server/app{manifest_path_prefix}/server-reference-manifest.json",
        ))?;
        Ok(manifest_path.cell())
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for ServerActionManifestAsset {}

#[turbo_tasks::value_impl]
impl Asset for ServerActionManifestAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let mut manifest: ServerReferenceManifest = Default::default();

        let key = format!("app{}", self.page_name);

        let actions_value = self.actions.await?;
        let async_module_info = self.module_graph.async_module_info();
        let next_config = self.project.next_config();
        let durable_use_cache_entries = *next_config
            .enable_durable_use_cache_entries(self.project.next_mode())
            .await?;
        let hash_salt = next_config.output_hash_salt();

        let mapping = match self.runtime {
            NextRuntime::Edge => &mut manifest.edge,
            NextRuntime::NodeJs => &mut manifest.node,
        };
        let chunk_item_id_strategy = self.chunking_context.chunk_item_id_strategy().await?;

        struct ActionMetadata<'a> {
            exported_name: &'a str,
            filename: Cow<'a, str>,
            module_id: ModuleId,
            is_async: bool,
            code_hash: Option<ReadRef<RcStr>>,
        }

        let action_metadata: Vec<(&str, ActionMetadata<'_>)> = actions_value
            .iter()
            .map(async |(hash_id, (meta, module))| {
                let filename = Cow::Borrowed(&*meta.source_path);

                Ok((
                    &**hash_id,
                    ActionMetadata {
                        exported_name: &meta.name,
                        filename,
                        module_id: chunk_item_id_strategy.get_id_from_module(**module).await?,
                        is_async: async_module_info.is_async(*module).await?,
                        code_hash: if durable_use_cache_entries
                            && extract_type_from_server_reference_id(hash_id)
                                == ServerReferenceType::UseCache
                        {
                            Some(
                                compute_subtree_content_hash(
                                    *self.module_graph,
                                    **module,
                                    *self.chunking_context,
                                    hash_salt,
                                )
                                .await?,
                            )
                        } else {
                            None
                        },
                    },
                ))
            })
            .try_join()
            .await?;

        // Now create the manifest entries
        for (
            hash_id,
            ActionMetadata {
                exported_name,
                filename,
                module_id,
                is_async,
                code_hash,
            },
        ) in &action_metadata
        {
            let entry = mapping
                .entry(hash_id)
                .or_insert_with(|| ActionManifestEntry {
                    workers: Default::default(),
                    // Hoist the filename and exported_name to the entry level
                    exported_name,
                    filename,
                    line: None,
                    col: None,
                });
            entry.workers.insert(
                &key,
                ActionManifestWorkerEntry {
                    exported_name,
                    module_id: module_id.into(),
                    is_async: *is_async,
                    code_hash: code_hash.as_ref().map(|h| h.as_str()),
                },
            );
        }

        Ok(AssetContent::file(
            FileContent::Content(File::from(serde_json::to_string_pretty(&manifest)?)).cell(),
        ))
    }
}

#[turbo_tasks::function]
async fn compute_subtree_content_hash(
    module_graph: ResolvedVc<ModuleGraph>,
    entry: ResolvedVc<Box<dyn Module>>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    hash_salt: Vc<RcStr>,
) -> Result<Vc<RcStr>> {
    let span = tracing::info_span!(
        "compute use-cache code hash",
        entry = display(entry.ident_string().await?)
    );
    match async {
        let module_graph_value = module_graph.await?;
        let async_module_info = module_graph.async_module_info();

        let mut modules = FxIndexSet::default();
        module_graph_value.traverse_edges_dfs(
            std::iter::once(entry),
            /* state */ &mut (),
            /* visit_preorder */
            |_, target, _| {
                if ResolvedVc::try_downcast_type::<CssClientReferenceModule>(target).is_some() {
                    // Don't include the module at all. There is nothing that executes on the server
                    Ok(GraphTraversalAction::Exclude)
                } else if ResolvedVc::try_downcast_type::<EcmascriptClientReferenceModule>(target)
                    .is_some()
                {
                    // Include the client reference proxy module, but not the referenced client
                    // modules themselves.
                    modules.insert(target);
                    Ok(GraphTraversalAction::Exclude)
                } else {
                    modules.insert(target);
                    Ok(GraphTraversalAction::Continue)
                }
            },
            /* visit_postorder */ |_, _, _| Ok(()),
            /* include_traced */ true,
        )?;

        static PRINT_USE_CACHE_SUBTREE: LazyLock<bool> = LazyLock::new(|| {
            std::env::var_os("TURBOPACK_PRINT_USE_CACHE_SUBTREE")
                .is_some_and(|v| v == "1" || v == "true")
        });
        if *PRINT_USE_CACHE_SUBTREE {
            println!(
                "Modules in subtree for {}:\n{}",
                entry.ident().await?.path,
                modules
                    .iter()
                    .map(async |m| Ok(format!(
                        "  '{}': {}",
                        m.ident_string().await?,
                        module_hash(
                            *module_graph,
                            chunking_context,
                            async_module_info,
                            **m,
                            hash_salt
                        )
                        .await?
                    )))
                    .try_join()
                    .await?
                    .join("\n")
            );
        }

        let hashes = modules
            .into_iter()
            .map(|m| {
                module_hash(
                    *module_graph,
                    chunking_context,
                    async_module_info,
                    *m,
                    hash_salt,
                )
            })
            .try_join()
            .await?;

        anyhow::Ok(Vc::cell(
            deterministic_hash("", hashes, HashAlgorithm::Xxh3Hash128Hex).into(),
        ))
    }
    .instrument(span)
    .await
    {
        Ok(hash) => Ok(hash),
        // ast-grep-ignore: no-context-turbofmt
        Err(e) => Err(e.context(
            turbofmt!(
                "Failed to compute use-cache code hash {}",
                entry.ident_string()
            )
            .await?,
        )),
    }
}

#[turbo_tasks::function]
async fn module_hash(
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    async_module_info: ResolvedVc<AsyncModulesInfo>,
    m: ResolvedVc<Box<dyn Module>>,
    hash_salt: Vc<RcStr>,
) -> Result<Vc<RcStr>> {
    let ident = m.ident();
    let ident_value = ident.await?;
    let ident_str = ident.to_string().await?;

    if let Some(placeable_module) = ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(m)
        && !ident_value
            .layer
            .as_ref()
            .is_some_and(|l| l.name() == "externals-tracing")
    {
        // A bundled JS module
        let chunk_item = placeable_module
            .as_chunk_item(*module_graph, *chunking_context)
            .to_resolved()
            .await?;
        let chunk_item =
            ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkItem>>(chunk_item).unwrap();
        let async_info = if async_module_info.is_async(m).await? {
            Some(module_graph.referenced_async_modules(*m))
        } else {
            None
        };
        let code = chunk_item.code(async_info);
        Ok(Vc::cell(RcStr::from(deterministic_hash(
            "",
            (ident_str, code.source_code_hash().await?),
            HashAlgorithm::Xxh3Hash128Hex,
        ))))
    } else {
        // A non-JS static file or an external module
        let content_hash = m
            .source()
            .await?
            .with_context(|| format!("failed to get source for module {ident_str}"))?
            .content()
            .hash(hash_salt, HashAlgorithm::Xxh3Hash128Hex)
            .await?;
        Ok(Vc::cell(RcStr::from(deterministic_hash(
            "",
            (ident_str, content_hash),
            HashAlgorithm::Xxh3Hash128Hex,
        ))))
    }
}

/// Server action info for JSON parsing
#[derive(Clone, Debug, serde::Deserialize)]
#[serde(untagged)]
enum ServerActionInfoRaw {
    /// Old format: just the export name as a string
    Name(String),
    /// New format: object with name
    WithName { name: String },
}

impl ServerActionInfoRaw {
    fn into_action_entry(self) -> ActionEntry {
        match self {
            ServerActionInfoRaw::Name(name) => ActionEntry { name },
            ServerActionInfoRaw::WithName { name } => ActionEntry { name },
        }
    }
}

/// Simplified action entry for storage in turbo_tasks values
#[derive(Clone, Debug, PartialEq, Eq, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub struct ActionEntry {
    pub name: String,
}

/// Parses the Server Actions comment for all exported action function names.
///
/// Action names are stored in a leading BlockComment prefixed by
/// `__next_internal_action_entry_do_not_use__`.
pub fn parse_server_actions(
    program: &Program,
    comments: &dyn Comments,
) -> Option<(BTreeMap<String, ActionEntry>, String, String)> {
    let byte_pos = match program {
        Program::Module(m) => m.span.lo,
        Program::Script(s) => s.span.lo,
    };
    comments.get_leading(byte_pos).and_then(|comments| {
        comments.iter().find_map(|c| {
            c.text
                .split_once("__next_internal_action_entry_do_not_use__")
                .and_then(|(_, actions)| {
                    // Try to parse as tuple format: (actions_map, entry_path, entry_query)
                    if let Ok((raw, entry_path, entry_query)) = serde_json::from_str::<(
                        BTreeMap<String, ServerActionInfoRaw>,
                        String,
                        String,
                    )>(actions)
                    {
                        let converted: BTreeMap<String, ActionEntry> = raw
                            .into_iter()
                            .map(|(k, v)| (k, v.into_action_entry()))
                            .collect();
                        return Some((converted, entry_path, entry_query));
                    }
                    // Fall back to just actions map (old format without entry path/query)
                    let raw: BTreeMap<String, ServerActionInfoRaw> =
                        serde_json::from_str(actions).ok()?;
                    let converted: BTreeMap<String, ActionEntry> = raw
                        .into_iter()
                        .map(|(k, v)| (k, v.into_action_entry()))
                        .collect();
                    Some((converted, String::new(), String::new()))
                })
        })
    })
}
/// Inspects the comments inside [Module] looking for the magic actions comment.
/// If found, we return the mapping of every action's hashed id to the name of
/// the exported action function. If not, we return a None.
#[turbo_tasks::function]
async fn parse_actions(module: ResolvedVc<Box<dyn Module>>) -> Result<Vc<OptionActionMap>> {
    let Some(ecmascript_asset) = ResolvedVc::try_sidecast::<Box<dyn EcmascriptParsable>>(module)
    else {
        return Ok(Vc::cell(None));
    };

    let original_asset =
        if let Some(module) = ResolvedVc::try_downcast_type::<EcmascriptModulePartAsset>(module) {
            let module = module.await?;
            if matches!(module.part, ModulePart::Evaluation | ModulePart::Facade) {
                return Ok(Vc::cell(None));
            }
            ResolvedVc::upcast(module.full_module)
        } else {
            ecmascript_asset
        };

    let original_parsed = original_asset.failsafe_parse().to_resolved().await?;

    let ParseResult::Ok {
        program: original,
        comments,
        ..
    } = &*original_parsed.await?
    else {
        // The file might be parse-able, but this is reported separately.
        return Ok(Vc::cell(None));
    };

    let Some((mut actions, entry_path, entry_query)) = parse_server_actions(original, comments)
    else {
        return Ok(Vc::cell(None));
    };

    // If this is a module-fragment, filter the exports
    if original_asset != ecmascript_asset {
        let fragment = ecmascript_asset.failsafe_parse().to_resolved().await?;
        let ParseResult::Ok {
            program: fragment, ..
        } = &*fragment.await?
        else {
            // The file might be be parse-able, but this is reported separately.
            return Ok(Vc::cell(None));
        };

        let all_exports = all_export_names(fragment);
        actions.retain(|_, entry| all_exports.iter().any(|export| export == &entry.name));
    }

    let mut actions = FxIndexMap::from_iter(actions.into_iter());
    actions.sort_keys();
    Ok(Vc::cell(Some(
        ActionMap {
            actions,
            entry_path,
            entry_query,
        }
        .resolved_cell(),
    )))
}

fn all_export_names(program: &Program) -> Vec<Atom> {
    match program {
        Program::Module(m) => {
            let mut exports = Vec::new();
            for item in m.body.iter() {
                match item {
                    ModuleItem::ModuleDecl(
                        ModuleDecl::ExportDefaultExpr(..) | ModuleDecl::ExportDefaultDecl(..),
                    ) => {
                        exports.push(atom!("default"));
                    }
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(decl)) => match &decl.decl {
                        Decl::Class(c) => {
                            exports.push(c.ident.sym.clone());
                        }
                        Decl::Fn(f) => {
                            exports.push(f.ident.sym.clone());
                        }
                        Decl::Var(v) => {
                            let ids: Vec<Id> = find_pat_ids(v);
                            exports.extend(ids.into_iter().map(|id| id.0));
                        }
                        _ => {}
                    },
                    ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(decl)) => {
                        if is_turbopack_internal_var(&decl.with) {
                            continue;
                        }

                        for s in decl.specifiers.iter() {
                            match s {
                                ExportSpecifier::Named(named) => {
                                    exports.push(
                                        named
                                            .exported
                                            .as_ref()
                                            .unwrap_or(&named.orig)
                                            .atom()
                                            .into_owned(),
                                    );
                                }
                                ExportSpecifier::Default(_) => {
                                    exports.push(atom!("default"));
                                }
                                ExportSpecifier::Namespace(e) => {
                                    exports.push(e.name.atom().into_owned());
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            exports
        }

        _ => {
            vec![]
        }
    }
}

fn is_turbopack_internal_var(with: &Option<Box<ObjectLit>>) -> bool {
    with.as_deref()
        .and_then(|v| {
            v.props.iter().find_map(|p| match p {
                Prop(prop) => match &**prop {
                    swc_core::ecma::ast::Prop::KeyValue(key_value_prop) => {
                        if key_value_prop.key.as_ident()?.sym == "__turbopack_var__" {
                            Some(key_value_prop.value.as_lit()?.as_bool()?.value)
                        } else {
                            None
                        }
                    }
                    _ => None,
                },
                _ => None,
            })
        })
        .unwrap_or(false)
}

/// Action metadata including name and source path
#[derive(Clone, Debug, PartialEq, Eq, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub struct ActionMeta {
    pub name: String,
    /// The original source file path (from entry_path in the action comment)
    pub source_path: String,
}

type HashToAction = Vec<(String, (ActionMeta, ResolvedVc<Box<dyn Module>>))>;

/// A mapping of every module which exports a Server Action, with the hashed id
/// and exported name of each found action.
#[turbo_tasks::value(transparent)]
pub struct AllActions(HashToAction);

#[turbo_tasks::value_impl]
impl AllActions {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Default::default())
    }
}

/// Maps the hashed action id to the action's exported function name and location.
#[turbo_tasks::value]
#[derive(Debug)]
pub struct ActionMap {
    #[bincode(with = "turbo_bincode::indexmap")]
    pub actions: FxIndexMap<String, ActionEntry>,
    pub entry_path: String,
    pub entry_query: String,
}

/// An Option wrapper around [ActionMap].
#[turbo_tasks::value(transparent)]
struct OptionActionMap(Option<ResolvedVc<ActionMap>>);

/// A mapping of every module module containing Server Actions, mapping to its layer and actions.
#[turbo_tasks::value(transparent)]
pub struct AllModuleActions(
    #[bincode(with = "turbo_bincode::indexmap")]
    FxIndexMap<ResolvedVc<Box<dyn Module>>, ResolvedVc<ActionMap>>,
);

#[turbo_tasks::function]
fn server_actions_collect_virtual_fs() -> Vc<VirtualFileSystem> {
    VirtualFileSystem::new_with_name(rcstr!("next-server-actions-collect"))
}

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

#[turbo_tasks::value_impl]
impl Module for ServerActionCollectModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(
            AssetIdent::from_path(server_actions_collect_virtual_fs().root().owned().await?)
                .with_modifier(self.namespace.clone())
                .with_modifier(self.page.clone())
                .into_vc(),
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
        _entry_chunk_group: Vc<Modules>,
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

#[derive(Clone, Debug, PartialEq, Eq)]
enum ServerReferenceType {
    ServerAction,
    UseCache,
}

fn extract_type_from_server_reference_id(id: &str) -> ServerReferenceType {
    // Mirrors extractInfoFromServerReferenceId in
    // packages/next/src/shared/lib/server-reference-info.ts
    let info_byte = u8::from_str_radix(&id[0..2], 16).unwrap_or(0);
    let type_bit = (info_byte >> 7) & 0x1;

    if type_bit == 1 {
        ServerReferenceType::UseCache
    } else {
        ServerReferenceType::ServerAction
    }
}

#[cfg(test)]
mod tests {
    use crate::server_actions::{ServerReferenceType, extract_type_from_server_reference_id};

    #[test]
    fn test_should_parse_id_with_type_bit_0_no_args() {
        let id = "00xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // 0b00000000

        assert_eq!(
            extract_type_from_server_reference_id(id),
            ServerReferenceType::ServerAction
        );
    }

    #[test]
    fn test_should_parse_id_with_type_bit_1_all_args_used_rest_args_true() {
        let id = "ffxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // 0b11111111

        assert_eq!(
            extract_type_from_server_reference_id(id),
            ServerReferenceType::UseCache
        );
    }

    #[test]
    fn test_should_parse_id_with_type_bit_0_arg_mask_0b101010_rest_args_false() {
        let id = "54xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // 0b01010100

        assert_eq!(
            extract_type_from_server_reference_id(id),
            ServerReferenceType::ServerAction
        );
    }

    #[test]
    fn test_should_parse_id_with_type_bit_1_arg_mask_0b000101_rest_args_true() {
        let id = "8bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // 0b10001011

        assert_eq!(
            extract_type_from_server_reference_id(id),
            ServerReferenceType::UseCache
        );
    }
}
