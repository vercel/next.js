use std::{collections::VecDeque, iter::once};

use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    fxindexset, Completion, FxIndexMap, FxIndexSet, ResolvedVc, State, TryJoinIterExt, Value,
    ValueToString, Vc,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::Asset,
    introspect::{output_asset::IntrospectableOutputAsset, Introspectable, IntrospectableChildren},
    output::{OutputAsset, OutputAssetsSet},
};

use super::{
    route_tree::{BaseSegment, RouteTree, RouteTrees, RouteType},
    ContentSource, ContentSourceContent, ContentSourceData, ContentSourceSideEffect,
    GetContentSourceContent,
};

#[turbo_tasks::value(transparent)]
struct OutputAssetsMap(FxIndexMap<RcStr, ResolvedVc<Box<dyn OutputAsset>>>);

type ExpandedState = State<FxHashSet<RcStr>>;

#[turbo_tasks::value(serialization = "none", eq = "manual", cell = "new")]
pub struct AssetGraphContentSource {
    root_path: ResolvedVc<FileSystemPath>,
    root_assets: ResolvedVc<OutputAssetsSet>,
    expanded: Option<ExpandedState>,
}

#[turbo_tasks::value_impl]
impl AssetGraphContentSource {
    /// Serves all assets references by root_asset.
    #[turbo_tasks::function]
    pub fn new_eager(
        root_path: ResolvedVc<FileSystemPath>,
        root_asset: ResolvedVc<Box<dyn OutputAsset>>,
    ) -> Vc<Self> {
        Self::cell(AssetGraphContentSource {
            root_path,
            root_assets: ResolvedVc::cell(fxindexset! { root_asset }),
            expanded: None,
        })
    }

    /// Serves all assets references by root_asset. Only serve references of an
    /// asset when it has served its content before.
    #[turbo_tasks::function]
    pub fn new_lazy(
        root_path: ResolvedVc<FileSystemPath>,
        root_asset: ResolvedVc<Box<dyn OutputAsset>>,
    ) -> Vc<Self> {
        Self::cell(AssetGraphContentSource {
            root_path,
            root_assets: ResolvedVc::cell(fxindexset! { root_asset }),
            expanded: Some(State::new(FxHashSet::default())),
        })
    }

    /// Serves all assets references by all root_assets.
    #[turbo_tasks::function]
    pub fn new_eager_multiple(
        root_path: ResolvedVc<FileSystemPath>,
        root_assets: ResolvedVc<OutputAssetsSet>,
    ) -> Vc<Self> {
        Self::cell(AssetGraphContentSource {
            root_path,
            root_assets,
            expanded: None,
        })
    }

    /// Serves all assets references by all root_assets. Only serve references
    /// of an asset when it has served its content before.
    #[turbo_tasks::function]
    pub fn new_lazy_multiple(
        root_path: ResolvedVc<FileSystemPath>,
        root_assets: ResolvedVc<OutputAssetsSet>,
    ) -> Vc<Self> {
        Self::cell(AssetGraphContentSource {
            root_path,
            root_assets,
            expanded: Some(State::new(FxHashSet::default())),
        })
    }

    #[turbo_tasks::function]
    async fn all_assets_map(&self) -> Result<Vc<OutputAssetsMap>> {
        Ok(Vc::cell(
            expand(
                &*self.root_assets.await?,
                &*self.root_path.await?,
                self.expanded.as_ref(),
            )
            .await?,
        ))
    }
}

