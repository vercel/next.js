use std::{collections::VecDeque, iter::once};

use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_rcstr::{RcStr, rcstr};
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{
    Completion, FxIndexMap, FxIndexSet, ResolvedVc, State, ValueToStringRef, Vc, fxindexset,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::Asset,
    introspect::{Introspectable, IntrospectableChildren, output_asset::IntrospectableOutputAsset},
    output::{OutputAsset, OutputAssetsReference, OutputAssetsSet},
};

use crate::source::{
    ContentSource, ContentSourceContent, ContentSourceData, ContentSourceSideEffect,
    GetContentSourceContent,
    route_tree::{BaseSegment, RouteTree, RouteTrees, RouteType},
};

#[turbo_tasks::value(transparent)]
struct OutputAssetsMap(
    #[bincode(with = "turbo_bincode::indexmap")]
    FxIndexMap<RcStr, ResolvedVc<Box<dyn OutputAsset>>>,
);

type ExpandedState = State<FxHashSet<RcStr>>;

#[turbo_tasks::value(serialization = "skip", eq = "manual", cell = "new")]
pub struct AssetGraphContentSource {
    root_path: FileSystemPath,
    root_assets: ResolvedVc<OutputAssetsSet>,
    expanded: Option<ExpandedState>,
}

#[turbo_tasks::value_impl]
impl AssetGraphContentSource {
    /// Serves all assets references by root_asset.
    #[turbo_tasks::function]
    pub fn new_eager(
        root_path: FileSystemPath,
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
        root_path: FileSystemPath,
        root_asset: ResolvedVc<Box<dyn OutputAsset>>,
    ) -> Vc<Self> {
        Self::cell(AssetGraphContentSource {
            root_path,
            root_assets: ResolvedVc::cell(fxindexset! { root_asset }),
            expanded: Some(State::new(FxHashSet::default())),
        })
    }

    #[turbo_tasks::function]
    async fn all_assets_map(&self) -> Result<Vc<OutputAssetsMap>> {
        Ok(Vc::cell(turbo_tasks::read!(expand(
            &*turbo_tasks::read!(self.root_assets)?,
            &self.root_path,
            self.expanded.as_ref(),
        ))?))
    }
}

