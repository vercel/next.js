use anyhow::Result;
use tracing::Instrument;
use turbo_tasks::{Completion, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPathOption;
use turbopack_binding::turbo::tasks_fs::{
    DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPath,
};

use crate::next_import_map::get_next_package;

/// A final route in the pages directory.
#[turbo_tasks::value]
pub struct PagesStructureItem {
    pub project_path: Vc<FileSystemPath>,
    /// Pathname of this item in the Next.js router.
    pub next_router_path: Vc<FileSystemPath>,
    /// Unique path corresponding to this item. This differs from
    /// `next_router_path` in that it will include the trailing /index for index
    /// routes, which allows for differentiating with potential /index
    /// directories.
    pub original_path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl PagesStructureItem {
    #[turbo_tasks::function]
    async fn new(
        project_path: Vc<FileSystemPath>,
        next_router_path: Vc<FileSystemPath>,
        original_path: Vc<FileSystemPath>,
    ) -> Result<Vc<Self>> {
        Ok(PagesStructureItem {
            project_path,
            next_router_path,
            original_path,
        }
        .cell())
    }

    /// Returns a completion that changes when any route in the whole tree
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        let this = self.await?;
        this.next_router_path.await?;
        Ok(Completion::new())
    }

    #[turbo_tasks::function]
    pub fn project_path(&self) -> Vc<FileSystemPath> {
        self.project_path
    }
}

/// A (sub)directory in the pages directory with all analyzed routes and
/// folders.
#[turbo_tasks::value]
pub struct PagesStructure {
    pub app: Vc<PagesStructureItem>,
    pub document: Vc<PagesStructureItem>,
    pub error: Vc<PagesStructureItem>,
    pub api: Option<Vc<PagesDirectoryStructure>>,
    pub pages: Option<Vc<PagesDirectoryStructure>>,
}

#[turbo_tasks::value_impl]
impl PagesStructure {
    /// Returns a completion that changes when any route in the whole tree
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        let PagesStructure {
            ref app,
            ref document,
            ref error,
            ref api,
            ref pages,
        } = &*self.await?;
        app.routes_changed().await?;
        document.routes_changed().await?;
        error.routes_changed().await?;
        if let Some(api) = api {
            api.routes_changed().await?;
        }
        if let Some(pages) = pages {
            pages.routes_changed().await?;
        }
        Ok(Completion::new())
    }

    #[turbo_tasks::function]
    pub fn app(&self) -> Vc<PagesStructureItem> {
        self.app
    }

    #[turbo_tasks::function]
    pub fn document(&self) -> Vc<PagesStructureItem> {
        self.document
    }

    #[turbo_tasks::function]
    pub fn error(&self) -> Vc<PagesStructureItem> {
        self.error
    }
}

#[turbo_tasks::value]
pub struct PagesDirectoryStructure {
    pub project_path: Vc<FileSystemPath>,
    pub next_router_path: Vc<FileSystemPath>,
    pub items: Vec<Vc<PagesStructureItem>>,
    pub children: Vec<Vc<PagesDirectoryStructure>>,
}

#[turbo_tasks::value_impl]
impl PagesDirectoryStructure {
    /// Returns the router path of this directory.
    #[turbo_tasks::function]
    pub async fn next_router_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(self.await?.next_router_path)
    }

    /// Returns the path to the directory of this structure in the project file
    /// system.
    #[turbo_tasks::function]
    pub async fn project_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(self.await?.project_path)
    }

    /// Returns a completion that changes when any route in the whole tree
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        for item in self.await?.items.iter() {
            item.routes_changed().await?;
        }
        for child in self.await?.children.iter() {
            child.routes_changed().await?;
        }
        Ok(Completion::new())
    }
}

