use anyhow::Result;
use turbo_binding::{
    turbo::tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPathVc},
    turbopack::dev_server::source::specificity::SpecificityVc,
};
use turbo_tasks::{
    primitives::{BoolVc, StringsVc},
    CompletionVc,
};

use crate::{embed_js::next_js_file_path, next_config::NextConfigVc};

/// A final route in the pages directory.
#[turbo_tasks::value]
pub struct PagesStructureItem {
    pub project_path: FileSystemPathVc,
    pub next_router_path: FileSystemPathVc,
    pub specificity: SpecificityVc,
}

#[turbo_tasks::value_impl]
impl PagesStructureItemVc {
    #[turbo_tasks::function]
    async fn new(
        project_path: FileSystemPathVc,
        next_router_path: FileSystemPathVc,
        specificity: SpecificityVc,
    ) -> Result<Self> {
        Ok(PagesStructureItem {
            project_path,
            next_router_path,
            specificity,
        }
        .cell())
    }

    /// Returns a completion that changes when any route in the whole tree
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(self) -> Result<CompletionVc> {
        let this = self.await?;
        this.next_router_path.await?;
        Ok(CompletionVc::new())
    }
}

/// A (sub)directory in the pages directory with all analyzed routes and
/// folders.
#[turbo_tasks::value]
pub struct PagesStructure {
    pub app: PagesStructureItemVc,
    pub document: PagesStructureItemVc,
    pub error: PagesStructureItemVc,
    pub api: Option<PagesDirectoryStructureVc>,
    pub pages: PagesDirectoryStructureVc,
}

#[turbo_tasks::value_impl]
impl PagesStructureVc {
    /// Returns the path to the directory of this structure in the project file
    /// system.
    #[turbo_tasks::function]
    pub async fn project_path(self) -> Result<FileSystemPathVc> {
        Ok(self.await?.pages.project_path())
    }

