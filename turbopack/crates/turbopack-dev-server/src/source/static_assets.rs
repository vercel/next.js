use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Value, Vc};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemPath};
use turbopack_core::{
    asset::Asset,
    file_source::FileSource,
    introspect::{source::IntrospectableSource, Introspectable, IntrospectableChildren},
    version::VersionedContentExt,
};

use super::{
    route_tree::{BaseSegment, RouteTree, RouteTrees, RouteType},
    ContentSource, ContentSourceContent, ContentSourceData, GetContentSourceContent,
};

#[turbo_tasks::value(shared)]
pub struct StaticAssetsContentSource {
    pub prefix: ResolvedVc<RcStr>,
    pub dir: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl StaticAssetsContentSource {
    // TODO(WEB-1151): Remove this method and migrate users to `with_prefix`.
    #[turbo_tasks::function]
    pub fn new(prefix: RcStr, dir: Vc<FileSystemPath>) -> Vc<StaticAssetsContentSource> {
        StaticAssetsContentSource::with_prefix(Vc::cell(prefix), dir)
    }

    #[turbo_tasks::function]
    pub async fn with_prefix(
        prefix: ResolvedVc<RcStr>,
        dir: ResolvedVc<FileSystemPath>,
    ) -> Result<Vc<StaticAssetsContentSource>> {
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
async fn get_routes_from_directory(dir: Vc<FileSystemPath>) -> Result<Vc<RouteTree>> {
    let dir = dir.read_dir().await?;
    let DirectoryContent::Entries(entries) = &*dir else {
        return Ok(RouteTree::empty());
    };

    let routes = entries
        .iter()
        .flat_map(|(name, entry)| match entry {
            DirectoryEntry::File(path) | DirectoryEntry::Symlink(path) => {
                Some(RouteTree::new_route(
                    vec![BaseSegment::Static(name.clone())],
                    RouteType::Exact,
                    Vc::upcast(StaticAssetsContentSourceItem::new(**path)),
                ))
            }
            DirectoryEntry::Directory(path) => Some(
                get_routes_from_directory(**path)
                    .with_prepended_base(vec![BaseSegment::Static(name.clone())]),
            ),
            _ => None,
        })
        .map(|v| async move { v.to_resolved().await })
        .try_join()
        .await?;
    Ok(Vc::<RouteTrees>::cell(routes).merge())
}

#[turbo_tasks::value_impl]
impl ContentSource for StaticAssetsContentSource {
    #[turbo_tasks::function]
    async fn get_routes(&self) -> Result<Vc<RouteTree>> {
        let prefix = self.prefix.await?;
        let prefix = BaseSegment::from_static_pathname(prefix.as_str()).collect::<Vec<_>>();
        Ok(get_routes_from_directory(*self.dir).with_prepended_base(prefix))
    }
}

#[turbo_tasks::value]
struct StaticAssetsContentSourceItem {
    path: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl StaticAssetsContentSourceItem {
    #[turbo_tasks::function]
    pub fn new(path: ResolvedVc<FileSystemPath>) -> Vc<StaticAssetsContentSourceItem> {
        StaticAssetsContentSourceItem { path }.cell()
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for StaticAssetsContentSourceItem {
    #[turbo_tasks::function]
    fn get(&self, _path: RcStr, _data: Value<ContentSourceData>) -> Vc<ContentSourceContent> {
        let content = Vc::upcast::<Box<dyn Asset>>(FileSource::new(*self.path)).content();
        ContentSourceContent::static_content(content.versioned())
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for StaticAssetsContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell("static assets directory content source".into())
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let dir = self.dir.read_dir().await?;
        let DirectoryContent::Entries(entries) = &*dir else {
            return Ok(Vc::cell(Default::default()));
        };

        let prefix = self.prefix.await?;
        let children = entries
            .iter()
            .map(move |(name, entry)| {
                let prefix = prefix.clone();
                async move {
                    let child = match entry {
                        DirectoryEntry::File(path) | DirectoryEntry::Symlink(path) => {
                            ResolvedVc::upcast(
                                IntrospectableSource::new(Vc::upcast(FileSource::new(**path)))
                                    .to_resolved()
                                    .await?,
                            )
                        }
                        DirectoryEntry::Directory(path) => ResolvedVc::upcast(
                            StaticAssetsContentSource::with_prefix(
                                Vc::cell(format!("{}{name}/", &*prefix).into()),
                                **path,
                            )
                            .to_resolved()
                            .await?,
                        ),
                        DirectoryEntry::Other(_) => todo!("what's DirectoryContent::Other?"),
                        DirectoryEntry::Error => todo!(),
                    };
                    Ok((ResolvedVc::cell(name.clone()), child))
                }
            })
            .try_join()
            .await?
            .into_iter()
            .collect();
        Ok(Vc::cell(children))
    }
}
