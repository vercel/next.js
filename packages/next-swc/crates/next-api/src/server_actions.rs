use std::{collections::BTreeMap, io::Write, iter::once};

use anyhow::{bail, Context, Result};
use indexmap::{map::Entry, IndexMap};
use next_core::{
    next_manifests::{ActionLayer, ActionManifestWorkerEntry, ServerReferenceManifest},
    util::NextRuntime,
};
use tracing::Instrument;
use turbo_tasks::{
    graph::{GraphTraversal, NonDeterministic},
    TryFlatJoinIterExt, Value, ValueToString, Vc,
};
use turbopack_binding::{
    swc::core::{common::comments::Comments, ecma::ast::Program},
    turbo::tasks_fs::{rope::RopeBuilder, File, FileSystemPath},
    turbopack::{
        core::{
            asset::{Asset, AssetContent},
            chunk::{ChunkItemExt, ChunkableModule, EvaluatableAsset},
            context::AssetContext,
            module::Module,
            output::OutputAsset,
            reference::primary_referenced_modules,
            reference_type::{
                EcmaScriptModulesReferenceSubType, ReferenceType, TypeScriptReferenceSubType,
            },
            virtual_output::VirtualOutputAsset,
            virtual_source::VirtualSource,
        },
        ecmascript::{
            chunk::{EcmascriptChunkPlaceable, EcmascriptChunkingContext},
            parse::ParseResult,
            EcmascriptModuleAsset, EcmascriptModuleAssetType,
        },
    },
};

