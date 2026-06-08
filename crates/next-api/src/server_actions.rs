use std::{borrow::Cow, collections::BTreeMap, io::Write};

use anyhow::{Context, Result, bail};
use bincode::{Decode, Encode};
use next_core::{
    next_manifests::{
        ActionLayer, ActionManifestModuleId, ActionManifestWorkerEntry, ServerReferenceManifest,
    },
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
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, NonLocalValue, OperationVc, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc,
    trace::TraceRawVcs,
};
use turbo_tasks_fs::{self, File, FileContent, FileSystemPath, rope::RopeBuilder};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkItem, ChunkItemExt, ChunkableModule, ChunkingContext, EvaluatableAsset, ModuleId,
    },
    context::AssetContext,
    file_source::FileSource,
    ident::AssetIdent,
    module::Module,
    module_graph::{ModuleGraph, ModuleGraphLayer, async_module_info::AsyncModulesInfo},
    output::{OutputAsset, OutputAssetsReference},
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::ModulePart,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::{
    EcmascriptParsable, chunk::EcmascriptChunkPlaceable, parse::ParseResult,
    tree_shake::part::module::EcmascriptModulePartAsset,
};

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
    actions: Vc<AllActions>,
    project_path: FileSystemPath,
    node_root: FileSystemPath,
    page_name: RcStr,
    runtime: NextRuntime,
    rsc_asset_context: Vc<Box<dyn AssetContext>>,
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<ServerActionsManifest>> {
    let loader =
        build_server_actions_loader(project_path, page_name.clone(), actions, rsc_asset_context);
    let evaluable =
        ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(loader.to_resolved().await?)
            .context("loader module must be evaluatable")?;

    let chunk_item = loader.as_chunk_item(module_graph, chunking_context);
    let manifest = ResolvedVc::upcast(
        ServerActionManifestAsset::new(
            node_root,
            page_name,
            runtime,
            actions,
            chunk_item,
            module_graph.async_module_info(),
        )
        .to_resolved()
        .await?,
    );
    Ok(ServerActionsManifest {
        loader: evaluable,
        manifest,
    }
    .cell())
}

/// Builds the "action loader" entry point, which reexports every found action
/// behind a lazy dynamic import.
///
/// The actions are reexported under a hashed name (comprised of the exporting
/// file's name and the action name). This hash matches the id sent to the
/// client and present inside the paired manifest.
#[turbo_tasks::function]
pub(crate) async fn build_server_actions_loader(
    project_path: FileSystemPath,
    page_name: RcStr,
    actions: Vc<AllActions>,
    asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    let actions = actions.await?;

    // Every module which exports an action (that is accessible starting from
    // our app page entry point) will be present. We generate a single loader
    // file which re-exports the respective module's action function using the
    // hashed ID as export name.
    let mut contents = RopeBuilder::from("");
    let mut import_map = FxIndexMap::default();
    for (hash_id, (_layer, meta, module)) in actions.iter() {
        let index = import_map.len();
        let module_name = import_map
            .entry(*module)
            .or_insert_with(|| format!("ACTIONS_MODULE{index}").into());
        let name = &meta.name;
        writeln!(
            contents,
            "export {{{name} as '{hash_id}'}} from '{module_name}'"
        )?;
    }

    let path = project_path.join(&format!(".next-internal/server/app{page_name}/actions.js"))?;
    let file = File::from(contents.build());
    let source = VirtualSource::new_with_ident(
        AssetIdent::from_path(path)
            .with_modifier(rcstr!("server actions loader"))
            .into_vc(),
        AssetContent::file(FileContent::Content(file).cell()),
    );
    let import_map = import_map.into_iter().map(|(k, v)| (v, k)).collect();
    let module = asset_context
        .process(
            Vc::upcast(source),
            ReferenceType::Internal(ResolvedVc::cell(import_map)),
        )
        .module();

    let Some(placeable) =
        ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module.to_resolved().await?)
    else {
        bail!("internal module must be evaluatable");
    };

    Ok(*placeable)
}

/// Builds a manifest containing every action's hashed id, with an internal
/// module id which exports a function using that hashed name.
#[turbo_tasks::value]
struct ServerActionManifestAsset {
    node_root: FileSystemPath,
    page_name: RcStr,
    runtime: NextRuntime,
    actions: ResolvedVc<AllActions>,
    chunk_item: ResolvedVc<Box<dyn ChunkItem>>,
    async_module_info: ResolvedVc<AsyncModulesInfo>,
}

