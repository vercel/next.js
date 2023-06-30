use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemPathVc};
use turbopack_core::{
    asset::Asset,
    introspect::{
        asset::IntrospectableAssetVc, Introspectable, IntrospectableChildrenVc, IntrospectableVc,
    },
    source_asset::SourceAssetVc,
};

use super::{
    route_tree::{BaseSegment, RouteTreeVc, RouteTreesVc, RouteType},
    ContentSource, ContentSourceContentVc, ContentSourceData, ContentSourceVc,
    GetContentSourceContent,
};
use crate::source::GetContentSourceContentVc;

#[turbo_tasks::value(shared)]
pub struct StaticAssetsContentSource {
    pub prefix: StringVc,
    pub dir: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl StaticAssetsContentSourceVc {
    // TODO(WEB-1151): Remove this method and migrate users to `with_prefix`.
    #[turbo_tasks::function]
    pub fn new(prefix: String, dir: FileSystemPathVc) -> StaticAssetsContentSourceVc {
        StaticAssetsContentSourceVc::with_prefix(StringVc::cell(prefix), dir)
    }

    #[turbo_tasks::function]
    pub async fn with_prefix(
        prefix: StringVc,
        dir: FileSystemPathVc,
    ) -> Result<StaticAssetsContentSourceVc> {
        if cfg!(debug_assertions) {
            let prefix_string = prefix.await?;
            debug_assert!(prefix_string.is_empty() || prefix_string.ends_with('/'));
            debug_assert!(!prefix_string.starts_with('/'));
        }
        Ok(StaticAssetsContentSource { prefix, dir }.cell())
    }
}

// TODO(WEB-1251) It would be better to lazily enumerate the directory
#[turbo_tasks::function]
async fn get_routes_from_directory(dir: FileSystemPathVc) -> Result<RouteTreeVc> {
    let dir = dir.read_dir().await?;
    let DirectoryContent::Entries(entries) = &*dir else {
        return Ok(RouteTreeVc::empty());
    };

    let routes = entries
        .iter()
        .flat_map(|(name, entry)| match entry {
            DirectoryEntry::File(path) | DirectoryEntry::Symlink(path) => {
                Some(RouteTreeVc::new_route(
                    vec![BaseSegment::Static(name.clone())],
                    RouteType::Exact,
                    StaticAssetsContentSourceItemVc::new(*path).into(),
                ))
            }
            DirectoryEntry::Directory(path) => Some(
                get_routes_from_directory(*path)
                    .with_prepended_base(vec![BaseSegment::Static(name.clone())]),
            ),
            _ => None,
        })
        .collect();
    Ok(RouteTreesVc::cell(routes).merge())
}

#[turbo_tasks::value_impl]
impl ContentSource for StaticAssetsContentSource {
    #[turbo_tasks::function]
    async fn get_routes(&self) -> Result<RouteTreeVc> {
        let prefix = self.prefix.await?;
        let prefix = BaseSegment::from_static_pathname(prefix.as_str()).collect::<Vec<_>>();
        Ok(get_routes_from_directory(self.dir).with_prepended_base(prefix))
    }
}

#[turbo_tasks::value]
struct StaticAssetsContentSourceItem {
    path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl StaticAssetsContentSourceItemVc {
    #[turbo_tasks::function]
    pub fn new(path: FileSystemPathVc) -> StaticAssetsContentSourceItemVc {
        StaticAssetsContentSourceItem { path }.cell()
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for StaticAssetsContentSourceItem {
    #[turbo_tasks::function]
    fn get(&self, _path: &str, _data: Value<ContentSourceData>) -> ContentSourceContentVc {
        let content = SourceAssetVc::new(self.path).as_asset().content();
        ContentSourceContentVc::static_content(content.into())
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for StaticAssetsContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        StringVc::cell("static assets directory content source".to_string())
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        let dir = self.dir.read_dir().await?;
        let DirectoryContent::Entries(entries) = &*dir else {
            return Ok(IntrospectableChildrenVc::cell(Default::default()));
        };

        let prefix = self.prefix.await?;
        let children = entries
            .iter()
            .map(|(name, entry)| {
                let child = match entry {
                    DirectoryEntry::File(path) | DirectoryEntry::Symlink(path) => {
                        IntrospectableAssetVc::new(SourceAssetVc::new(*path).as_asset())
                    }
                    DirectoryEntry::Directory(path) => StaticAssetsContentSourceVc::with_prefix(
                        StringVc::cell(format!("{}{name}/", &*prefix)),
                        *path,
                    )
                    .into(),
                    DirectoryEntry::Other(_) => todo!("what's DirectoryContent::Other?"),
                    DirectoryEntry::Error => todo!(),
                };
                (StringVc::cell(name.clone()), child)
            })
            .collect();
        Ok(IntrospectableChildrenVc::cell(children))
    }
}
