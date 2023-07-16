use std::{
    collections::{HashMap, HashSet, VecDeque},
    iter::once,
};

use anyhow::Result;
use indexmap::{indexset, IndexSet};
use turbo_tasks::{Completion, State, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetsSet},
    introspect::{asset::IntrospectableAsset, Introspectable, IntrospectableChildren},
    reference::all_referenced_assets,
};

use super::{
    route_tree::{BaseSegment, RouteTree, RouteTrees, RouteType},
    ContentSource, ContentSourceContent, ContentSourceData, ContentSourceSideEffect,
    GetContentSourceContent,
};

#[turbo_tasks::value(transparent)]
struct AssetsMap(HashMap<String, Vc<Box<dyn Asset>>>);

type ExpandedState = State<HashSet<Vc<Box<dyn Asset>>>>;

#[turbo_tasks::value(serialization = "none", eq = "manual", cell = "new")]
pub struct AssetGraphContentSource {
    root_path: Vc<FileSystemPath>,
    root_assets: Vc<AssetsSet>,
    expanded: Option<ExpandedState>,
}

#[turbo_tasks::value_impl]
impl AssetGraphContentSource {
    /// Serves all assets references by root_asset.
    #[turbo_tasks::function]
    pub fn new_eager(root_path: Vc<FileSystemPath>, root_asset: Vc<Box<dyn Asset>>) -> Vc<Self> {
        Self::cell(AssetGraphContentSource {
            root_path,
            root_assets: Vc::cell(indexset! { root_asset }),
            expanded: None,
        })
    }

    /// Serves all assets references by root_asset. Only serve references of an
    /// asset when it has served its content before.
    #[turbo_tasks::function]
    pub fn new_lazy(root_path: Vc<FileSystemPath>, root_asset: Vc<Box<dyn Asset>>) -> Vc<Self> {
        Self::cell(AssetGraphContentSource {
            root_path,
            root_assets: Vc::cell(indexset! { root_asset }),
            expanded: Some(State::new(HashSet::new())),
        })
    }

    /// Serves all assets references by all root_assets.
    #[turbo_tasks::function]
    pub fn new_eager_multiple(
        root_path: Vc<FileSystemPath>,
        root_assets: Vc<AssetsSet>,
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
        root_path: Vc<FileSystemPath>,
        root_assets: Vc<AssetsSet>,
    ) -> Vc<Self> {
        Self::cell(AssetGraphContentSource {
            root_path,
            root_assets,
            expanded: Some(State::new(HashSet::new())),
        })
    }

    #[turbo_tasks::function]
    async fn all_assets_map(self: Vc<Self>) -> Result<Vc<AssetsMap>> {
        let this = self.await?;
        Ok(Vc::cell(
            expand(
                &*this.root_assets.await?,
                &*this.root_path.await?,
                this.expanded.as_ref(),
            )
            .await?,
        ))
    }
}

async fn expand(
    root_assets: &IndexSet<Vc<Box<dyn Asset>>>,
    root_path: &FileSystemPath,
    expanded: Option<&ExpandedState>,
) -> Result<HashMap<String, Vc<Box<dyn Asset>>>> {
    let mut map = HashMap::new();
    let mut assets = Vec::new();
    let mut queue = VecDeque::with_capacity(32);
    let mut assets_set = HashSet::new();
    if let Some(expanded) = &expanded {
        let expanded = expanded.get();
        for root_asset in root_assets.iter() {
            let expanded = expanded.contains(root_asset);
            assets.push((root_asset.ident().path(), *root_asset));
            assets_set.insert(*root_asset);
            if expanded {
                queue.push_back(all_referenced_assets(*root_asset));
            }
        }
    } else {
        for root_asset in root_assets.iter() {
            assets.push((root_asset.ident().path(), *root_asset));
            assets_set.insert(*root_asset);
            queue.push_back(all_referenced_assets(*root_asset));
        }
    }

    while let Some(references) = queue.pop_front() {
        for asset in references.await?.iter() {
            if assets_set.insert(*asset) {
                let expanded = if let Some(expanded) = &expanded {
                    // We lookup the unresolved asset in the expanded set.
                    // We could resolve the asset here, but that would require waiting on the
                    // computation here and it doesn't seem to be neccessary in this case. We just
                    // have to be sure that we consistently use the unresolved asset.
                    expanded.get().contains(asset)
                } else {
                    true
                };
                if expanded {
                    queue.push_back(all_referenced_assets(*asset));
                }
                assets.push((asset.ident().path(), *asset));
            }
        }
    }
    for (p_vc, asset) in assets {
        // For clippy -- This explicit deref is necessary
        let p = &*p_vc.await?;
        if let Some(sub_path) = root_path.get_path_to(p) {
            map.insert(sub_path.to_string(), asset);
            if sub_path == "index.html" {
                map.insert("".to_string(), asset);
            } else if let Some(p) = sub_path.strip_suffix("/index.html") {
                map.insert(p.to_string(), asset);
                map.insert(format!("{p}/"), asset);
            } else if let Some(p) = sub_path.strip_suffix(".html") {
                map.insert(p.to_string(), asset);
            }
        }
    }
    Ok(map)
}

