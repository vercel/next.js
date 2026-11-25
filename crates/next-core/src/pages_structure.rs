use anyhow::{Result, bail};
use async_trait::async_trait;
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    NonLocalValue, OptionVcExt, ResolvedVc, TryJoinIterExt, ValueToStringRef, Vc,
    debug::ValueDebugFormat,
};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPath, FileSystemPathOption,
    RealPathErrorType,
};
use turbopack_core::issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString};

use crate::{
    next_import_map::get_next_package,
    route_discovery::{DevelopmentDiscovery, OptionDevelopmentDiscovery},
};

/// A file in the pages directory that names a route, before extension precedence chooses one
/// module. The development checks in [development_discovery] read these; they are not sent to
/// JavaScript.
#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, ValueDebugFormat, Encode, Decode)]
pub struct PagesFile {
    /// The route the file names, e.g. `/about` for both `about.tsx` and `about/index.tsx`.
    pub original_name: RcStr,
    pub source: FileSystemPath,
    pub is_api: bool,
}

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
    /// Every file that names a route, before extension precedence chooses a module.
    pub authored_files: Vec<PagesFile>,
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
    async fn realpath_if_exists(path: &FileSystemPath) -> Result<Option<FileSystemPath>> {
        match path.realpath().await? {
            Ok(path) => Ok(Some(path)),
            Err(error) if matches!(error.kind(), RealPathErrorType::NotFound) => Ok(None),
            Err(error) => bail!(error),
        }
    }

    let pages_root = realpath_if_exists(&project_root.join("pages")?).await?;
    let pages_root = if let Some(pages_root) = pages_root
        && *pages_root.get_type().await? == FileSystemEntryType::Directory
    {
        Some(pages_root)
    } else {
        let src_pages_root = realpath_if_exists(&project_root.join("src/pages")?).await?;
        if let Some(src_pages_root) = src_pages_root
            && *src_pages_root.get_type().await? == FileSystemEntryType::Directory
        {
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
        let mut authored_files = Vec::new();

        // DETERMINISM: Items and children are sorted below; basename ties produce identical items.
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
                        authored_files.push(PagesFile {
                            original_name: format!(
                                "/{}",
                                next_router_path_for_basename(next_router_path.clone(), basename)?
                                    .path
                            )
                            .into(),
                            source: project_path.join(name)?,
                            is_api: false,
                        });
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
        authored_files.sort_by(|a, b| a.source.path.cmp(&b.source.path));

        Some(
            PagesDirectoryStructure {
                project_path: project_path.clone(),
                next_router_path: next_router_path.clone(),
                authored_files,
                items: items
                    .into_iter()
                    .map(|(_, v)| v.to_resolved())
                    .try_join()
                    .await?,
                children: children
                    .into_iter()
                    .map(|(_, v)| v.to_resolved())
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
            Some(next_package.join("dist/pages/_error.js")?),
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
    page_extensions: Vc<Vec<RcStr>>,
) -> Result<Vc<PagesDirectoryStructure>> {
    let span = tracing::info_span!(
        "analyze pages structure",
        name = display(project_path.to_string_ref().await?)
    );
    async move {
        let page_extensions_raw = &*page_extensions.await?;

        let mut children = vec![];
        let mut items = vec![];
        let mut authored_files = Vec::new();
        // DETERMINISM: Full-name sorting breaks extension ties before the stable basename sort.
        let dir_content = project_path.read_dir().await?;
        if let DirectoryContent::Entries(entries) = &*dir_content {
            let mut entries = entries.iter().collect::<Vec<_>>();
            entries.sort_unstable_by_key(|(name, _)| *name);
            for (name, entry) in entries {
                match entry {
                    DirectoryEntry::File(_) => {
                        if name.ends_with(".d.ts") {
                            continue;
                        }
                        let Some(basename) = page_basename(name, page_extensions_raw) else {
                            continue;
                        };
                        let item_next_router_path = match basename {
                            "index" => next_router_path.clone(),
                            _ => next_router_path.join(basename)?,
                        };
                        authored_files.push(PagesFile {
                            original_name: format!("/{}", item_next_router_path.path).into(),
                            source: project_path.join(name)?,
                            is_api: next_router_path.path == "api"
                                || next_router_path.path.starts_with("api/"),
                        });
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
            authored_files,
            items: items
                .into_iter()
                .map(|(_, v)| v)
                .map(|v| v.to_resolved())
                .try_join()
                .await?,
            children: children
                .into_iter()
                .map(|(_, v)| v)
                .map(|v| v.to_resolved())
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

/// Development facts about the pages directory, and the checks that read every file in it:
/// duplicate pages, nested `_middleware` files, and API routes with `output: export`. The checks
/// emit issues; `next build` and Webpack dev run their own JavaScript versions of them.
#[turbo_tasks::function]
pub async fn development_discovery(
    structure: Vc<PagesStructure>,
    is_export: bool,
) -> Result<Vc<OptionDevelopmentDiscovery>> {
    let structure = structure.await?;
    let mut discovery = DevelopmentDiscovery::default();
    let mut files = Vec::new();
    let mut queue: Vec<_> = structure
        .pages
        .iter()
        .chain(structure.api.iter())
        .copied()
        .collect();
    while let Some(directory) = queue.pop() {
        let directory = directory.await?;
        files.extend(directory.authored_files.iter().cloned());
        queue.extend(directory.children.iter().copied());
    }
    files.sort_by(|a, b| a.source.path.cmp(&b.source.path));
    for file in &files {
        if matches!(
            file.original_name.as_str(),
            "/_app" | "/_document" | "/_error"
        ) && !discovery
            .authored_pages_special_routes
            .contains(&file.original_name)
        {
            discovery
                .authored_pages_special_routes
                .push(file.original_name.clone());
        }
    }
    discovery.authored_pages_special_routes.sort();
    if let Some(pages) = structure.pages {
        emit_pages_file_issues(&files, &*pages.await?, is_export);
    }
    Ok(Vc::cell(Some(discovery)))
}

/// Emits the checks that the old JavaScript route watcher ran over every file in `pages`.
fn emit_pages_file_issues(files: &[PagesFile], pages: &PagesDirectoryStructure, is_export: bool) {
    let mut by_route = FxHashMap::<&str, Vec<&PagesFile>>::default();
    for file in files {
        by_route
            .entry(file.original_name.as_str())
            .or_default()
            .push(file);
    }
    let mut duplicates: Vec<_> = by_route
        .into_iter()
        .filter(|(_, files)| files.len() > 1)
        .collect();
    duplicates.sort_by_key(|(route, _)| *route);
    for (route, files) in duplicates {
        let (last, rest) = files
            .split_last()
            .expect("duplicates have more than one file");
        let rest = rest
            .iter()
            .map(|file| file.source.path.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        PagesFileIssue {
            severity: IssueSeverity::Warning,
            path: last.source.clone(),
            title: rcstr!("Duplicate page detected"),
            description: format!("{rest} and {} both resolve to {route}.", last.source.path).into(),
        }
        .resolved_cell()
        .emit();
    }

    let nested_middleware: Vec<_> = files
        .iter()
        .filter(|file| file.original_name.ends_with("/_middleware"))
        .collect();
    if let Some(first) = nested_middleware.first() {
        // The project-level file goes next to the pages directory: `/middleware` or
        // `/src/middleware`.
        let parent = pages.project_path.parent().path.clone();
        let single_file = if parent.is_empty() {
            "/middleware".to_string()
        } else {
            format!("/{parent}/middleware")
        };
        PagesFileIssue {
            severity: IssueSeverity::Error,
            path: first.source.clone(),
            title: rcstr!("Nested Middleware is not allowed"),
            description: format!(
                "Found:\n{}\nPlease move your code to a single file at {single_file} \
                 instead.\nRead More - https://nextjs.org/docs/messages/nested-middleware",
                nested_middleware
                    .iter()
                    .map(|file| format!("pages{}", file.original_name))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
            .into(),
        }
        .resolved_cell()
        .emit();
    }

    if is_export && let Some(api_route) = files.iter().find(|file| file.is_api) {
        PagesFileIssue {
            severity: IssueSeverity::Error,
            path: api_route.source.clone(),
            title: rcstr!("API Routes cannot be used with \"output: export\"."),
            description: rcstr!(
                "See more info here: https://nextjs.org/docs/advanced-features/static-html-export"
            ),
        }
        .resolved_cell()
        .emit();
    }
}

#[turbo_tasks::value(shared)]
struct PagesFileIssue {
    severity: IssueSeverity,
    path: FileSystemPath,
    title: RcStr,
    description: RcStr,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for PagesFileIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(self.title.clone()))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::AppStructure
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(self.description.clone())))
    }
}
