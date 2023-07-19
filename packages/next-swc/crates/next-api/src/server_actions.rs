use std::io::Write;

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
            asset::AssetContent, chunk::EvaluatableAsset, context::AssetContext, module::Module,
            output::OutputAsset, reference::primary_referenced_modules,
            reference_type::ReferenceType, virtual_output::VirtualOutputAsset,
            virtual_source::VirtualSource,
        },
        ecmascript::{
            chunk::{EcmascriptChunkItemExt, EcmascriptChunkPlaceable, EcmascriptChunkingContext},
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
    entry: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    node_root: Vc<FileSystemPath>,
    pathname: &str,
    page_name: &str,
    runtime: NextRuntime,
    asset_context: Vc<Box<dyn AssetContext>>,
    chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    enable_server_actions: Vc<bool>,
) -> Result<(
    Option<Vc<Box<dyn EvaluatableAsset>>>,
    Vc<Box<dyn OutputAsset>>,
)> {
    // If actions aren't enabled, then there's no need to scan the module graph. We
    // still need to generate an empty manifest so that the TS side can merge
    // the manifest later on.
    if !*enable_server_actions.await? {
        let manifest = build_manifest(
            node_root,
            pathname,
            page_name,
            runtime,
            ModuleActionMap::empty(),
            Default::default(),
        )
        .await?;
        return Ok((None, manifest));
    }

    let actions = get_actions(Vc::upcast(entry));
    let loader = build_server_actions_loader(node_root, page_name, actions, asset_context).await?;
    let Some(evaluable) = Vc::try_resolve_sidecast::<Box<dyn EvaluatableAsset>>(loader).await?
    else {
        bail!("loader module must be evaluatable");
    };

    let loader_id = loader.as_chunk_item(chunking_context).id().to_string();
    let manifest =
        build_manifest(node_root, pathname, page_name, runtime, actions, loader_id).await?;
    Ok((Some(evaluable), manifest))
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
        for (hash_id, name) in &*actions_map.await? {
            writedoc!(
                contents,
                "
    \x20 '{hash_id}': (...args) => import('ACTIONS_MODULE{i}')
      .then(mod => (0, mod['{name}'])(...args)),\n
    ",
            )?;
        }
        import_map.insert(format!("ACTIONS_MODULE{i}"), *module);
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

    for value in actions_value.values() {
        let value = value.await?;
        for hash in value.keys() {
            let entry = mapping.entry(hash.clone()).or_default();
            entry.workers.insert(
                format!("app{page_name}"),
                ActionManifestWorkerEntry::String(loader_id_value.clone_value()),
            );
            entry
                .layer
                .insert(format!("app{page_name}"), ActionLayer::Rsc);
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
async fn get_actions(module: Vc<Box<dyn Module>>) -> Result<Vc<ModuleActionMap>> {
    let mut all_actions = NonDeterministic::new()
        .skip_duplicates()
        .visit([module], get_referenced_modules)
        .await
        .completed()?
        .into_inner()
        .into_iter()
        .map(parse_actions_filter_map)
        .try_flat_join()
        .await?
        .into_iter()
        .collect::<IndexMap<_, _>>();

    all_actions.sort_keys();
    Ok(Vc::cell(all_actions))
}

/// Our graph traversal visitor, which finds the primary modules directly
/// referenced by [parent].
async fn get_referenced_modules(
    parent: Vc<Box<dyn Module>>,
) -> Result<impl Iterator<Item = Vc<Box<dyn Module>>> + Send> {
    primary_referenced_modules(parent)
        .await
        .map(|modules| modules.clone_value().into_iter())
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

    let Some(actions) = parse_server_actions(&program, comments.clone()) else {
        return Ok(OptionActionMap::none());
    };

    let mut actions = IndexMap::from_iter(actions.into_iter());
    actions.sort_keys();
    Ok(Vc::cell(Some(Vc::cell(actions))))
}

/// Converts our cached [parsed_actions] call into a data type suitable for
/// collecting into a flat-mapped [IndexMap].
async fn parse_actions_filter_map(
    module: Vc<Box<dyn Module>>,
) -> Result<Option<(Vc<Box<dyn Module>>, Vc<ActionMap>)>> {
    parse_actions(module).await.map(|option_action_map| {
        option_action_map
            .clone_value()
            .map(|action_map| (module, action_map))
    })
}

/// A mapping of every module which exports a Server Action, with the hashed id
/// and exported name of each found action.
#[turbo_tasks::value(transparent)]
struct ModuleActionMap(IndexMap<Vc<Box<dyn Module>>, Vc<ActionMap>>);

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
