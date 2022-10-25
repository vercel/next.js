use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{Arc, Mutex},
};

use anyhow::Result;
use indexmap::indexset;
use turbo_tasks::{get_invalidator, primitives::StringVc, Invalidator, Value, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{AssetVc, AssetsSetVc},
    introspect::{
        asset::IntrospectableAssetVc, Introspectable, IntrospectableChildrenVc, IntrospectableVc,
    },
    reference::all_referenced_assets,
};

use super::{
    ContentSource, ContentSourceData, ContentSourceResult, ContentSourceResultVc, ContentSourceVc,
};

struct State {
    expanded: HashSet<AssetVc>,
    invalidator: Option<Invalidator>,
}

#[turbo_tasks::value(transparent)]
struct AssetsMap(HashMap<String, AssetVc>);

#[turbo_tasks::value(serialization = "none", eq = "manual", cell = "new")]
pub struct AssetGraphContentSource {
    root_path: FileSystemPathVc,
    root_assets: AssetsSetVc,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    state: Option<Arc<Mutex<State>>>,
}

#[turbo_tasks::value_impl]
impl AssetGraphContentSourceVc {
    /// Serves all assets references by root_asset.
    #[turbo_tasks::function]
    pub fn new_eager(root_path: FileSystemPathVc, root_asset: AssetVc) -> Self {
        Self::cell(AssetGraphContentSource {
            root_path,
            root_assets: AssetsSetVc::cell(indexset! { root_asset }),
            state: None,
        })
    }

    /// Serves all assets references by root_asset. Only serve references of an
    /// asset when it has served its content before.
    #[turbo_tasks::function]
    pub fn new_lazy(root_path: FileSystemPathVc, root_asset: AssetVc) -> Self {
        Self::cell(AssetGraphContentSource {
            root_path,
            root_assets: AssetsSetVc::cell(indexset! { root_asset }),
            state: Some(Arc::new(Mutex::new(State {
                expanded: HashSet::new(),
                invalidator: None,
            }))),
        })
    }

    /// Serves all assets references by all root_assets.
    #[turbo_tasks::function]
    pub fn new_eager_multiple(root_path: FileSystemPathVc, root_assets: AssetsSetVc) -> Self {
        Self::cell(AssetGraphContentSource {
            root_path,
            root_assets,
            state: None,
        })
    }

    /// Serves all assets references by all root_assets. Only serve references
    /// of an asset when it has served its content before.
    #[turbo_tasks::function]
    pub fn new_lazy_multiple(root_path: FileSystemPathVc, root_assets: AssetsSetVc) -> Self {
        Self::cell(AssetGraphContentSource {
            root_path,
            root_assets,
            state: Some(Arc::new(Mutex::new(State {
                expanded: HashSet::new(),
                invalidator: None,
            }))),
        })
    }

    #[turbo_tasks::function]
    async fn all_assets_map(self) -> Result<AssetsMapVc> {
        let this = self.await?;
        let mut map = HashMap::new();
        let root_path = this.root_path.await?;
        let mut assets = Vec::new();
        let mut queue = VecDeque::new();
        let mut assets_set = HashSet::new();
        let root_assets = this.root_assets.await?;
        if let Some(state) = &this.state {
            let mut state = state.lock().unwrap();
            state.invalidator = Some(get_invalidator());
            for root_asset in root_assets.iter() {
                let expanded = state.expanded.contains(root_asset);
                assets.push((root_asset.path(), *root_asset));
                assets_set.insert(*root_asset);
                if expanded {
                    queue.push_back(all_referenced_assets(*root_asset));
                }
            }
        } else {
            for root_asset in root_assets.iter() {
                assets.push((root_asset.path(), *root_asset));
                assets_set.insert(*root_asset);
                queue.push_back(all_referenced_assets(*root_asset));
            }
        }

        while let Some(references) = queue.pop_front() {
            for asset in references.await?.iter() {
                if assets_set.insert(*asset) {
                    let expanded = if let Some(state) = &this.state {
                        let state = state.lock().unwrap();
                        state.expanded.contains(asset)
                    } else {
                        true
                    };
                    if expanded {
                        queue.push_back(all_referenced_assets(*asset));
                    }
                    assets.push((asset.path(), *asset));
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
        Ok(AssetsMapVc::cell(map))
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for AssetGraphContentSource {
    #[turbo_tasks::function]
    async fn get(
        self_vc: AssetGraphContentSourceVc,
        path: &str,
        _data: Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let assets = self_vc.all_assets_map().strongly_consistent().await?;

        if let Some(asset) = assets.get(path) {
            {
                let this = self_vc.await?;
                if let Some(state) = &this.state {
                    let mut state = state.lock().unwrap();
                    if state.expanded.insert(*asset) {
                        if let Some(invalidator) = state.invalidator.take() {
                            invalidator.invalidate();
                        }
                    }
                }
            }
            return Ok(ContentSourceResult::Static(asset.versioned_content()).cell());
        }
        Ok(ContentSourceResult::NotFound.cell())
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> StringVc {
    StringVc::cell("asset graph content source".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for AssetGraphContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        self.root_path.to_string()
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        let key = StringVc::cell("root".to_string());
        Ok(IntrospectableChildrenVc::cell(
            self.root_assets
                .await?
                .iter()
                .map(|&asset| (key, IntrospectableAssetVc::new(asset)))
                .collect(),
        ))
    }
}