#[turbo_tasks::value_impl]
impl ServerActionManifestAsset {
    #[turbo_tasks::function]
    pub fn new(
        node_root: FileSystemPath,
        page_name: RcStr,
        runtime: NextRuntime,
        actions: ResolvedVc<AllActions>,
        chunk_item: ResolvedVc<Box<dyn ChunkItem>>,
        async_module_info: ResolvedVc<AsyncModulesInfo>,
    ) -> Vc<Self> {
        Self {
            node_root,
            page_name,
            runtime,
            actions,
            chunk_item,
            async_module_info,
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
        let loader_id = self.chunk_item.id().await?;
        let loader_id = match &loader_id {
            ModuleId::Number(id) => ActionManifestModuleId::Number(*id),
            ModuleId::String(id) => ActionManifestModuleId::String(id),
        };
        let mapping = match self.runtime {
            NextRuntime::Edge => &mut manifest.edge,
            NextRuntime::NodeJs => &mut manifest.node,
        };

        struct ActionMetadata<'a> {
            exported_name: &'a str,
            filename: Cow<'a, str>,
        }

        let action_metadata: Vec<(&str, ActionMetadata<'_>)> = actions_value
            .iter()
            .map(async |(hash_id, (_layer, meta, module))| {
                // Use source_path from the action comment if available (contains original .ts/.tsx
                // path), otherwise fall back to module.ident().path() (may be compiled .js
                // path)
                let filename = if !meta.source_path.is_empty() {
                    Cow::Borrowed(&*meta.source_path)
                } else {
                    Cow::Owned(module.ident().await?.path.to_string())
                };

                Ok((
                    &**hash_id,
                    ActionMetadata {
                        exported_name: &meta.name,
                        filename,
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
            },
        ) in &action_metadata
        {
            let entry = mapping.entry(hash_id).or_default();
            entry.workers.insert(
                &key,
                ActionManifestWorkerEntry {
                    module_id: loader_id.clone(),
                    is_async: self
                        .async_module_info
                        .is_async(self.chunk_item.module().to_resolved().await?)
                        .await?,
                    exported_name,
                    filename: filename.as_ref(),
                },
            );

            // Hoist the filename and exported_name to the entry level
            entry.exported_name = exported_name;
            entry.filename = filename.as_ref();
        }

        Ok(AssetContent::file(
            FileContent::Content(File::from(serde_json::to_string_pretty(&manifest)?)).cell(),
        ))
    }
}

/// The ActionBrowser layer's module is in the Client context, and we need to
/// bring it into the RSC context.
pub async fn to_rsc_context(
    client_module: Vc<Box<dyn Module>>,
    entry_path: &str,
    entry_query: &str,
    asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<ResolvedVc<Box<dyn Module>>> {
    // TODO a cleaner solution would something similar to the EcmascriptClientReferenceModule, as
    // opposed to the following hack to construct the RSC module corresponding to this client
    // module.
    let source = FileSource::new_with_query(
        client_module
            .ident()
            .await?
            .path
            .root()
            .await?
            .join(entry_path)?,
        entry_query.into(),
    );
    let module = asset_context
        .process(
            Vc::upcast(source),
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
        )
        .module()
        .to_resolved()
        .await?;
    Ok(module)
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

type HashToLayerNameModule = Vec<(
    String,
    (ActionLayer, ActionMeta, ResolvedVc<Box<dyn Module>>),
)>;

/// A mapping of every module which exports a Server Action, with the hashed id
/// and exported name of each found action.
#[turbo_tasks::value(transparent)]
pub struct AllActions(HashToLayerNameModule);

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

type LayerAndActions = (ActionLayer, ResolvedVc<ActionMap>);
/// A mapping of every module module containing Server Actions, mapping to its layer and actions.
#[turbo_tasks::value(transparent)]
pub struct AllModuleActions(
    #[bincode(with = "turbo_bincode::indexmap")]
    FxIndexMap<ResolvedVc<Box<dyn Module>>, LayerAndActions>,
);

#[turbo_tasks::function]
pub async fn map_server_actions(
    graph: OperationVc<ModuleGraphLayer>,
) -> Result<Vc<AllModuleActions>> {
    let graph = graph.connect();
    let actions = graph
        .await?
        .iter_reachable_modules()?
        .map(async |module| {
            // TODO: compare module contexts instead?
            let layer = match module.ident().await?.layer.as_ref() {
                Some(layer) if layer.name() == "app-rsc" || layer.name() == "app-edge-rsc" => {
                    ActionLayer::Rsc
                }
                Some(layer) if layer.name() == "app-client" => ActionLayer::ActionBrowser,
                // TODO really ignore SSR?
                _ => return Ok(None),
            };
            // TODO the old implementation did parse_actions(to_rsc_context(module))
            // is that really necessary?
            Ok(parse_actions(*module)
                .await?
                .map(|action_map| (module, (layer, action_map))))
        })
        .try_flat_join()
        .await?;
    Ok(Vc::cell(actions.into_iter().collect()))
}
