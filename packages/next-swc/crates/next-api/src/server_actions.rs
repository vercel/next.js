use std::{io::Write, iter::once};

use anyhow::{bail, Result};
use indexmap::IndexMap;
use indoc::writedoc;
use next_core::{
    next_manifests::{ActionLayer, ActionManifestWorkerEntry, ServerReferenceManifest},
    util::{get_asset_prefix_from_pathname, NextRuntime},
};
use next_swc::server_actions::parse_server_actions;
use turbo_tasks::{
    graph::{GraphTraversal, NonDeterministic},
    TryFlatJoinIterExt, Value, ValueToString, Vc,
};
use turbopack_binding::{
    turbo::tasks_fs::{rope::RopeBuilder, File, FileSystemPath},
    turbopack::{
        core::{
            asset::{Asset, AssetContent},
            chunk::{ChunkItemExt, ChunkableModule, EvaluatableAsset},
            context::AssetContext,
            module::Module,
            output::OutputAsset,
            reference::primary_referenced_modules,
            reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
            virtual_output::VirtualOutputAsset,
            virtual_source::VirtualSource,
        },
        ecmascript::{
            chunk::{EcmascriptChunkPlaceable, EcmascriptChunkingContext},
            parse::ParseResult,
            EcmascriptModuleAsset,
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
    node_root: Vc<FileSystemPath>,
    pathname: &str,
    page_name: &str,
    runtime: NextRuntime,
    asset_context: Vc<Box<dyn AssetContext>>,
    chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
) -> Result<(Vc<Box<dyn EvaluatableAsset>>, Vc<Box<dyn OutputAsset>>)> {
    let actions = get_actions(rsc_entry, server_reference_modules, asset_context);
    let loader = build_server_actions_loader(node_root, page_name, actions, asset_context).await?;
    let Some(evaluable) = Vc::try_resolve_sidecast::<Box<dyn EvaluatableAsset>>(loader).await?
    else {
        bail!("loader module must be evaluatable");
    };

    let loader_id = loader
        .as_chunk_item(Vc::upcast(chunking_context))
        .id()
        .to_string();
    let manifest =
        build_manifest(node_root, pathname, page_name, runtime, actions, loader_id).await?;
    Ok((evaluable, manifest))
}

/// Builds the "action loader" entry point, which reexports every found action
/// behind a lazy dynamic import.
///
/// The actions are reexported under a hashed name (comprised of the exporting
/// file's name and the action name). This hash matches the id sent to the
/// client and present inside the paired manifest.
async fn build_server_actions_loader(
    node_root: Vc<FileSystemPath>,
    page_name: &str,
    actions: Vc<ModuleActionMap>,
    asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    let actions = actions.await?;

    let mut contents = RopeBuilder::from("__turbopack_export_value__({\n");
    let mut import_map = IndexMap::with_capacity(actions.len());

    // Every module which exports an action (that is accessible starting from our
    // app page entry point) will be present. We generate a single loader file
    // which lazily imports the respective module's chunk_item id and invokes
    // the exported action function.
    for (i, (module, actions_map)) in actions.iter().enumerate() {
        let module_name = format!("ACTIONS_MODULE{i}");
        for (hash_id, name) in &*actions_map.await? {
            writedoc!(
                contents,
                "
                \x20 '{hash_id}': (...args) => import('{module_name}')
                    .then(mod => (0, mod['{name}'])(...args)),\n
                ",
            )?;
        }
        import_map.insert(module_name, module.1);
    }
    write!(contents, "}});")?;

    let output_path = node_root.join(format!("server/app{page_name}/actions.js"));
    let file = File::from(contents.build());
    let source = VirtualSource::new(output_path, AssetContent::file(file.into()));
    let module = asset_context.process(
        Vc::upcast(source),
        Value::new(ReferenceType::Internal(Vc::cell(import_map))),
    );

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
    pathname: &str,
    page_name: &str,
    runtime: NextRuntime,
    actions: Vc<ModuleActionMap>,
    loader_id: Vc<String>,
) -> Result<Vc<Box<dyn OutputAsset>>> {
    let manifest_path_prefix = get_asset_prefix_from_pathname(pathname);
    let manifest_path = node_root.join(format!(
        "server/app{manifest_path_prefix}/page/server-reference-manifest.json",
    ));
    let mut manifest = ServerReferenceManifest {
        ..Default::default()
    };

    let actions_value = actions.await?;
    let loader_id_value = loader_id.await?;
    let mapping = match runtime {
        NextRuntime::Edge => &mut manifest.edge,
        NextRuntime::NodeJs => &mut manifest.node,
    };

    for ((layer, _), action_map) in actions_value {
        let action_map = action_map.await?;
        for hash in action_map.keys() {
            let entry = mapping.entry(hash.clone()).or_default();
            entry.workers.insert(
                format!("app{page_name}"),
                ActionManifestWorkerEntry::String(loader_id_value.clone_value()),
            );
            entry.layer.insert(format!("app{page_name}"), *layer);
        }
    }

    Ok(Vc::upcast(VirtualOutputAsset::new(
        manifest_path,
        AssetContent::file(File::from(serde_json::to_string_pretty(&manifest)?).into()),
    )))
}

/// Traverses the entire module graph starting from [module], looking for magic
/// comment which identifies server actions. Every found server action will be
/// returned along with the module which exports that action.
#[turbo_tasks::function]
async fn get_actions(
    rsc_entry: Vc<Box<dyn Module>>,
    server_reference_modules: Vc<Vec<Vc<Box<dyn Module>>>>,
    asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<ModuleActionMap>> {
    let mut all_actions = NonDeterministic::new()
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
        .await?
        .into_iter()
        .map(|((layer, module), actions)| {
            let module = if layer == ActionLayer::Rsc {
                module
            } else {
                // The ActionBrowser layer's module is in the Client context, and we need to
                // bring it into the RSC context.
                let source = VirtualSource::new(
                    module.ident().path().join("action.js".to_string()),
                    module.content(),
                );
                asset_context.process(
                    Vc::upcast(source),
                    Value::new(ReferenceType::EcmaScriptModules(
                        EcmaScriptModulesReferenceSubType::Undefined,
                    )),
                )
            };
            ((layer, module), actions)
        })
        .collect::<IndexMap<_, _>>();

    all_actions.sort_keys();
    Ok(Vc::cell(all_actions))
}

/// Our graph traversal visitor, which finds the primary modules directly
/// referenced by [parent].
async fn get_referenced_modules(
    (layer, module): (ActionLayer, Vc<Box<dyn Module>>),
) -> Result<impl Iterator<Item = (ActionLayer, Vc<Box<dyn Module>>)> + Send> {
    primary_referenced_modules(module)
        .await
        .map(|modules| modules.clone_value().into_iter().map(move |m| (layer, m)))
}

/// Inspects the comments inside [module] looking for the magic actions comment.
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
        bail!(
            "failed to parse action module '{id}'",
            id = module.ident().to_string().await?
        );
    };

    let Some(actions) = parse_server_actions(program, comments.clone()) else {
        return Ok(OptionActionMap::none());
    };

    let mut actions = IndexMap::from_iter(actions.into_iter());
    actions.sort_keys();
    Ok(Vc::cell(Some(Vc::cell(actions))))
}

/// Converts our cached [parsed_actions] call into a data type suitable for
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

type LayerModuleActionMap = IndexMap<(ActionLayer, Vc<Box<dyn Module>>), Vc<ActionMap>>;

/// A mapping of every module which exports a Server Action, with the hashed id
/// and exported name of each found action.
#[turbo_tasks::value(transparent)]
struct ModuleActionMap(LayerModuleActionMap);

#[turbo_tasks::value_impl]
impl ModuleActionMap {
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
