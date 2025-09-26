use anyhow::Result;
use rustc_hash::FxHashSet;
use serde::Serialize;
use tracing::instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, ResolvedVc, TryJoinIterExt, ValueToString, Vc, fxindexmap,
};
use turbopack_browser::ecmascript::EcmascriptBrowserChunk;
use turbopack_core::{
    chunk::{Chunk, ChunkItem, ChunkItemExt, ModuleId},
    module::Module,
    module_graph::ModuleGraph,
    output::OutputAsset,
};

#[instrument(level = "info", name = "generate webpack stats", skip_all)]
pub async fn generate_webpack_stats<I>(
    module_graph: Vc<ModuleGraph>,
    entry_name: RcStr,
    entry_assets: I,
) -> Result<WebpackStats>
where
    I: IntoIterator<Item = ResolvedVc<Box<dyn OutputAsset>>>,
{
    let mut assets = vec![];
    let mut chunks = vec![];
    let mut chunk_items: FxIndexMap<Vc<Box<dyn ChunkItem>>, FxIndexSet<RcStr>> =
        FxIndexMap::default();

    let entry_assets = entry_assets.into_iter().collect::<Vec<_>>();

    let (asset_parents, asset_children) = {
        let mut asset_children =
            FxIndexMap::with_capacity_and_hasher(entry_assets.len(), Default::default());
        let mut visited =
            FxHashSet::with_capacity_and_hasher(entry_assets.len(), Default::default());
        let mut queue = entry_assets.clone();
        while let Some(asset) = queue.pop() {
            if visited.insert(asset) {
                let references = asset.references().await?;
                asset_children.insert(asset, references.clone());
                queue.extend(references);
            }
        }

        let mut asset_parents: FxIndexMap<_, Vec<_>> =
            FxIndexMap::with_capacity_and_hasher(entry_assets.len(), Default::default());
        for (&parent, children) in &asset_children {
            for child in children {
                asset_parents.entry(*child).or_default().push(parent);
            }
        }

        (asset_parents, asset_children)
    };

    let asset_reasons = {
        let module_graph = module_graph.read_graphs().await?;
        let mut edges = vec![];
        module_graph.traverse_all_edges_unordered(|(parent_node, r), current| {
            edges.push((
                parent_node.module,
                RcStr::from(format!("{}: {}", r.chunking_type, r.export)),
                current.module,
            ));
            Ok(())
        })?;

        let edges = edges
            .into_iter()
            .map(async |(parent, ty, child)| {
                let parent_path = parent.ident().path().await?.path.clone();
                Ok((
                    child,
                    WebpackStatsReason {
                        module: parent_path.clone(),
                        module_identifier: parent.ident().to_string().owned().await?,
                        module_name: parent_path,
                        ty,
                    },
                ))
            })
            .try_join()
            .await?;

        let mut asset_reasons: FxIndexMap<_, Vec<_>> = FxIndexMap::default();
        for (child, reason) in edges {
            asset_reasons.entry(child).or_default().push(reason);
        }
        asset_reasons
    };

    for asset in entry_assets {
        let path = normalize_client_path(&asset.path().await?.path);

        let Some(asset_len) = *asset.size_bytes().await? else {
            continue;
        };

        if let Some(chunk) = ResolvedVc::try_downcast_type::<EcmascriptBrowserChunk>(asset) {
            chunks.push(WebpackStatsChunk {
                size: asset_len,
                files: vec![path.clone()],
                id: path.clone(),
                parents: if let Some(parents) = asset_parents.get(&asset) {
                    parents
                        .iter()
                        .map(async |c| Ok(normalize_client_path(&c.path().await?.path)))
                        .try_join()
                        .await?
                } else {
                    vec![]
                },
                children: if let Some(children) = asset_children.get(&asset) {
                    children
                        .iter()
                        .map(async |c| Ok(normalize_client_path(&c.path().await?.path)))
                        .try_join()
                        .await?
                } else {
                    vec![]
                },
                ..Default::default()
            });

            for item in chunk.chunk().chunk_items().await? {
                chunk_items.entry(**item).or_default().insert(path.clone());
            }
        }

        assets.push(WebpackStatsAsset {
            ty: rcstr!("asset"),
            name: path.clone(),
            chunk_names: vec![path],
            size: asset_len,
            ..Default::default()
        });
    }

    // TODO try to downcast modules to `EcmascriptMergedModule` to include the scope hoisted modules
    // as well

    let modules = chunk_items
        .into_iter()
        .map(async |(chunk_item, chunks)| {
            let size = *chunk_item
                .content_ident()
                .path()
                .await?
                .read()
                .len()
                .await?;
            Ok(WebpackStatsModule {
                name: chunk_item.asset_ident().path().await?.path.clone(),
                id: chunk_item.id().owned().await?,
                identifier: chunk_item.asset_ident().to_string().owned().await?,
                chunks: chunks.into_iter().collect(),
                size,
                // TODO Find all incoming edges to this module
                reasons: asset_reasons
                    .get(&chunk_item.module().to_resolved().await?)
                    .cloned()
                    .unwrap_or_default(),
            })
        })
        .try_join()
        .await?;

    let entrypoints: FxIndexMap<_, _> = fxindexmap!(
        entry_name.clone() =>
        WebpackStatsEntrypoint {
            name: entry_name.clone(),
            chunks: chunks.iter().map(|c| c.id.clone()).collect(),
            assets: assets
                .iter()
                .map(|a| WebpackStatsEntrypointAssets {
                    name: a.name.clone(),
                })
                .collect(),
        }
    );

    Ok(WebpackStats {
        assets,
        entrypoints,
        chunks,
        modules,
    })
}

