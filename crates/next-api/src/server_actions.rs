use std::{
    collections::{BTreeMap, HashMap},
    io::Write,
};

use anyhow::{bail, Context, Result};
use next_core::{
    next_manifests::{
        ActionLayer, ActionManifestModuleId, ActionManifestWorkerEntry, ServerReferenceManifest,
    },
    util::NextRuntime,
};
use swc_core::{
    atoms::Atom,
    common::comments::Comments,
    ecma::{
        ast::{
            Decl, ExportSpecifier, Id, ModuleDecl, ModuleItem, ObjectLit, Program,
            PropOrSpread::Prop,
        },
        utils::find_pat_ids,
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, TryFlatJoinIterExt, Value, ValueToString, Vc};
use turbo_tasks_fs::{self, rope::RopeBuilder, File, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    chunk::{ChunkItem, ChunkItemExt, ChunkableModule, ChunkingContext, EvaluatableAsset},
    context::AssetContext,
    file_source::FileSource,
    module::Module,
    output::OutputAsset,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::ModulePart,
    virtual_output::VirtualOutputAsset,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::{
    chunk::EcmascriptChunkPlaceable, parse::ParseResult,
    tree_shake::asset::EcmascriptModulePartAsset, EcmascriptParsable,
};

use crate::module_graph::SingleModuleGraph;

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
    project_path: Vc<FileSystemPath>,
    node_root: Vc<FileSystemPath>,
    page_name: RcStr,
    runtime: NextRuntime,
    rsc_asset_context: Vc<Box<dyn AssetContext>>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<ServerActionsManifest>> {
    let loader =
        build_server_actions_loader(project_path, page_name.clone(), actions, rsc_asset_context);
    let evaluable = Vc::try_resolve_sidecast::<Box<dyn EvaluatableAsset>>(loader)
        .await?
        .context("loader module must be evaluatable")?
        .to_resolved()
        .await?;

    let chunk_item = loader.as_chunk_item(Vc::upcast(chunking_context));
    let manifest = build_manifest(node_root, page_name, runtime, actions, chunk_item).await?;
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
async fn build_server_actions_loader(
    project_path: Vc<FileSystemPath>,
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
    for (hash_id, (_layer, name, module)) in actions.iter() {
        let index = import_map.len();
        let module_name = import_map
            .entry(*module)
            .or_insert_with(|| format!("ACTIONS_MODULE{index}").into());
        writeln!(
            contents,
            "export {{{name} as '{hash_id}'}} from '{module_name}'"
        )?;
    }

    let output_path =
        project_path.join(format!(".next-internal/server/app{page_name}/actions.js").into());
    let file = File::from(contents.build());
    let source = VirtualSource::new(output_path, AssetContent::file(file.into()));
    let import_map = import_map.into_iter().map(|(k, v)| (v, k)).collect();
    let module = asset_context
        .process(
            Vc::upcast(source),
            Value::new(ReferenceType::Internal(ResolvedVc::cell(import_map))),
        )
        .module();

    let Some(placeable) =
        Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module).await?
    else {
        bail!("internal module must be evaluatable");
    };

    Ok(placeable)
}

/// Builds a manifest containing every action's hashed id, with an internal
/// module id which exports a function using that hashed name.
async fn build_manifest(
    node_root: Vc<FileSystemPath>,
    page_name: RcStr,
    runtime: NextRuntime,
    actions: Vc<AllActions>,
    chunk_item: Vc<Box<dyn ChunkItem>>,
) -> Result<ResolvedVc<Box<dyn OutputAsset>>> {
    let manifest_path_prefix = &page_name;
    let manifest_path = node_root
        .join(format!("server/app{manifest_path_prefix}/server-reference-manifest.json",).into());
    let mut manifest = ServerReferenceManifest {
        ..Default::default()
    };

    let key = format!("app{page_name}");

    let actions_value = actions.await?;
    let loader_id = chunk_item.id().to_string().await?;
    let mapping = match runtime {
        NextRuntime::Edge => &mut manifest.edge,
        NextRuntime::NodeJs => &mut manifest.node,
    };

    for (hash_id, (layer, _name, _module)) in actions_value {
        let entry = mapping.entry(hash_id.as_str()).or_default();
        entry.workers.insert(
            &key,
            ActionManifestWorkerEntry {
                module_id: ActionManifestModuleId::String(loader_id.as_str()),
                is_async: *chunk_item.is_self_async().await?,
            },
        );
        entry.layer.insert(&key, *layer);
    }

    Ok(ResolvedVc::upcast(
        VirtualOutputAsset::new(
            manifest_path,
            AssetContent::file(File::from(serde_json::to_string_pretty(&manifest)?).into()),
        )
        .to_resolved()
        .await?,
    ))
}

/// The ActionBrowser layer's module is in the Client context, and we need to
/// bring it into the RSC context.
pub async fn to_rsc_context(
    module: Vc<Box<dyn Module>>,
    asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<ResolvedVc<Box<dyn Module>>> {
    let source = FileSource::new_with_query(module.ident().path(), module.ident().query());
    let module = asset_context
        .process(
            Vc::upcast(source),
            Value::new(ReferenceType::EcmaScriptModules(
                EcmaScriptModulesReferenceSubType::Undefined,
            )),
        )
        .module()
        .to_resolved()
        .await?;
    Ok(module)
}

/// Parses the Server Actions comment for all exported action function names.
///
/// Action names are stored in a leading BlockComment prefixed by
/// `__next_internal_action_entry_do_not_use__`.
pub fn parse_server_actions(
    program: &Program,
    comments: &dyn Comments,
) -> Option<BTreeMap<String, String>> {
    let byte_pos = match program {
        Program::Module(m) => m.span.lo,
        Program::Script(s) => s.span.lo,
    };
    comments.get_leading(byte_pos).and_then(|comments| {
        comments.iter().find_map(|c| {
            c.text
                .split_once("__next_internal_action_entry_do_not_use__")
                .and_then(|(_, actions)| match serde_json::from_str(actions) {
                    Ok(v) => Some(v),
                    Err(_) => None,
                })
        })
    })
}
/// Inspects the comments inside [Module] looking for the magic actions comment.
/// If found, we return the mapping of every action's hashed id to the name of
/// the exported action function. If not, we return a None.
#[turbo_tasks::function]
async fn parse_actions(module: Vc<Box<dyn Module>>) -> Result<Vc<OptionActionMap>> {
    let Some(ecmascript_asset) =
        Vc::try_resolve_sidecast::<Box<dyn EcmascriptParsable>>(module).await?
    else {
        return Ok(Vc::cell(None));
    };

    if let Some(module) = Vc::try_resolve_downcast_type::<EcmascriptModulePartAsset>(module).await?
    {
        if matches!(
            &*module.await?.part.await?,
            ModulePart::Evaluation | ModulePart::Facade
        ) {
            return Ok(Vc::cell(None));
        }
    }

    let original_parsed = ecmascript_asset.parse_original().resolve().await?;

    let ParseResult::Ok {
        program: original,
        comments,
        ..
    } = &*original_parsed.await?
    else {
        // The file might be parse-able, but this is reported separately.
        return Ok(Vc::cell(None));
    };

    let Some(mut actions) = parse_server_actions(original, comments) else {
        return Ok(Vc::cell(None));
    };

    let fragment = ecmascript_asset.failsafe_parse().resolve().await?;

    if fragment != original_parsed {
        let ParseResult::Ok {
            program: fragment, ..
        } = &*fragment.await?
        else {
            // The file might be be parse-able, but this is reported separately.
            return Ok(Vc::cell(None));
        };

        let all_exports = all_export_names(fragment);
        actions.retain(|_, name| all_exports.iter().any(|export| export == name));
    }

    let mut actions = FxIndexMap::from_iter(actions.into_iter());
    actions.sort_keys();
    Ok(Vc::cell(Some(ResolvedVc::cell(actions))))
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
                        exports.push("default".into());
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
                                            .clone(),
                                    );
                                }
                                ExportSpecifier::Default(_) => {
                                    exports.push("default".into());
                                }
                                ExportSpecifier::Namespace(e) => {
                                    exports.push(e.name.atom().clone());
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

type HashToLayerNameModule = FxIndexMap<String, (ActionLayer, String, ResolvedVc<Box<dyn Module>>)>;

/// A mapping of every module which exports a Server Action, with the hashed id
/// and exported name of each found action.
#[turbo_tasks::value(transparent)]
pub struct AllActions(HashToLayerNameModule);

#[turbo_tasks::value_impl]
impl AllActions {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(FxIndexMap::default())
    }
}

/// Maps the hashed action id to the action's exported function name.
#[turbo_tasks::value(transparent)]
pub struct ActionMap(FxIndexMap<String, String>);

/// An Option wrapper around [ActionMap].
#[turbo_tasks::value(transparent)]
struct OptionActionMap(Option<ResolvedVc<ActionMap>>);

type LayerAndActions = (ActionLayer, ResolvedVc<ActionMap>);
/// A mapping of every module module containing Server Actions, mapping to its layer and actions.
#[turbo_tasks::value(transparent)]
pub struct AllModuleActions(HashMap<ResolvedVc<Box<dyn Module>>, LayerAndActions>);

#[turbo_tasks::function]
pub async fn map_server_actions(graph: Vc<SingleModuleGraph>) -> Result<Vc<AllModuleActions>> {
    let actions = graph
        .await?
        .enumerate_nodes()
        .map(|(_, module)| {
            async move {
                let layer = match module.ident().await?.layer {
                    Some(layer) => {
                        // TODO: compare module contexts instead?
                        let layer = &**layer.await?;
                        match layer {
                            "app-rsc" | "app-edge-rsc" => ActionLayer::Rsc,
                            "app-client" => ActionLayer::ActionBrowser,
                            // TODO really ignore SSR?
                            _ => return Ok(None),
                        }
                    }
                    None => return Ok(None),
                };
                // TODO the old implementation did parse_actions(to_rsc_context(module))
                // is that really necessary?
                Ok(match &*parse_actions(*module).await? {
                    Some(action_map) => Some((module, (layer, action_map.to_resolved().await?))),
                    None => None,
                })
            }
        })
        .try_flat_join()
        .await?;
    Ok(Vc::cell(actions.into_iter().collect()))
}