/// Finds and returns the [PagesStructure] of the pages directory if existing.
#[turbo_tasks::function]
pub async fn find_pages_structure(
    project_root: Vc<FileSystemPath>,
    next_router_root: Vc<FileSystemPath>,
    page_extensions: Vc<Vec<String>>,
) -> Result<Vc<PagesStructure>> {
    let pages_root = project_root.join("pages".to_string());
    let pages_root = Vc::<FileSystemPathOption>::cell(
        if *pages_root.get_type().await? == FileSystemEntryType::Directory {
            Some(pages_root)
        } else {
            let src_pages_root = project_root.join("src/pages".to_string());
            if *src_pages_root.get_type().await? == FileSystemEntryType::Directory {
                Some(src_pages_root)
            } else {
                // If neither pages nor src/pages exists, we still want to generate
                // the pages structure, but with no pages and default values for
                // _app, _document and _error.
                None
            }
        },
    )
    .resolve()
    .await?;

    Ok(get_pages_structure_for_root_directory(
        project_root,
        pages_root,
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
    page_extensions: Vc<Vec<String>>,
) -> Result<Vc<PagesStructure>> {
    let page_extensions_raw = &*page_extensions.await?;

    let mut app_item = None;
    let mut document_item = None;
    let mut error_item = None;
    let mut api_directory = None;

    let pages_directory = if let Some(project_path) = &*project_path.await? {
        let mut children = vec![];
        let mut items = vec![];

        let dir_content = project_path.read_dir().await?;
        if let DirectoryContent::Entries(entries) = &*dir_content {
            for (name, entry) in entries.iter() {
                match entry {
                    DirectoryEntry::File(file_project_path) => {
                        let Some(basename) = page_basename(name, page_extensions_raw) else {
                            continue;
                        };
                        match basename {
                            "_app" => {
                                let item_next_router_path =
                                    next_router_path.join("_app".to_string());
                                app_item = Some(PagesStructureItem::new(
                                    *file_project_path,
                                    item_next_router_path,
                                    item_next_router_path,
                                ));
                            }
                            "_document" => {
                                let item_next_router_path =
                                    next_router_path.join("_document".to_string());
                                document_item = Some(PagesStructureItem::new(
                                    *file_project_path,
                                    item_next_router_path,
                                    item_next_router_path,
                                ));
                            }
                            "_error" => {
                                let item_next_router_path =
                                    next_router_path.join("_error".to_string());
                                error_item = Some(PagesStructureItem::new(
                                    *file_project_path,
                                    item_next_router_path,
                                    item_next_router_path,
                                ));
                            }
                            basename => {
                                let item_next_router_path =
                                    next_router_path_for_basename(next_router_path, basename);
                                let item_original_path =
                                    next_router_path.join(basename.to_string());
                                items.push((
                                    basename,
                                    PagesStructureItem::new(
                                        *file_project_path,
                                        item_next_router_path,
                                        item_original_path,
                                    ),
                                ));
                            }
                        }
                    }
                    DirectoryEntry::Directory(dir_project_path) => match name.as_ref() {
                        "api" => {
                            api_directory = Some(get_pages_structure_for_directory(
                                *dir_project_path,
                                next_router_path.join(name.clone()),
                                1,
                                page_extensions,
                            ));
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
                next_router_path,
                items: items.into_iter().map(|(_, v)| v).collect(),
                children: children.into_iter().map(|(_, v)| v).collect(),
            }
            .cell(),
        )
    } else {
        None
    };

    let app_item = if let Some(app_item) = app_item {
        app_item
    } else {
        let app_router_path = next_router_path.join("_app".to_string());
        PagesStructureItem::new(
            get_next_package(project_root).join("app.js".to_string()),
            app_router_path,
            app_router_path,
        )
    };

    let document_item = if let Some(document_item) = document_item {
        document_item
    } else {
        let document_router_path = next_router_path.join("_document".to_string());
        PagesStructureItem::new(
            get_next_package(project_root).join("document.js".to_string()),
            document_router_path,
            document_router_path,
        )
    };

    let error_item = if let Some(error_item) = error_item {
        error_item
    } else {
        let error_router_path = next_router_path.join("_error".to_string());
        PagesStructureItem::new(
            get_next_package(project_root).join("error.js".to_string()),
            error_router_path,
            error_router_path,
        )
    };

    Ok(PagesStructure {
        app: app_item,
        document: document_item,
        error: error_item,
        api: api_directory,
        pages: pages_directory,
    }
    .cell())
}

/// Handles a directory in the pages directory (or the pages directory itself).
/// Calls itself recursively for sub directories or the
/// [create_page_source_for_file] method for files.
#[turbo_tasks::function]
async fn get_pages_structure_for_directory(
    project_path: Vc<FileSystemPath>,
    next_router_path: Vc<FileSystemPath>,
    position: u32,
    page_extensions: Vc<Vec<String>>,
) -> Result<Vc<PagesDirectoryStructure>> {
    let span = {
        let path = project_path.to_string().await?;
        tracing::info_span!("analyse pages structure", name = *path)
    };
    async move {
        let page_extensions_raw = &*page_extensions.await?;

        let mut children = vec![];
        let mut items = vec![];
        let dir_content = project_path.read_dir().await?;
        if let DirectoryContent::Entries(entries) = &*dir_content {
            for (name, entry) in entries.iter() {
                match entry {
                    DirectoryEntry::File(file_project_path) => {
                        let Some(basename) = page_basename(name, page_extensions_raw) else {
                            continue;
                        };
                        let item_next_router_path = match basename {
                            "index" => next_router_path,
                            _ => next_router_path.join(basename.to_string()),
                        };
                        let item_original_name = next_router_path.join(basename.to_string());
                        items.push((
                            basename,
                            PagesStructureItem::new(
                                *file_project_path,
                                item_next_router_path,
                                item_original_name,
                            ),
                        ));
                    }
                    DirectoryEntry::Directory(dir_project_path) => {
                        children.push((
                            name,
                            get_pages_structure_for_directory(
                                *dir_project_path,
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
            project_path,
            next_router_path,
            items: items.into_iter().map(|(_, v)| v).collect(),
            children: children.into_iter().map(|(_, v)| v).collect(),
        }
        .cell())
    }
    .instrument(span)
    .await
}

fn page_basename<'a>(name: &'a str, page_extensions: &'a [String]) -> Option<&'a str> {
    page_extensions
        .iter()
        .find_map(|allowed| name.strip_suffix(allowed)?.strip_suffix('.'))
}

fn next_router_path_for_basename(
    next_router_path: Vc<FileSystemPath>,
    basename: &str,
) -> Vc<FileSystemPath> {
    if basename == "index" {
        next_router_path
    } else {
        next_router_path.join(basename.to_string())
    }
}
