use anyhow::Result;
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{OptionVcExt, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPath, FileSystemPathOption,
};

use crate::next_import_map::get_next_package;

/// A final route in the pages directory.
#[turbo_tasks::value]
pub struct PagesStructureItem {
    pub base_path: FileSystemPath,
    pub extensions: ResolvedVc<Vec<RcStr>>,
    pub fallback_path: Option<FileSystemPath>,

    /// Pathname of this item in the Next.js router.
    pub next_router_path: FileSystemPath,
    /// Unique path corresponding to this item. This differs from
    /// `next_router_path` in that it will include the trailing /index for index
    /// routes, which allows for differentiating with potential /index
    /// directories.
    pub original_path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl PagesStructureItem {
    #[turbo_tasks::function]
    fn new(
        base_path: FileSystemPath,
        extensions: ResolvedVc<Vec<RcStr>>,
        fallback_path: Option<FileSystemPath>,
        next_router_path: FileSystemPath,
        original_path: FileSystemPath,
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
    pub async fn file_path(&self) -> Result<Vc<FileSystemPath>> {
        // Check if the file path + extension exists in the filesystem, if so use that. If not fall
        // back to the base path.
        for ext in self.extensions.await?.into_iter() {
            let file_path = self.base_path.append(&format!(".{ext}"))?;
            let ty = *file_path.get_type().await?;
            if matches!(ty, FileSystemEntryType::File | FileSystemEntryType::Symlink) {
                return Ok(file_path.cell());
            }
        }
        if let Some(fallback_path) = &self.fallback_path {
            Ok(fallback_path.clone().cell())
        } else {
            // If the file path that was passed in already has an extension, for example
            // `pages/index.js` it won't match the extensions list above because it already had an
            // extension and for example `.js.js` obviously won't match
            Ok(self.base_path.clone().cell())
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
    pub error_500: Option<ResolvedVc<PagesStructureItem>>,
    pub api: Option<ResolvedVc<PagesDirectoryStructure>>,
    pub pages: Option<ResolvedVc<PagesDirectoryStructure>>,
    pub has_user_pages: bool,
    pub should_create_pages_entries: bool,
}

#[turbo_tasks::value]
pub struct PagesDirectoryStructure {
    pub project_path: FileSystemPath,
    pub next_router_path: FileSystemPath,
    pub items: Vec<ResolvedVc<PagesStructureItem>>,
    pub children: Vec<ResolvedVc<PagesDirectoryStructure>>,
}

#[turbo_tasks::value_impl]
impl PagesDirectoryStructure {
    /// Returns the path to the directory of this structure in the project file
    /// system.
    #[turbo_tasks::function]
    pub fn project_path(&self) -> Vc<FileSystemPath> {
        self.project_path.clone().cell()
    }
}

/// Finds and returns the [PagesStructure] of the pages directory if existing.
#[turbo_tasks::function]
pub async fn find_pages_structure(
    project_root: FileSystemPath,
    next_router_root: FileSystemPath,
    page_extensions: Vc<Vec<RcStr>>,
    next_mode: Vc<crate::mode::NextMode>,
) -> Result<Vc<PagesStructure>> {
    let pages_root = project_root.join("pages")?.realpath().await?;
    let pages_root = if *pages_root.get_type().await? == FileSystemEntryType::Directory {
        Some(pages_root)
    } else {
        let src_pages_root = project_root.join("src/pages")?.realpath().await?;
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
        next_mode,
    ))
}

/// Handles the root pages directory.
#[turbo_tasks::function]
async fn get_pages_structure_for_root_directory(
    project_root: FileSystemPath,
    project_path: Vc<FileSystemPathOption>,
    next_router_path: FileSystemPath,
    page_extensions: Vc<Vec<RcStr>>,
    next_mode: Vc<crate::mode::NextMode>,
) -> Result<Vc<PagesStructure>> {
    let page_extensions_raw = &*page_extensions.await?;

    let mut api_directory = None;
    let mut error_500_item = None;

    let project_path = project_path.await?;
    let pages_directory = if let Some(project_path) = &*project_path {
        let mut children = vec![];
        let mut items = vec![];

        let dir_content = project_path.read_dir().await?;
        if let DirectoryContent::Entries(entries) = &*dir_content {
            for (name, entry) in entries.iter() {
                let entry = entry.clone().resolve_symlink().await?;
                match entry {
                    DirectoryEntry::File(_) => {
                        // Do not process .d.ts files as routes
                        if name.ends_with(".d.ts") {
                            continue;
                        }
                        let Some(basename) = page_basename(name, page_extensions_raw) else {
                            continue;
                        };
                        let base_path = project_path.join(basename)?;
                        match basename {
                            "_app" | "_document" | "_error" => {}
                            "500" => {
                                let item_next_router_path = next_router_path_for_basename(
                                    next_router_path.clone(),
                                    basename,
                                )?;
                                let item_original_path = next_router_path.join(basename)?;
                                let item = PagesStructureItem::new(
                                    base_path,
                                    page_extensions,
                                    None,
                                    item_next_router_path,
                                    item_original_path,
                                );

                                error_500_item = Some(item);

                                items.push((basename, item));
                            }

                            basename => {
                                let item_next_router_path = next_router_path_for_basename(
                                    next_router_path.clone(),
                                    basename,
                                )?;
                                let item_original_path = next_router_path.join(basename)?;
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
                                    dir_project_path.clone(),
                                    next_router_path.join(name)?,
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
                                    dir_project_path.clone(),
                                    next_router_path.join(name)?,
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
                project_path: project_path.clone(),
                next_router_path: next_router_path.clone(),
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

    let pages_path = if let Some(project_path) = &*project_path {
        project_path.clone()
    } else {
        project_root.join("pages")?
    };

    // Check if there are any actual user pages (not just _app, _document, _error)
    // error_500_item can be auto-generated for app router, so only count it if there are other user
    // pages
    let has_user_pages = pages_directory.is_some() || api_directory.is_some();

    // Only skip user pages routes during build mode when there are no user pages
    let should_create_pages_entries = has_user_pages || next_mode.await?.is_development();
    let next_package = get_next_package(project_root.clone()).await?;

    let app_item = {
        let app_router_path = next_router_path.join("_app")?;
        PagesStructureItem::new(
            pages_path.join("_app")?,
            page_extensions,
            Some(next_package.join("app.js")?),
            app_router_path.clone(),
            app_router_path,
        )
    };

    let document_item = {
        let document_router_path = next_router_path.join("_document")?;
        PagesStructureItem::new(
            pages_path.join("_document")?,
            page_extensions,
            Some(next_package.join("document.js")?),
            document_router_path.clone(),
            document_router_path,
        )
    };

    let error_item = {
        let error_router_path = next_router_path.join("_error")?;
        PagesStructureItem::new(
            pages_path.join("_error")?,
            page_extensions,
            Some(next_package.join("error.js")?),
            error_router_path.clone(),
            error_router_path,
        )
    };

    Ok(PagesStructure {
        app: app_item.to_resolved().await?,
        document: document_item.to_resolved().await?,
        error: error_item.to_resolved().await?,
        error_500: error_500_item.to_resolved().await?,
        api: api_directory,
        pages: pages_directory,
        has_user_pages,
        should_create_pages_entries,
    }
    .cell())
}

/// Handles a directory in the pages directory (or the pages directory itself).
/// Calls itself recursively for sub directories.
#[turbo_tasks::function]
async fn get_pages_structure_for_directory(
    project_path: FileSystemPath,
    next_router_path: FileSystemPath,
    position: u32,
    page_extensions: Vc<Vec<RcStr>>,
) -> Result<Vc<PagesDirectoryStructure>> {
    let span = tracing::info_span!(
        "analyze pages structure",
        name = display(project_path.value_to_string().await?)
    );
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
                            "index" => next_router_path.clone(),
                            _ => next_router_path.join(basename)?,
                        };
                        let base_path = project_path.join(name)?;
                        let item_original_name = next_router_path.join(basename)?;
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
                                dir_project_path.clone(),
                                next_router_path.join(name)?,
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
            project_path: project_path.clone(),
            next_router_path: next_router_path.clone(),
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
    next_router_path: FileSystemPath,
    basename: &str,
) -> Result<FileSystemPath> {
    Ok(if basename == "index" {
        next_router_path.clone()
    } else {
        next_router_path.join(basename)?
    })
}