/// A unresolve asset. We need to have a unresolve Asset here as we need to
/// lookup the Vc identity in the expanded set.
///
/// This must not be a TaskInput since this would resolve the embedded asset.
#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Hash, PartialOrd, Ord, Debug, Clone)]
struct UnresolvedAsset(Vc<Box<dyn Asset>>);

#[turbo_tasks::value_impl]
impl ContentSource for AssetGraphContentSource {
    #[turbo_tasks::function]
    async fn get_routes(self: Vc<Self>) -> Result<Vc<RouteTree>> {
        let assets = self.all_assets_map().strongly_consistent().await?;
        let routes = assets
            .iter()
            .map(|(path, asset)| {
                RouteTree::new_route(
                    BaseSegment::from_static_pathname(path).collect(),
                    RouteType::Exact,
                    Vc::upcast(AssetGraphGetContentSourceContent::new(
                        self, /* Passing the asset to a function would normally resolve that
                               * asset. But */
                        // in this special case we want to avoid that and just pass the unresolved
                        // asset. So to enforce that we need to wrap it in this special value.
                        // Technically it would be preferable to have some kind of `#[unresolved]`
                        // attribute on function arguments, but we don't have that yet.
                        Value::new(UnresolvedAsset(*asset)),
                    )),
                )
            })
            .collect();
        Ok(Vc::<RouteTrees>::cell(routes).merge())
    }
}

#[turbo_tasks::value]
struct AssetGraphGetContentSourceContent {
    source: Vc<AssetGraphContentSource>,
    /// The unresolved asset.
    asset: Vc<Box<dyn Asset>>,
}

#[turbo_tasks::value_impl]
impl AssetGraphGetContentSourceContent {
    #[turbo_tasks::function]
    pub fn new(source: Vc<AssetGraphContentSource>, asset: Value<UnresolvedAsset>) -> Vc<Self> {
        Self::cell(AssetGraphGetContentSourceContent {
            source,
            asset: asset.into_value().0,
        })
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for AssetGraphGetContentSourceContent {
    #[turbo_tasks::function]
    async fn get(
        self: Vc<Self>,
        _path: String,
        _data: Value<ContentSourceData>,
    ) -> Result<Vc<ContentSourceContent>> {
        let this = self.await?;
        turbo_tasks::emit(Vc::upcast::<Box<dyn ContentSourceSideEffect>>(self));
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
            let asset = self.asset;
            expanded.update_conditionally(|expanded| {
                // Insert the unresolved asset into the set
                expanded.insert(asset)
            });
        }
        Ok(Completion::new())
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<String> {
    Vc::cell("asset graph content source".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for AssetGraphContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<String> {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<String> {
        self.root_path.to_string()
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<String> {
        Vc::cell(if let Some(expanded) = &self.expanded {
            format!("{} assets expanded", expanded.get().len())
        } else {
            "eager".to_string()
        })
    }

    #[turbo_tasks::function]
    async fn children(self: Vc<Self>) -> Result<Vc<IntrospectableChildren>> {
        let this = self.await?;
        let key = Vc::cell("root".to_string());
        let inner_key = Vc::cell("inner".to_string());
        let expanded_key = Vc::cell("expanded".to_string());

        let root_assets = this.root_assets.await?;
        let root_asset_children = root_assets
            .iter()
            .map(|&asset| (key, IntrospectableAsset::new(asset)));

        let expanded_assets = self.all_assets_map().await?;
        let expanded_asset_children = expanded_assets
            .values()
            .filter(|a| !root_assets.contains(*a))
            .map(|asset| (inner_key, IntrospectableAsset::new(*asset)));

        Ok(Vc::cell(
            root_asset_children
                .chain(expanded_asset_children)
                .chain(once((expanded_key, Vc::upcast(FullyExpaned(self).cell()))))
                .collect(),
        ))
    }
}

#[turbo_tasks::function]
fn fully_expaned_introspectable_type() -> Vc<String> {
    Vc::cell("fully expanded asset graph content source".to_string())
}

#[turbo_tasks::value]
struct FullyExpaned(Vc<AssetGraphContentSource>);

#[turbo_tasks::value_impl]
impl Introspectable for FullyExpaned {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<String> {
        fully_expaned_introspectable_type()
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<String>> {
        Ok(self.0.await?.root_path.to_string())
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let source = self.0.await?;
        let key = Vc::cell("asset".to_string());

        let expanded_assets =
            expand(&*source.root_assets.await?, &*source.root_path.await?, None).await?;
        let children = expanded_assets
            .iter()
            .map(|(_k, &v)| (key, IntrospectableAsset::new(v)))
            .collect();

        Ok(Vc::cell(children))
    }
}
