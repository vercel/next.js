use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{Arc, Mutex},
};

use anyhow::Result;
use turbo_tasks::{get_invalidator, Invalidator, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{asset::AssetVc, reference::all_referenced_assets};

use super::{ContentSource, ContentSourceResult, ContentSourceResultVc, ContentSourceVc};

struct State {
    expanded: HashSet<AssetVc>,
    invalidator: Option<Invalidator>,
}

#[turbo_tasks::value(transparent)]
struct AssetsMap(HashMap<String, AssetVc>);

#[turbo_tasks::value(serialization = "none", eq = "manual", cell = "new")]
pub struct AssetGraphContentSource {
    root_path: FileSystemPathVc,
    root_asset: AssetVc,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    state: Option<Arc<Mutex<State>>>,
}

#[turbo_tasks::value_impl]
impl AssetGraphContentSourceVc {
    #[turbo_tasks::function]
    pub fn new_eager(root_path: FileSystemPathVc, root_asset: AssetVc) -> Self {
        Self::cell(AssetGraphContentSource {
            root_path,
            root_asset,
            state: None,
        })
    }

    #[turbo_tasks::function]
    pub fn new_lazy(root_path: FileSystemPathVc, root_asset: AssetVc) -> Self {
        Self::cell(AssetGraphContentSource {
            root_path,
            root_asset,
            state: Some(Arc::new(Mutex::new(State {
                expanded: HashSet::new(),
                invalidator: None,
            }))),
        })
    }

    #[turbo_tasks::function]
    async fn all_assets_map(self) -> Result<AssetsMapVc> {
        let this = self.await?;
        if let Some(state) = &this.state {
            let mut state = state.lock().unwrap();
            state.invalidator = Some(get_invalidator());
        }
        let mut map = HashMap::new();
        let root_path = this.root_path.await?;
        let mut assets = Vec::new();
        assets.push((this.root_asset.path(), this.root_asset));
        let expanded = if let Some(state) = &this.state {
            let state = state.lock().unwrap();
            state.expanded.contains(&this.root_asset)
        } else {
            true
        };
        if expanded {
            let mut queue = VecDeque::new();
            queue.push_back(all_referenced_assets(this.root_asset));
            let mut assets_set = HashSet::new();
            assets_set.insert(this.root_asset);
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
    async fn get(self_vc: AssetGraphContentSourceVc, path: &str) -> Result<ContentSourceResultVc> {
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

    #[turbo_tasks::function]
    async fn get_by_id(
        self_vc: AssetGraphContentSourceVc,
        id: &str,
    ) -> Result<ContentSourceResultVc> {
        let root_path_str = self_vc.await?.root_path.to_string().await?;
        if id.starts_with(&*root_path_str) {
            let path = &id[root_path_str.len()..];
            Ok(self_vc.get(path))
        } else {
            Ok(ContentSourceResult::NotFound.cell())
        }
    }
}