async fn expand(
    root_assets: &FxIndexSet<ResolvedVc<Box<dyn OutputAsset>>>,
    root_path: &FileSystemPath,
    expanded: Option<&ExpandedState>,
) -> Result<FxIndexMap<RcStr, ResolvedVc<Box<dyn OutputAsset>>>> {
    let mut map = FxIndexMap::default();
    let mut assets = Vec::new();
    let mut queue = VecDeque::with_capacity(32);
    let mut assets_set = FxHashSet::default();
    let root_assets_with_path = root_assets
        .iter()
        .map(|&asset| async move {
            let path = asset.path().await?;
            Ok((path, asset))
        })
        .try_join()
        .await?;

    if let Some(expanded) = &expanded {
        let expanded = expanded.get();
        for (path, root_asset) in root_assets_with_path.into_iter() {
            if let Some(sub_path) = root_path.get_path_to(&path) {
                let (sub_paths_buffer, sub_paths) = get_sub_paths(sub_path);
                let expanded = sub_paths_buffer
                    .iter()
                    .take(sub_paths)
                    .any(|sub_path| expanded.contains(sub_path));
                for sub_path in sub_paths_buffer.into_iter().take(sub_paths) {
                    assets.push((sub_path, root_asset));
                }
                assets_set.insert(root_asset);
                if expanded {
                    queue.push_back(root_asset.references());
                }
            }
        }
    } else {
        for (path, root_asset) in root_assets_with_path.into_iter() {
            if let Some(sub_path) = root_path.get_path_to(&path) {
                let (sub_paths_buffer, sub_paths) = get_sub_paths(sub_path);
                for sub_path in sub_paths_buffer.into_iter().take(sub_paths) {
                    assets.push((sub_path, root_asset));
                }
                queue.push_back(root_asset.references());
                assets_set.insert(root_asset);
            }
        }
    }

    while let Some(references) = queue.pop_front() {
        for asset in references.await?.iter() {
            if assets_set.insert(*asset) {
                let path = asset.path().await?;
                if let Some(sub_path) = root_path.get_path_to(&path) {
                    let (sub_paths_buffer, sub_paths) = get_sub_paths(sub_path);
                    let expanded = if let Some(expanded) = &expanded {
                        let expanded = expanded.get();
                        sub_paths_buffer
                            .iter()
                            .take(sub_paths)
                            .any(|sub_path| expanded.contains(sub_path))
                    } else {
                        true
                    };
                    if expanded {
                        queue.push_back(asset.references());
                    }
                    for sub_path in sub_paths_buffer.into_iter().take(sub_paths) {
                        assets.push((sub_path, *asset));
                    }
                }
            }
        }
    }
    for (sub_path, asset) in assets {
        if &*sub_path == "index.html" {
            map.insert("".into(), asset);
        } else if let Some(p) = sub_path.strip_suffix("/index.html") {
            map.insert(p.into(), asset);
            map.insert(format!("{p}/").into(), asset);
        } else if let Some(p) = sub_path.strip_suffix(".html") {
            map.insert(p.into(), asset);
        }
        map.insert(sub_path, asset);
    }
    Ok(map)
}

fn get_sub_paths(sub_path: &str) -> ([RcStr; 3], usize) {
    let sub_paths_buffer: [RcStr; 3];
    let n = if sub_path == "index.html" {
        sub_paths_buffer = ["".into(), sub_path.into(), Default::default()];
        2
    } else if let Some(p) = sub_path.strip_suffix("/index.html") {
        sub_paths_buffer = [p.into(), format!("{p}/").into(), sub_path.into()];
        3
    } else if let Some(p) = sub_path.strip_suffix(".html") {
        sub_paths_buffer = [p.into(), sub_path.into(), Default::default()];
        2
    } else {
        sub_paths_buffer = [sub_path.into(), Default::default(), Default::default()];
        1
    };
    (sub_paths_buffer, n)
}

#[turbo_tasks::function(operation)]
fn all_assets_map_operation(source: ResolvedVc<AssetGraphContentSource>) -> Vc<OutputAssetsMap> {
    source.all_assets_map()
}

#[turbo_tasks::value_impl]
impl ContentSource for AssetGraphContentSource {
    #[turbo_tasks::function]
    async fn get_routes(self: ResolvedVc<Self>) -> Result<Vc<RouteTree>> {
        let assets = all_assets_map_operation(self)
            .read_strongly_consistent()
            .await?;
        let mut paths = Vec::new();
        let routes = assets
            .iter()
            .map(|(path, asset)| {
                paths.push(path.as_str());
                RouteTree::new_route(
                    BaseSegment::from_static_pathname(path).collect(),
                    RouteType::Exact,
                    Vc::upcast(AssetGraphGetContentSourceContent::new(
                        *self,
                        path.clone(),
                        **asset,
                    )),
                )
            })
            .map(|v| async move { v.to_resolved().await })
            .try_join()
            .await?;
        Ok(Vc::<RouteTrees>::cell(routes).merge())
    }
}

