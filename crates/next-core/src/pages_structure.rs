use anyhow::Result;
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPath, FileSystemPathOption,
};

use crate::next_import_map::get_next_package;

/// A final route in the pages directory.
#[turbo_tasks::value]
pub struct PagesStructureItem {
    pub base_path: ResolvedVc<FileSystemPath>,
    pub extensions: ResolvedVc<Vec<RcStr>>,
    pub fallback_path: Option<ResolvedVc<FileSystemPath>>,

    /// Pathname of this item in the Next.js router.
    pub next_router_path: ResolvedVc<FileSystemPath>,
    /// Unique path corresponding to this item. This differs from
    /// `next_router_path` in that it will include the trailing /index for index
    /// routes, which allows for differentiating with potential /index
    /// directories.
    pub original_path: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl PagesStructureItem {
    #[turbo_tasks::function]
    fn new(
        base_path: ResolvedVc<FileSystemPath>,
        extensions: ResolvedVc<Vec<RcStr>>,
        fallback_path: Option<ResolvedVc<FileSystemPath>>,
        next_router_path: ResolvedVc<FileSystemPath>,
        original_path: ResolvedVc<FileSystemPath>,
    ) -> Vc<Self> {
        PagesStructureItem {
            base_path,
            extensions,
            fallback_path,
            next_router_path,
            original_path,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn project_path(&self) -> Result<Vc<FileSystemPath>> {
        for ext in self.extensions.await?.into_iter() {
            let project_path = self.base_path.append(format!(".{ext}").into());
            let ty = *project_path.get_type().await?;
            if matches!(ty, FileSystemEntryType::File | FileSystemEntryType::Symlink) {
                return Ok(project_path);
            }
        }
        if let Some(fallback_path) = self.fallback_path {
            Ok(*fallback_path)
        } else {
            Ok(*self.base_path)
        }
    }
}

/// A (sub)directory in the pages directory with all analyzed routes and
/// folders.
#[turbo_tasks::value]
pub struct PagesStructure {
    pub app: ResolvedVc<PagesStructureItem>,
    pub document: ResolvedVc<PagesStructureItem>,
    pub error: ResolvedVc<PagesStructureItem>,
    pub api: Option<ResolvedVc<PagesDirectoryStructure>>,
    pub pages: Option<ResolvedVc<PagesDirectoryStructure>>,
}

#[turbo_tasks::value_impl]
impl PagesStructure {
    #[turbo_tasks::function]
    pub fn app(&self) -> Vc<PagesStructureItem> {
        *self.app
    }

    #[turbo_tasks::function]
    pub fn document(&self) -> Vc<PagesStructureItem> {
        *self.document
    }

    #[turbo_tasks::function]
    pub fn error(&self) -> Vc<PagesStructureItem> {
        *self.error
    }
}

#[turbo_tasks::value]
pub struct PagesDirectoryStructure {
    pub project_path: ResolvedVc<FileSystemPath>,
    pub next_router_path: ResolvedVc<FileSystemPath>,
    pub items: Vec<ResolvedVc<PagesStructureItem>>,
    pub children: Vec<ResolvedVc<PagesDirectoryStructure>>,
}

#[turbo_tasks::value_impl]
impl PagesDirectoryStructure {
    /// Returns the path to the directory of this structure in the project file
    /// system.
    #[turbo_tasks::function]
    pub fn project_path(&self) -> Vc<FileSystemPath> {
        *self.project_path
    }
}

/// Finds and returns the [PagesStructure] of the pages directory if existing.
#[turbo_tasks::function]
pub async fn find_pages_structure(
    project_root: Vc<FileSystemPath>,
    next_router_root: Vc<FileSystemPath>,
    page_extensions: Vc<Vec<RcStr>>,
) -> Result<Vc<PagesStructure>> {
    let pages_root = project_root
        .join("pages".into())
        .realpath()
        .to_resolved()
        .await?;
    let pages_root = if *pages_root.get_type().await? == FileSystemEntryType::Directory {
        Some(pages_root)
    } else {
        let src_pages_root = project_root
            .join("src/pages".into())
            .realpath()
            .to_resolved()
            .await?;
        if *src_pages_root.get_type().await? == FileSystemEntryType::Directory {
            Some(src_pages_root)
        } else {
            // If neither pages nor src/pages exists, we still want to generate
            // the pages structure, but with no pages and default values for
            // _app, _document and _error.
            None
        }
    };

    Ok(get_pages_structure_for_root_directory(
        project_root,
        Vc::cell(pages_root),
        next_router_root,
        page_extensions,
    ))
}

/// Handles the root pages directory.
#[turbo_tasks::function]
async fn get_pages_structure_for_root_directory(
    project_root: Vc<FileSystemPath>,
    project_path: Vc<FileSystemPathOption>,
    next_router_path: Vc<FileSystemPath>,
    page_extensions: Vc<Vec<RcStr>>,
) -> Result<Vc<PagesStructure>> {
    let page_extensions_raw = &*page_extensions.await?;

    let mut api_directory = None;

    let project_path = project_path.await?;
    let pages_directory = if let Some(project_path) = &*project_path {
        let mut children = vec![];
        let mut items = vec![];

        let dir_content = project_path.read_dir().await?;
        if let DirectoryContent::Entries(entries) = &*dir_content {
            for (name, entry) in entries.iter() {
                let entry = entry.resolve_symlink().await?;
                match entry {
                    DirectoryEntry::File(_) => {
                        // Do not process .d.ts files as routes
                        if name.ends_with(".d.ts") {
                            continue;
                        }
                        let Some(basename) = page_basename(name, page_extensions_raw) else {
                            continue;
                        };
                        let base_path = project_path.join(basename.into());
                        match basename {
                            "_app" | "_document" | "_error" => {}
                            basename => {
                                let item_next_router_path =
                                    next_router_path_for_basename(next_router_path, basename);
                                let item_original_path = next_router_path.join(basename.into());
                                items.push((
                                    basename,
                                    PagesStructureItem::new(
                                        base_path,
                                        page_extensions,
                                        None,
                                        item_next_router_path,
                                        item_original_path,
                                    ),
                                ));
                            }
                        }
                    }
                    DirectoryEntry::Directory(dir_project_path) => match name.as_str() {
                        "api" => {
                            api_directory = Some(
                                get_pages_structure_for_directory(
                                    *dir_project_path,
                                    next_router_path.join(name.clone()),
                                    1,
                                    page_extensions,
                                )
                                .to_resolved()
                                .await?,
                            );
                        }
                        _ => {
                            children.push((
                                name,
                                get_pages_structure_for_directory(
                                    *dir_project_path,
                                    next_router_path.join(name.clone()),
                                    1,
                                    page_extensions,
                                ),
                            ));
                        }
                    },
                    _ => {}
                }
            }
        }

        // Ensure deterministic order since read_dir is not deterministic
        items.sort_by_key(|(k, _)| *k);
        children.sort_by_key(|(k, _)| *k);

        Some(
            PagesDirectoryStructure {
                project_path: *project_path,
                next_router_path: next_router_path.to_resolved().await?,
                items: items
                    .into_iter()
                    .map(|(_, v)| async move { v.to_resolved().await })
                    .try_join()
                    .await?,
                children: children
                    .into_iter()
                    .map(|(_, v)| async move { v.to_resolved().await })
                    .try_join()
                    .await?,
            }
            .resolved_cell(),
        )
    } else {
        None
    };

    let pages_path = if let Some(project_path) = *project_path {
        *project_path
    } else {
        project_root.join("pages".into())
    };

    let app_item = {
        let app_router_path = next_router_path.join("_app".into());
        PagesStructureItem::new(
            pages_path.join("_app".into()),
            page_extensions,
            Some(get_next_package(project_root).join("app.js".into())),
            app_router_path,
            app_router_path,
        )
    };

    let document_item = {
        let document_router_path = next_router_path.join("_document".into());
        PagesStructureItem::new(
            pages_path.join("_document".into()),
            page_extensions,
            Some(get_next_package(project_root).join("document.js".into())),
            document_router_path,
            document_router_path,
        )
    };

    let error_item = {
        let error_router_path = next_router_path.join("_error".into());
        PagesStructureItem::new(
            pages_path.join("_error".into()),
            page_extensions,
            Some(get_next_package(project_root).join("error.js".into())),
            error_router_path,
            error_router_path,
        )
    };

    Ok(PagesStructure {
        app: app_item.to_resolved().await?,
        document: document_item.to_resolved().await?,
        error: error_item.to_resolved().await?,
        api: api_directory,
        pages: pages_directory,
    }
    .cell())
}

/// Handles a directory in the pages directory (or the pages directory itself).
/// Calls itself recursively for sub directories.
#[turbo_tasks::function]
async fn get_pages_structure_for_directory(
    project_path: Vc<FileSystemPath>,
    next_router_path: Vc<FileSystemPath>,
    position: u32,
    page_extensions: Vc<Vec<RcStr>>,
) -> Result<Vc<PagesDirectoryStructure>> {
    let span = {
        let path = project_path.to_string().await?.to_string();
        tracing::info_span!("analyse pages structure", name = path)
    };
    async move {
        let page_extensions_raw = &*page_extensions.await?;

        let mut children = vec![];
        let mut items = vec![];
        let dir_content = project_path.read_dir().await?;
        if let DirectoryContent::Entries(entries) = &*dir_content {
            for (name, entry) in entries.iter() {
                match entry {
                    DirectoryEntry::File(_) => {
                        let Some(basename) = page_basename(name, page_extensions_raw) else {
                            continue;
                        };
                        let item_next_router_path = match basename {
                            "index" => next_router_path,
                            _ => next_router_path.join(basename.into()),
                        };
                        let base_path = project_path.join(name.clone());
                        let item_original_name = next_router_path.join(basename.into());
                        items.push((
                            basename,
                            PagesStructureItem::new(
                                base_path,
                                page_extensions,
                                None,
                                item_next_router_path,
                                item_original_name,
                            ),
                        ));
                    }
                    DirectoryEntry::Directory(dir_project_path) => {
                        children.push((
                            name,
                            get_pages_structure_for_directory(
                                **dir_project_path,
                                next_router_path.join(name.clone()),
                                position + 1,
                                page_extensions,
                            ),
                        ));
                    }
                    _ => {}
                }
            }
        }

        // Ensure deterministic order since read_dir is not deterministic
        items.sort_by_key(|(k, _)| *k);

        // Ensure deterministic order since read_dir is not deterministic
        children.sort_by_key(|(k, _)| *k);

        Ok(PagesDirectoryStructure {
            project_path: project_path.to_resolved().await?,
            next_router_path: next_router_path.to_resolved().await?,
            items: items
                .into_iter()
                .map(|(_, v)| v)
                .map(|v| async move { v.to_resolved().await })
                .try_join()
                .await?,
            children: children
                .into_iter()
                .map(|(_, v)| v)
                .map(|v| async move { v.to_resolved().await })
                .try_join()
                .await?,
        }
        .cell())
    }
    .instrument(span)
    .await
}

fn page_basename<'a>(name: &'a str, page_extensions: &'a [RcStr]) -> Option<&'a str> {
    page_extensions
        .iter()
        .find_map(|allowed| name.strip_suffix(&**allowed)?.strip_suffix('.'))
}

fn next_router_path_for_basename(
    next_router_path: Vc<FileSystemPath>,
    basename: &str,
) -> Vc<FileSystemPath> {
    if basename == "index" {
        next_router_path
    } else {
        next_router_path.join(basename.into())
    }
}