    /// Returns a completion that changes when any route in the whole tree
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(self) -> Result<CompletionVc> {
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
        pages.routes_changed().await?;
        Ok(CompletionVc::new())
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionPagesStructure(Option<PagesStructureVc>);

#[turbo_tasks::value_impl]
impl OptionPagesStructureVc {
    #[turbo_tasks::function]
    pub async fn routes_changed(self) -> Result<CompletionVc> {
        if let Some(pages_structure) = *self.await? {
            pages_structure.routes_changed().await?;
        }
        Ok(CompletionVc::new())
    }
}

#[turbo_tasks::value]
pub struct PagesDirectoryStructure {
    pub project_path: FileSystemPathVc,
    pub next_router_path: FileSystemPathVc,
    pub items: Vec<PagesStructureItemVc>,
    pub children: Vec<PagesDirectoryStructureVc>,
}

#[turbo_tasks::value_impl]
impl PagesDirectoryStructureVc {
    /// Returns the path to the directory of this structure in the project file
    /// system.
    #[turbo_tasks::function]
    pub async fn project_path(self) -> Result<FileSystemPathVc> {
        Ok(self.await?.project_path)
    }

    /// Returns a completion that changes when any route in the whole tree
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(self) -> Result<CompletionVc> {
        for item in self.await?.items.iter() {
            item.routes_changed().await?;
        }
        for child in self.await?.children.iter() {
            child.routes_changed().await?;
        }
        Ok(CompletionVc::new())
    }
}

/// Finds and returns the [PagesStructure] of the pages directory if existing.
#[turbo_tasks::function]
pub async fn find_pages_structure(
    project_root: FileSystemPathVc,
    next_router_root: FileSystemPathVc,
    next_config: NextConfigVc,
) -> Result<OptionPagesStructureVc> {
    let pages_root = project_root.join("pages");
    let pages_root = if *pages_root.get_type().await? == FileSystemEntryType::Directory {
        pages_root
    } else {
        let src_pages_root = project_root.join("src/pages");
        if *src_pages_root.get_type().await? == FileSystemEntryType::Directory {
            src_pages_root
        } else {
            return Ok(OptionPagesStructureVc::cell(None));
        }
    }
    .resolve()
    .await?;

    Ok(OptionPagesStructureVc::cell(Some(
        get_pages_structure_for_root_directory(
            pages_root,
            next_router_root,
            next_config.page_extensions(),
        ),
    )))
}

/// Handles the root pages directory.
#[turbo_tasks::function]
async fn get_pages_structure_for_root_directory(
    project_path: FileSystemPathVc,
    next_router_path: FileSystemPathVc,
    page_extensions: StringsVc,
) -> Result<PagesStructureVc> {
    let page_extensions_raw = &*page_extensions.await?;

    let mut children = vec![];
    let mut items = vec![];
    let mut app_item = None;
    let mut document_item = None;
    let mut error_item = None;
    let mut api_directory = None;
    let specificity = SpecificityVc::exact();
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
                            let _ = app_item.insert(PagesStructureItemVc::new(
                                *file_project_path,
                                next_router_path.join("_app"),
                                specificity,
                            ));
                        }
                        "_document" => {
                            let _ = document_item.insert(PagesStructureItemVc::new(
                                *file_project_path,
                                next_router_path.join("_document"),
                                specificity,
                            ));
                        }
                        "_error" => {
                            let _ = error_item.insert(PagesStructureItemVc::new(
                                *file_project_path,
                                next_router_path.join("_error"),
                                specificity,
                            ));
                        }
                        basename => {
                            let specificity = entry_specificity(specificity, name, 0);
                            let next_router_path =
                                next_router_path_for_basename(next_router_path, basename);
                            items.push((
                                basename,
                                PagesStructureItemVc::new(
                                    *file_project_path,
                                    next_router_path,
                                    specificity,
                                ),
                            ));
                        }
                    }
                }
                DirectoryEntry::Directory(dir_project_path) => match name.as_ref() {
                    "api" => {
                        api_directory.insert(get_pages_structure_for_directory(
                            *dir_project_path,
                            next_router_path.join(name),
                            specificity,
                            1,
                            page_extensions,
                        ));
                    }
                    _ => {
                        let specificity = entry_specificity(SpecificityVc::exact(), name, 0);
                        children.push((
                            name,
                            get_pages_structure_for_directory(
                                *dir_project_path,
                                next_router_path.join(name),
                                specificity,
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

    // Ensure deterministic order since read_dir is not deterministic
    children.sort_by_key(|(k, _)| *k);

    let app_item = if let Some(app_item) = app_item {
        app_item
    } else {
        PagesStructureItemVc::new(
            next_js_file_path("entry/pages/_app.tsx"),
            next_router_path.join("_app"),
            specificity,
        )
    };

    let document_item = if let Some(document_item) = document_item {
        document_item
    } else {
        PagesStructureItemVc::new(
            next_js_file_path("entry/pages/_document.tsx"),
            next_router_path.join("_document"),
            specificity,
        )
    };

    let error_item = if let Some(error_item) = error_item {
        error_item
    } else {
        PagesStructureItemVc::new(
            next_js_file_path("entry/pages/_error.tsx"),
            next_router_path.join("_error"),
            specificity,
        )
    };

    Ok(PagesStructure {
        app: app_item,
        document: document_item,
        error: error_item,
        api: api_directory,
        pages: PagesDirectoryStructure {
            project_path,
            next_router_path,
            items: items.into_iter().map(|(_, v)| v).collect(),
            children: children.into_iter().map(|(_, v)| v).collect(),
        }
        .cell(),
    }
    .cell())
}

/// Handles a directory in the pages directory (or the pages directory itself).
/// Calls itself recursively for sub directories or the
/// [create_page_source_for_file] method for files.
#[turbo_tasks::function]
async fn get_pages_structure_for_directory(
    project_path: FileSystemPathVc,
    next_router_path: FileSystemPathVc,
    specificity: SpecificityVc,
    position: u32,
    page_extensions: StringsVc,
) -> Result<PagesDirectoryStructureVc> {
    let page_extensions_raw = &*page_extensions.await?;

    let mut children = vec![];
    let mut items = vec![];
    let dir_content = project_path.read_dir().await?;
    if let DirectoryContent::Entries(entries) = &*dir_content {
        for (name, entry) in entries.iter() {
            let specificity = entry_specificity(specificity, name, position);
            match entry {
                DirectoryEntry::File(file_project_path) => {
                    let Some(basename) = page_basename(name, page_extensions_raw) else {
                        continue;
                    };
                    let next_router_path = match basename {
                        "index" => next_router_path,
                        _ => next_router_path.join(basename),
                    };
                    items.push((
                        basename,
                        PagesStructureItemVc::new(
                            *file_project_path,
                            next_router_path,
                            specificity,
                        ),
                    ));
                }
                DirectoryEntry::Directory(dir_project_path) => {
                    children.push((
                        name,
                        get_pages_structure_for_directory(
                            *dir_project_path,
                            next_router_path.join(name),
                            specificity,
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

fn entry_specificity(specificity: SpecificityVc, name: &str, position: u32) -> SpecificityVc {
    if name.starts_with("[[") || name.starts_with("[...") {
        specificity.with_catch_all(position)
    } else if name.starts_with('[') {
        specificity.with_dynamic_segment(position)
    } else {
        specificity
    }
}

fn page_basename<'a>(name: &'a str, page_extensions: &'a [String]) -> Option<&'a str> {
    if let Some((basename, extension)) = name.rsplit_once('.') {
        if page_extensions.iter().any(|allowed| allowed == extension) {
            return Some(basename);
        }
    }
    return None;
}

fn next_router_path_for_basename(
    next_router_path: FileSystemPathVc,
    basename: &str,
) -> FileSystemPathVc {
    if basename == "index" {
        next_router_path
    } else {
        next_router_path.join(basename)
    }
}