turbo_tasks::dual_fn! {
fn expand(
    root_assets: &FxIndexSet<ResolvedVc<Box<dyn OutputAsset>>>,
    root_path: &FileSystemPath,
    expanded: Option<&ExpandedState>,
) -> Result<FxIndexMap<RcStr, ResolvedVc<Box<dyn OutputAsset>>>> {
    let mut map = FxIndexMap::default();
    let mut assets = Vec::new();
    let mut queue: VecDeque<ResolvedVc<Box<dyn OutputAssetsReference>>> =
        VecDeque::with_capacity(32);
    let mut assets_set = FxHashSet::default();
    let mut root_assets_with_path = Vec::with_capacity(root_assets.len());
    for &asset in root_assets.iter() {
        let path = turbo_tasks::read!(asset.path())?;
        root_assets_with_path.push((path, asset));
    }

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
                    queue.push_back(ResolvedVc::upcast(root_asset));
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
                queue.push_back(ResolvedVc::upcast(root_asset));
                assets_set.insert(root_asset);
            }
        }
    }

    while let Some(asset) = queue.pop_front() {
        let refs = turbo_tasks::read!(asset.references())?;
        for &reference in turbo_tasks::read!(refs.references)?.iter() {
            queue.push_back(reference);
        }
        let ref_assets = turbo_tasks::read!(refs
            .assets)
            ?
            .into_iter()
            .chain(turbo_tasks::read!(refs.referenced_assets)?);
        for asset in ref_assets {
            if assets_set.insert(asset) {
                let path = turbo_tasks::read!(asset.path())?;
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
                        queue.push_back(ResolvedVc::upcast(asset));
                    }
                    for sub_path in sub_paths_buffer.into_iter().take(sub_paths) {
                        assets.push((sub_path, asset));
                    }
                }
            }
        }
    }
    for (sub_path, asset) in assets {
        if &*sub_path == "index.html" {
            map.insert(rcstr!(""), asset);
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
}

fn get_sub_paths(sub_path: &str) -> ([RcStr; 3], usize) {
    let sub_paths_buffer: [RcStr; 3];
    let n = if sub_path == "index.html" {
        sub_paths_buffer = [rcstr!(""), sub_path.into(), Default::default()];
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

#[turbo_tasks::function(operation, root)]
fn all_assets_map_operation(source: ResolvedVc<AssetGraphContentSource>) -> Vc<OutputAssetsMap> {
    source.all_assets_map()
}

#[turbo_tasks::value_impl]
impl ContentSource for AssetGraphContentSource {
    #[turbo_tasks::function]
    async fn get_routes(self: ResolvedVc<Self>) -> Result<Vc<RouteTree>> {
        let assets = turbo_tasks::read!(all_assets_map_operation(self).read_strongly_consistent())?;
        let mut paths = Vec::new();
        let route_vcs = assets
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
            .collect::<Vec<_>>();
        // `.to_resolved()` futures cannot fan out through `parallel!` under sync; keep the
        // concurrent `try_join` in the async build and resolve sequentially under sync.
        #[cfg(not(feature = "sync"))]
        let routes = {
            route_vcs
                .into_iter()
                .map(|v| v.to_resolved())
                .try_join()
                .await?
        };
        #[cfg(feature = "sync")]
        let routes = {
            let mut routes = Vec::with_capacity(route_vcs.len());
            for v in route_vcs {
                routes.push(turbo_tasks::read!(v.to_resolved())?);
            }
            routes
        };
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
        _data: ContentSourceData,
    ) -> Result<Vc<ContentSourceContent>> {
        let this = turbo_tasks::read!(self)?;
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
        let source = turbo_tasks::read!(self.source)?;

        if let Some(expanded) = &source.expanded {
            expanded.update_conditionally(|expanded| expanded.insert(self.path.clone()));
        }
        Ok(Completion::new())
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for AssetGraphContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("asset graph content source"))
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(turbo_tasks::read!(
            self.root_path.to_string_ref()
        )?))
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<RcStr> {
        Vc::cell(if let Some(expanded) = &self.expanded {
            format!("{} assets expanded", expanded.get().len()).into()
        } else {
            rcstr!("eager")
        })
    }

    #[turbo_tasks::function]
    async fn children(self: Vc<Self>) -> Result<Vc<IntrospectableChildren>> {
        let this = turbo_tasks::read!(self)?;

        let root_assets = turbo_tasks::read!(this.root_assets)?;
        // `.to_resolved()` futures cannot fan out through `parallel!` under sync; keep the
        // concurrent `try_join` in the async build and resolve sequentially under sync.
        #[cfg(not(feature = "sync"))]
        let root_asset_children = root_assets
            .iter()
            .map(|&asset| async move {
                Ok((
                    rcstr!("root"),
                    turbo_tasks::read!(IntrospectableOutputAsset::new(*asset).to_resolved())?,
                ))
            })
            .try_join()
            .await?;
        #[cfg(feature = "sync")]
        let root_asset_children = {
            let mut children = Vec::with_capacity(root_assets.len());
            for &asset in root_assets.iter() {
                children.push((
                    rcstr!("root"),
                    turbo_tasks::read!(IntrospectableOutputAsset::new(*asset).to_resolved())?,
                ));
            }
            children
        };

        let expanded_assets = turbo_tasks::read!(self.all_assets_map())?;
        #[cfg(not(feature = "sync"))]
        let expanded_asset_children = expanded_assets
            .values()
            .filter(|&a| !root_assets.contains(a))
            .map(|&asset| async move {
                Ok((
                    rcstr!("inner"),
                    turbo_tasks::read!(IntrospectableOutputAsset::new(*asset).to_resolved())?,
                ))
            })
            .try_join()
            .await?;
        #[cfg(feature = "sync")]
        let expanded_asset_children = {
            let mut children = Vec::new();
            for &asset in expanded_assets
                .values()
                .filter(|&a| !root_assets.contains(a))
            {
                children.push((
                    rcstr!("inner"),
                    turbo_tasks::read!(IntrospectableOutputAsset::new(*asset).to_resolved())?,
                ));
            }
            children
        };

        Ok(Vc::cell(
            root_asset_children
                .into_iter()
                .chain(expanded_asset_children)
                .chain(once((
                    rcstr!("expanded"),
                    ResolvedVc::upcast(
                        FullyExpanded(turbo_tasks::read!(self.to_resolved())?).resolved_cell(),
                    ),
                )))
                .collect(),
        ))
    }
}

#[turbo_tasks::value]
struct FullyExpanded(ResolvedVc<AssetGraphContentSource>);

#[turbo_tasks::value_impl]
impl Introspectable for FullyExpanded {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("fully expanded asset graph content source"))
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(turbo_tasks::read!(
            turbo_tasks::read!(self.0)?.root_path.to_string_ref()
        )?))
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let source = turbo_tasks::read!(self.0)?;

        let expanded_assets = turbo_tasks::read!(expand(
            &*turbo_tasks::read!(source.root_assets)?,
            &source.root_path,
            None
        ))?;
        // `.to_resolved()` futures cannot fan out through `parallel!` under sync; keep the
        // concurrent `try_join` in the async build and resolve sequentially under sync.
        #[cfg(not(feature = "sync"))]
        let children = expanded_assets
            .iter()
            .map(|(_k, &v)| async move {
                Ok((
                    rcstr!("asset"),
                    turbo_tasks::read!(IntrospectableOutputAsset::new(*v).to_resolved())?,
                ))
            })
            .try_join()
            .await?
            .into_iter()
            .collect();
        #[cfg(feature = "sync")]
        let children = {
            let mut children = Vec::with_capacity(expanded_assets.len());
            for (_k, &v) in expanded_assets.iter() {
                children.push((
                    rcstr!("asset"),
                    turbo_tasks::read!(IntrospectableOutputAsset::new(*v).to_resolved())?,
                ));
            }
            children.into_iter().collect()
        };

        Ok(Vc::cell(children))
    }
}