/// Scans the RSC entry point's full module graph looking for exported Server
/// Actions (identifiable by a magic comment in the transformed module's
/// output), and constructs a evaluatable "action loader" entry point and
/// manifest describing the found actions.
///
/// If Server Actions are not enabled, this returns an empty manifest and a None
/// loader.
pub(crate) async fn create_server_actions_manifest(
    rsc_entry: Vc<Box<dyn Module>>,
    server_reference_modules: Vc<Vec<Vc<Box<dyn Module>>>>,
    project_path: Vc<FileSystemPath>,
    node_root: Vc<FileSystemPath>,
    page_name: &str,
    runtime: NextRuntime,
    asset_context: Vc<Box<dyn AssetContext>>,
    chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
) -> Result<(Vc<Box<dyn EvaluatableAsset>>, Vc<Box<dyn OutputAsset>>)> {
    let actions = get_actions(rsc_entry, server_reference_modules, asset_context);
    let loader =
        build_server_actions_loader(project_path, page_name.to_string(), actions, asset_context);
    let evaluable = Vc::try_resolve_sidecast::<Box<dyn EvaluatableAsset>>(loader)
        .await?
        .context("loader module must be evaluatable")?;

    let loader_id = loader
        .as_chunk_item(Vc::upcast(chunking_context))
        .id()
        .to_string();
    let manifest = build_manifest(node_root, page_name, runtime, actions, loader_id).await?;
    Ok((evaluable, manifest))
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
    page_name: String,
    actions: Vc<AllActions>,
    asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    let actions = actions.await?;

    // Every module which exports an action (that is accessible starting from our
    // app page entry point) will be present. We generate a single loader file
    // which lazily imports the respective module's chunk_item id and invokes
    // the exported action function.
    let mut contents = RopeBuilder::from("__turbopack_export_value__({\n");
    let mut import_map = IndexMap::new();
    for (hash_id, (_layer, name, module)) in actions.iter() {
        let index = import_map.len();
        let module_name = import_map
            .entry(*module)
            .or_insert_with(|| format!("ACTIONS_MODULE{index}"));
        writeln!(
            contents,
            "  '{hash_id}': (...args) => Promise.resolve(require('{module_name}')).then(mod => \
             (0, mod['{name}'])(...args)),",
        )?;
    }
    write!(contents, "}});")?;

    let output_path = project_path.join(format!(".next-internal/server/app{page_name}/actions.js"));
    let file = File::from(contents.build());
    let source = VirtualSource::new(output_path, AssetContent::file(file.into()));
    let import_map = import_map.into_iter().map(|(k, v)| (v, k)).collect();
    let module = asset_context
        .process(
            Vc::upcast(source),
            Value::new(ReferenceType::Internal(Vc::cell(import_map))),
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
    page_name: &str,
    runtime: NextRuntime,
    actions: Vc<AllActions>,
    loader_id: Vc<String>,
) -> Result<Vc<Box<dyn OutputAsset>>> {
    let manifest_path_prefix = page_name;
    let manifest_path = node_root.join(format!(
        "server/app{manifest_path_prefix}/server-reference-manifest.json",
    ));
    let mut manifest = ServerReferenceManifest {
        ..Default::default()
    };

    let key = format!("app{page_name}");

    let actions_value = actions.await?;
    let loader_id_value = loader_id.await?;
    let mapping = match runtime {
        NextRuntime::Edge => &mut manifest.edge,
        NextRuntime::NodeJs => &mut manifest.node,
    };

    for (hash_id, (layer, _name, _module)) in actions_value {
        let entry = mapping.entry(hash_id.as_str()).or_default();
        entry.workers.insert(
            &key,
            ActionManifestWorkerEntry::String(loader_id_value.as_str()),
        );
        entry.layer.insert(&key, *layer);
    }

    Ok(Vc::upcast(VirtualOutputAsset::new(
        manifest_path,
        AssetContent::file(File::from(serde_json::to_string_pretty(&manifest)?).into()),
    )))
}

#[turbo_tasks::function]
fn action_modifier() -> Vc<String> {
    Vc::cell("action".to_string())
}

/// Traverses the entire module graph starting from [Module], looking for magic
/// comment which identifies server actions. Every found server action will be
/// returned along with the module which exports that action.
#[turbo_tasks::function]
async fn get_actions(
    rsc_entry: Vc<Box<dyn Module>>,
    server_reference_modules: Vc<Vec<Vc<Box<dyn Module>>>>,
    asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<AllActions>> {
    async move {
        let actions = NonDeterministic::new()
            .skip_duplicates()
            .visit(
                once((ActionLayer::Rsc, rsc_entry)).chain(
                    server_reference_modules
                        .await?
                        .iter()
                        .map(|m| (ActionLayer::ActionBrowser, *m)),
                ),
                get_referenced_modules,
            )
            .await
            .completed()?
            .into_inner()
            .into_iter()
            .map(parse_actions_filter_map)
            .try_flat_join()
            .await?;

        // Actions can be imported by both Client and RSC layers, in which case we need
        // to use the RSC layer's module. We do that by merging the hashes (which match
        // in both layers) and preferring the RSC layer's action.
        let mut all_actions: HashToLayerNameModule = IndexMap::new();
        for ((layer, module), actions_map) in actions.iter() {
            let module = if *layer == ActionLayer::Rsc {
                *module
            } else {
                to_rsc_context(*module, asset_context).await?
            };

            for (hash_id, name) in &*actions_map.await? {
                match all_actions.entry(hash_id.to_owned()) {
                    Entry::Occupied(e) => {
                        if e.get().0 == ActionLayer::ActionBrowser {
                            *e.into_mut() = (*layer, name.to_string(), module);
                        }
                    }
                    Entry::Vacant(e) => {
                        e.insert((*layer, name.to_string(), module));
                    }
                }
            }
        }

        all_actions.sort_keys();
        Ok(Vc::cell(all_actions))
    }
    .instrument(tracing::info_span!("find server actions"))
    .await
}

/// The ActionBrowser layer's module is in the Client context, and we need to
/// bring it into the RSC context.
async fn to_rsc_context(
    module: Vc<Box<dyn Module>>,
    asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<Box<dyn Module>>> {
    let source = VirtualSource::new_with_ident(
        module.ident().with_modifier(action_modifier()),
        module.content(),
    );
    let ty = if let Some(module) =
        Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(module).await?
    {
        if module.await?.ty == EcmascriptModuleAssetType::Ecmascript {
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined)
        } else {
            ReferenceType::TypeScript(TypeScriptReferenceSubType::Undefined)
        }
    } else {
        ReferenceType::TypeScript(TypeScriptReferenceSubType::Undefined)
    };
    let module = asset_context
        .process(Vc::upcast(source), Value::new(ty))
        .module();
    Ok(module)
}

/// Our graph traversal visitor, which finds the primary modules directly
/// referenced by parent.
async fn get_referenced_modules(
    (layer, module): (ActionLayer, Vc<Box<dyn Module>>),
) -> Result<impl Iterator<Item = (ActionLayer, Vc<Box<dyn Module>>)> + Send> {
    primary_referenced_modules(module)
        .await
        .map(|modules| modules.into_iter().map(move |&m| (layer, m)))
}

/// Parses the Server Actions comment for all exported action function names.
///
/// Action names are stored in a leading BlockComment prefixed by
/// `__next_internal_action_entry_do_not_use__`.
pub fn parse_server_actions<C: Comments>(
    program: &Program,
    comments: C,
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
        Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(module).await?
    else {
        return Ok(OptionActionMap::none());
    };
    let ParseResult::Ok {
        comments, program, ..
    } = &*ecmascript_asset.parse().await?
    else {
        // The file might be be parse-able, but this is reported separately.
        return Ok(OptionActionMap::none());
    };

    let Some(actions) = parse_server_actions(program, comments.clone()) else {
        return Ok(OptionActionMap::none());
    };

    let mut actions = IndexMap::from_iter(actions.into_iter());
    actions.sort_keys();
    Ok(Vc::cell(Some(Vc::cell(actions))))
}

/// Converts our cached [parse_actions] call into a data type suitable for
/// collecting into a flat-mapped [IndexMap].
async fn parse_actions_filter_map(
    (layer, module): (ActionLayer, Vc<Box<dyn Module>>),
) -> Result<Option<((ActionLayer, Vc<Box<dyn Module>>), Vc<ActionMap>)>> {
    parse_actions(module).await.map(|option_action_map| {
        option_action_map
            .clone_value()
            .map(|action_map| ((layer, module), action_map))
    })
}

type HashToLayerNameModule = IndexMap<String, (ActionLayer, String, Vc<Box<dyn Module>>)>;

/// A mapping of every module which exports a Server Action, with the hashed id
/// and exported name of each found action.
#[turbo_tasks::value(transparent)]
struct AllActions(HashToLayerNameModule);

#[turbo_tasks::value_impl]
impl AllActions {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(IndexMap::new())
    }
}

/// Maps the hashed action id to the action's exported function name.
#[turbo_tasks::value(transparent)]
struct ActionMap(IndexMap<String, String>);

/// An Option wrapper around [ActionMap].
#[turbo_tasks::value(transparent)]
struct OptionActionMap(Option<Vc<ActionMap>>);

#[turbo_tasks::value_impl]
impl OptionActionMap {
    #[turbo_tasks::function]
    pub fn none() -> Vc<Self> {
        Vc::cell(None)
    }
}