#[turbo_tasks::value]
struct AssetGraphGetContentSourceContent {
    source: ResolvedVc<AssetGraphContentSource>,
    path: RcStr,
    asset: ResolvedVc<Box<dyn OutputAsset>>,
}

#[turbo_tasks::value_impl]
impl AssetGraphGetContentSourceContent {
    #[turbo_tasks::function]
    pub fn new(
        source: ResolvedVc<AssetGraphContentSource>,
        path: RcStr,
        asset: ResolvedVc<Box<dyn OutputAsset>>,
    ) -> Vc<Self> {
        Self::cell(AssetGraphGetContentSourceContent {
            source,
            path,
            asset,
        })
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for AssetGraphGetContentSourceContent {
    #[turbo_tasks::function]
    async fn get(
        self: ResolvedVc<Self>,
        _path: RcStr,
        _data: Value<ContentSourceData>,
    ) -> Result<Vc<ContentSourceContent>> {
        let this = self.await?;
        turbo_tasks::emit(ResolvedVc::upcast::<Box<dyn ContentSourceSideEffect>>(self));
        Ok(ContentSourceContent::static_content(
            this.asset.versioned_content(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ContentSourceSideEffect for AssetGraphGetContentSourceContent {
    #[turbo_tasks::function]
    async fn apply(&self) -> Result<Vc<Completion>> {
        let source = self.source.await?;

        if let Some(expanded) = &source.expanded {
            expanded.update_conditionally(|expanded| expanded.insert(self.path.clone()));
        }
        Ok(Completion::new())
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<RcStr> {
    Vc::cell("asset graph content source".into())
}

#[turbo_tasks::value_impl]
impl Introspectable for AssetGraphContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<RcStr> {
        self.root_path.to_string()
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<RcStr> {
        Vc::cell(if let Some(expanded) = &self.expanded {
            format!("{} assets expanded", expanded.get().len()).into()
        } else {
            "eager".into()
        })
    }

    #[turbo_tasks::function]
    async fn children(self: Vc<Self>) -> Result<Vc<IntrospectableChildren>> {
        let this = self.await?;
        let key = ResolvedVc::cell("root".into());
        let inner_key = ResolvedVc::cell("inner".into());
        let expanded_key = ResolvedVc::cell("expanded".into());

        let root_assets = this.root_assets.await?;
        let root_asset_children = root_assets
            .iter()
            .map(|&asset| async move {
                Ok((
                    key,
                    IntrospectableOutputAsset::new(*ResolvedVc::upcast(asset))
                        .to_resolved()
                        .await?,
                ))
            })
            .try_join()
            .await?;

        let expanded_assets = self.all_assets_map().await?;
        let expanded_asset_children = expanded_assets
            .values()
            .filter(|&a| !root_assets.contains(a))
            .map(|&asset| async move {
                Ok((
                    inner_key,
                    IntrospectableOutputAsset::new(*ResolvedVc::upcast(asset))
                        .to_resolved()
                        .await?,
                ))
            })
            .try_join()
            .await?;

        Ok(Vc::cell(
            root_asset_children
                .into_iter()
                .chain(expanded_asset_children)
                .chain(once((
                    expanded_key,
                    ResolvedVc::upcast(FullyExpanded(self.to_resolved().await?).resolved_cell()),
                )))
                .collect(),
        ))
    }
}

#[turbo_tasks::function]
fn fully_expanded_introspectable_type() -> Vc<RcStr> {
    Vc::cell("fully expanded asset graph content source".into())
}

#[turbo_tasks::value]
struct FullyExpanded(ResolvedVc<AssetGraphContentSource>);

#[turbo_tasks::value_impl]
impl Introspectable for FullyExpanded {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        fully_expanded_introspectable_type()
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<RcStr>> {
        Ok(self.0.await?.root_path.to_string())
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let source = self.0.await?;
        let key = ResolvedVc::cell("asset".into());

        let expanded_assets =
            expand(&*source.root_assets.await?, &*source.root_path.await?, None).await?;
        let children = expanded_assets
            .iter()
            .map(|(_k, &v)| async move {
                Ok((key, IntrospectableOutputAsset::new(*v).to_resolved().await?))
            })
            .try_join()
            .await?
            .into_iter()
            .collect();

        Ok(Vc::cell(children))
    }
}
