use anyhow::Result;
use turbo_binding::{
    turbo::tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPathVc},
    turbopack::dev_server::source::specificity::SpecificityVc,
};
use turbo_tasks::{
    primitives::{BoolVc, StringsVc},
    CompletionVc,
};

use crate::next_config::NextConfigVc;

/// A final route in the pages directory.
#[turbo_tasks::value]
pub enum PagesStructureItem {
    Page {
        url: FileSystemPathVc,
        specificity: SpecificityVc,
        page: FileSystemPathVc,
    },
    Api {
        url: FileSystemPathVc,
        specificity: SpecificityVc,
        api: FileSystemPathVc,
    },
}

#[turbo_tasks::value_impl]
impl PagesStructureItemVc {
    #[turbo_tasks::function]
    async fn new(
        url: FileSystemPathVc,
        specificity: SpecificityVc,
        file: FileSystemPathVc,
        is_api: BoolVc,
    ) -> Result<Self> {
        if *is_api.await? {
            Ok(PagesStructureItem::Api {
                url,
                specificity,
                api: file,
            }
            .cell())
        } else {
            Ok(PagesStructureItem::Page {
                url,
                specificity,
                page: file,
            }
            .cell())
        }
    }

    /// Returns a completion that changes when any route in the whole tree
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(self) -> Result<CompletionVc> {
        match *self.await? {
            PagesStructureItem::Page { url, .. } => url.await?,
            PagesStructureItem::Api { url, .. } => url.await?,
        };
        Ok(CompletionVc::new())
    }
}

/// A (sub)directory in the pages directory with all analyzed routes and
/// folders.
#[turbo_tasks::value]
pub struct PagesStructure {
    pub directory: FileSystemPathVc,
    pub items: Vec<PagesStructureItemVc>,
    pub children: Vec<PagesStructureVc>,
}

#[turbo_tasks::value_impl]
impl PagesStructureVc {
    /// Returns the directory of this structure.
    #[turbo_tasks::function]
    pub async fn directory(self) -> Result<FileSystemPathVc> {
        Ok(self.await?.directory)
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

/// Finds and returns the [PagesStructure] of the pages directory if existing.
#[turbo_tasks::function]
pub async fn find_pages_structure(
    project_path: FileSystemPathVc,
    server_root: FileSystemPathVc,
    next_config: NextConfigVc,
) -> Result<OptionPagesStructureVc> {
    let pages = project_path.join("pages");
    let src_pages = project_path.join("src/pages");
    let pages_dir = if *pages.get_type().await? == FileSystemEntryType::Directory {
        pages
    } else if *src_pages.get_type().await? == FileSystemEntryType::Directory {
        src_pages
    } else {
        return Ok(OptionPagesStructureVc::cell(None));
    }
    .resolve()
    .await?;

    Ok(OptionPagesStructureVc::cell(Some(get_pages_structure(
        pages_dir,
        server_root,
        next_config.page_extensions(),
    ))))
}

/// Parses a directory as pages directory and returns the [PagesStructure].
#[turbo_tasks::function]
pub fn get_pages_structure(
    pages_dir: FileSystemPathVc,
    server_root: FileSystemPathVc,
    page_extensions: StringsVc,
) -> PagesStructureVc {
    get_pages_structure_for_directory(
        pages_dir,
        SpecificityVc::exact(),
        0,
        server_root,
        server_root.join("api"),
        page_extensions,
    )
}

/// Handles a directory in the pages directory (or the pages directory itself).
/// Calls itself recursively for sub directories or the
/// [create_page_source_for_file] method for files.
#[turbo_tasks::function]
async fn get_pages_structure_for_directory(
    input_dir: FileSystemPathVc,
    specificity: SpecificityVc,
    position: u32,
    url: FileSystemPathVc,
    server_api_path: FileSystemPathVc,
    page_extensions: StringsVc,
) -> Result<PagesStructureVc> {
    let page_extensions_raw = &*page_extensions.await?;

    let mut children = vec![];
    let mut items = vec![];
    let dir_content = input_dir.read_dir().await?;
    if let DirectoryContent::Entries(entries) = &*dir_content {
        for (name, entry) in entries.iter() {
            let specificity = if name.starts_with("[[") || name.starts_with("[...") {
                specificity.with_catch_all(position)
            } else if name.starts_with('[') {
                specificity.with_dynamic_segment(position)
            } else {
                specificity
            };
            match entry {
                DirectoryEntry::File(file) => {
                    if let Some((basename, extension)) = name.rsplit_once('.') {
                        if page_extensions_raw
                            .iter()
                            .any(|allowed| allowed == extension)
                        {
                            let url = if basename == "index" {
                                url.join("index.html")
                            } else {
                                url.join(basename).join("index.html")
                            };
                            items.push((
                                name,
                                PagesStructureItemVc::new(
                                    url,
                                    specificity,
                                    *file,
                                    url.is_inside(server_api_path),
                                ),
                            ))
                        }
                    }
                }
                DirectoryEntry::Directory(dir) => {
                    children.push((
                        name,
                        get_pages_structure_for_directory(
                            *dir,
                            specificity,
                            position + 1,
                            url.join(name),
                            server_api_path,
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

    Ok(PagesStructure {
        directory: input_dir,
        items: items.into_iter().map(|(_, v)| v).collect(),
        children: children.into_iter().map(|(_, v)| v).collect(),
    }
    .cell())
}