fn normalize_client_path(path: &str) -> RcStr {
    let next_re = regex::Regex::new(r"^_next/").unwrap();
    next_re.replace(path, ".next/").into()
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebpackStatsAssetInfo {}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebpackStatsAsset {
    #[serde(rename = "type")]
    pub ty: RcStr,
    /// The `output` filename
    pub name: RcStr,
    pub info: WebpackStatsAssetInfo,
    /// The size of the file in bytes
    pub size: u64,
    /// Indicates whether or not the asset made it to the `output` directory
    pub emitted: bool,
    /// Indicates whether or not the asset was compared with the same file on the output file
    /// system
    pub compared_for_emit: bool,
    pub cached: bool,
    /// The chunks this asset contains
    pub chunk_names: Vec<RcStr>,
    /// The chunk IDs this asset contains
    pub chunks: Vec<RcStr>,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebpackStatsChunk {
    /// Indicates whether or not the chunk went through Code Generation
    pub rendered: bool,
    /// Indicates whether this chunk is loaded on initial page load or lazily.
    pub initial: bool,
    /// Indicates whether or not the chunk contains the webpack runtime
    pub entry: bool,
    pub recorded: bool,
    /// The ID of this chunk
    pub id: RcStr,
    /// Chunk size in bytes
    pub size: u64,
    pub hash: RcStr,
    /// An array of filename strings that contain this chunk
    pub files: Vec<RcStr>,
    /// An list of chunk names contained within this chunk
    pub names: Vec<RcStr>,
    /// Parent chunk IDs
    pub parents: Vec<RcStr>,
    /// Child chunk IDs
    pub children: Vec<RcStr>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WebpackStatsModule {
    /// Path to the actual file
    pub name: RcStr,
    /// The ID of the module
    pub id: ModuleId,
    /// A unique ID used internally
    pub identifier: RcStr,
    pub chunks: Vec<RcStr>,
    pub size: Option<u64>,
    pub reasons: Vec<WebpackStatsReason>,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WebpackStatsReason {
    /// The [WebpackStatsModule::name]
    pub module: RcStr,
    // /// The [WebpackStatsModule::id]
    // pub module_id: ModuleId,
    /// The [WebpackStatsModule::identifier]
    pub module_identifier: RcStr,
    /// A more readable name for the module (used for "pretty-printing")
    pub module_name: RcStr,
    /// The [type of request](/api/module-methods) used
    #[serde(rename = "type")]
    pub ty: RcStr,
    // /// Raw string used for the `import` or `require` request
    // pub user_request: RcStr,
    // /// Lines of code that caused the module to be included
    // pub loc: RcStr
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WebpackStatsEntrypointAssets {
    pub name: RcStr,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WebpackStatsEntrypoint {
    pub name: RcStr,
    pub chunks: Vec<RcStr>,
    pub assets: Vec<WebpackStatsEntrypointAssets>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WebpackStats {
    pub assets: Vec<WebpackStatsAsset>,
    pub entrypoints: FxIndexMap<RcStr, WebpackStatsEntrypoint>,
    pub chunks: Vec<WebpackStatsChunk>,
    pub modules: Vec<WebpackStatsModule>,
}
