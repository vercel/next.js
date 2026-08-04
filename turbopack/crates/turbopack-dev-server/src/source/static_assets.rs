use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemPath};
use turbopack_core::{
    asset::Asset,
    file_source::FileSource,
    introspect::{Introspectable, IntrospectableChildren, source::IntrospectableSource},
    version::VersionedContentExt,
};

use crate::source::{
    ContentSource, ContentSourceContent, ContentSourceData, GetContentSourceContent,
    route_tree::{BaseSegment, RouteTree, RouteTrees, RouteType},
};

#[turbo_tasks::value(shared)]
pub struct StaticAssetsContentSource {
    pub prefix: ResolvedVc<RcStr>,
    pub dir: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl StaticAssetsContentSource {
    // TODO(WEB-1151): Remove this method and migrate users to `with_prefix`.
    #[turbo_tasks::function]
    pub fn new(prefix: RcStr, dir: FileSystemPath) -> Vc<StaticAssetsContentSource> {
        StaticAssetsContentSource::with_prefix(Vc::cell(prefix), dir)
    }

    #[turbo_tasks::function]
    pub async fn with_prefix(
        prefix: ResolvedVc<RcStr>,
        dir: FileSystemPath,
    ) -> Result<Vc<StaticAssetsContentSource>> {
        if cfg!(debug_assertions) {
            let prefix_string = turbo_tasks::read!(prefix)?;
            debug_assert!(prefix_string.is_empty() || prefix_string.ends_with('/'));
            debug_assert!(!prefix_string.starts_with('/'));
        }
        Ok(StaticAssetsContentSource { prefix, dir }.cell())
    }
}

// TODO(WEB-1251) It would be better to lazily enumerate the directory
#[turbo_tasks::function]
async fn get_routes_from_directory(dir: FileSystemPath) -> Result<Vc<RouteTree>> {
    let dir = turbo_tasks::read!(dir.read_dir())?;
    let DirectoryContent::Entries(entries) = &*dir else {
        return Ok(RouteTree::empty());
    };

    let route_vcs = entries
        .iter()
        .flat_map(|(name, entry)| match entry {
            DirectoryEntry::File(path) | DirectoryEntry::Symlink(path) => {
                Some(RouteTree::new_route(
                    vec![BaseSegment::Static(name.clone())],
                    RouteType::Exact,
                    Vc::upcast(StaticAssetsContentSourceItem::new(path.clone())),
                ))
            }
            DirectoryEntry::Directory(path) => Some(
                get_routes_from_directory(path.clone())
                    .with_prepended_base(vec![BaseSegment::Static(name.clone())]),
            ),
            _ => None,
        })
        .collect::<Vec<_>>();
    // `.to_resolved()` futures cannot fan out through `parallel!` under sync; keep the
    // concurrent `try_join` in the async build and resolve sequentially under sync.
    #[cfg(not(feature = "sync"))]
    let routes = route_vcs
        .into_iter()
        .map(|v| v.to_resolved())
        .try_join()
        .await?;
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

#[turbo_tasks::value_impl]
impl ContentSource for StaticAssetsContentSource {
    #[turbo_tasks::function]
    async fn get_routes(&self) -> Result<Vc<RouteTree>> {
        let prefix = turbo_tasks::read!(self.prefix)?;
        let prefix = BaseSegment::from_static_pathname(prefix.as_str()).collect::<Vec<_>>();
        Ok(get_routes_from_directory(self.dir.clone()).with_prepended_base(prefix))
    }
}

#[turbo_tasks::value]
struct StaticAssetsContentSourceItem {
    path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl StaticAssetsContentSourceItem {
    #[turbo_tasks::function]
    pub fn new(path: FileSystemPath) -> Vc<StaticAssetsContentSourceItem> {
        StaticAssetsContentSourceItem { path }.cell()
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for StaticAssetsContentSourceItem {
    #[turbo_tasks::function]
    fn get(&self, _path: RcStr, _data: ContentSourceData) -> Vc<ContentSourceContent> {
        let content = Vc::upcast::<Box<dyn Asset>>(FileSource::new(self.path.clone())).content();
        ContentSourceContent::static_content(content.versioned())
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for StaticAssetsContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("static assets directory content source"))
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let dir = turbo_tasks::read!(self.dir.read_dir())?;
        let DirectoryContent::Entries(entries) = &*dir else {
            return Ok(Vc::cell(Default::default()));
        };

        let prefix = turbo_tasks::read!(self.prefix)?;
        // The per-entry body resolves child sources; it runs concurrently in the async build
        // and sequentially under sync (the body is more than a single plain `Vc` read).
        #[cfg(not(feature = "sync"))]
        let children: Vec<_> = entries
            .iter()
            .map(move |(name, entry)| {
                let prefix = prefix.clone();
                async move {
                    let child = match entry {
                        DirectoryEntry::File(path) | DirectoryEntry::Symlink(path) => {
                            turbo_tasks::read!(
                                IntrospectableSource::new(Vc::upcast(FileSource::new(
                                    path.clone()
                                )))
                                .to_resolved()
                            )?
                        }
                        DirectoryEntry::Directory(path) => ResolvedVc::upcast(turbo_tasks::read!(
                            StaticAssetsContentSource::with_prefix(
                                Vc::cell(format!("{}{name}/", prefix).into()),
                                path.clone(),
                            )
                            .to_resolved()
                        )?),
                        DirectoryEntry::Other(_) | DirectoryEntry::Error(_) => {
                            todo!("unsupported DirectoryContent variant: {entry:?}")
                        }
                    };
                    Ok((name.clone(), child))
                }
            })
            .try_join()
            .await?
            .into_iter()
            .collect();
        #[cfg(feature = "sync")]
        let children: Vec<_> = {
            let mut children = Vec::with_capacity(entries.len());
            for (name, entry) in entries.iter() {
                let child = match entry {
                    DirectoryEntry::File(path) | DirectoryEntry::Symlink(path) => {
                        turbo_tasks::read!(
                            IntrospectableSource::new(Vc::upcast(FileSource::new(path.clone())))
                                .to_resolved()
                        )?
                    }
                    DirectoryEntry::Directory(path) => ResolvedVc::upcast(turbo_tasks::read!(
                        StaticAssetsContentSource::with_prefix(
                            Vc::cell(format!("{}{name}/", prefix).into()),
                            path.clone(),
                        )
                        .to_resolved()
                    )?),
                    DirectoryEntry::Other(_) | DirectoryEntry::Error(_) => {
                        todo!("unsupported DirectoryContent variant: {entry:?}")
                    }
                };
                children.push((name.clone(), child));
            }
            children
        };
        Ok(Vc::cell(children.into_iter().collect()))
    }
}
