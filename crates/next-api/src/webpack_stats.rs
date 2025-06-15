use anyhow::Result;
use serde::Serialize;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, Vc};
use turbopack_browser::ecmascript::EcmascriptBrowserChunk;
use turbopack_core::{
    chunk::{Chunk, ChunkItem},
    output::OutputAsset,
};

pub async fn generate_webpack_stats<'a, I>(
    entry_name: RcStr,
    entry_assets: I,
) -> Result<WebpackStats>
where
    I: IntoIterator<Item = &'a ResolvedVc<Box<dyn OutputAsset>>>,
{
    let mut assets = vec![];
    let mut chunks = vec![];
    let mut chunk_items: FxIndexMap<Vc<Box<dyn ChunkItem>>, FxIndexSet<RcStr>> =
        FxIndexMap::default();
    let mut modules = vec![];
    for asset in entry_assets {
        let path = normalize_client_path(&asset.path().await?.path);

        let Some(asset_len) = *asset.size_bytes().await? else {
            continue;
        };

        if let Some(chunk) = ResolvedVc::try_downcast_type::<EcmascriptBrowserChunk>(*asset) {
            let chunk_ident = normalize_client_path(&chunk.path().await?.path);
            chunks.push(WebpackStatsChunk {
                size: asset_len,
                files: vec![chunk_ident.clone()],
                id: chunk_ident.clone(),
                ..Default::default()
            });

            for item in chunk.chunk().chunk_items().await? {
                // let name =
                chunk_items
                    .entry(**item)
                    .or_default()
                    .insert(chunk_ident.clone());
            }
        }

        assets.push(WebpackStatsAsset {
            ty: rcstr!("asset"),
            name: path.clone(),
            chunks: vec![path],
            size: asset_len,
            ..Default::default()
        });
    }

    for (chunk_item, chunks) in chunk_items {
        let size = *chunk_item.content_ident().path().read().len().await?;
        let path = chunk_item.asset_ident().path().await?.path.clone();
        modules.push(WebpackStatsModule {
            name: path.clone(),
            id: path,
            chunks: chunks.into_iter().collect(),
            size,
        });
    }

    let mut entrypoints = FxIndexMap::default();
    entrypoints.insert(
        entry_name.clone(),
        WebpackStatsEntrypoint {
            name: entry_name.clone(),
            chunks: chunks.iter().map(|c| c.id.clone()).collect(),
            assets: assets
                .iter()
                .map(|a| WebpackStatsEntrypointAssets {
                    name: a.name.clone(),
                })
                .collect(),
        },
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
    pub name: RcStr,
    pub info: WebpackStatsAssetInfo,
    pub size: u64,
    pub emitted: bool,
    pub compared_for_emit: bool,
    pub cached: bool,
    pub chunks: Vec<RcStr>,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebpackStatsChunk {
    pub rendered: bool,
    pub initial: bool,
    pub entry: bool,
    pub recorded: bool,
    pub id: RcStr,
    pub size: u64,
    pub hash: RcStr,
    pub files: Vec<RcStr>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WebpackStatsModule {
    pub name: RcStr,
    pub id: RcStr,
    pub chunks: Vec<RcStr>,
    pub size: Option<u64>,
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
