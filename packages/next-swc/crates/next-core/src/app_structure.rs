use std::collections::HashMap;

use anyhow::{bail, Result};
use turbo_tasks::{
    primitives::{StringVc, StringsVc},
    CompletionVc, ValueToString,
};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, File, FileContentVc, FileSystemEntryType, FileSystemPathVc,
};
use turbopack_core::issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc};
use turbopack_dev_server::source::specificity::SpecificityVc;

use crate::{
    app_render::{LayoutSegment, LayoutSegmentVc, LayoutSegmentsVc},
    embed_js::wrap_with_next_js_fs,
    next_config::NextConfigVc,
};

/// A final route in the app directory.
#[turbo_tasks::value]
pub enum AppStructureItem {
    Page {
        segment: LayoutSegmentVc,
        segments: LayoutSegmentsVc,
        url: FileSystemPathVc,
        specificity: SpecificityVc,
        page: FileSystemPathVc,
    },
    Route {
        segment: LayoutSegmentVc,
        url: FileSystemPathVc,
        specificity: SpecificityVc,
        route: FileSystemPathVc,
    },
}

#[turbo_tasks::value_impl]
impl AppStructureItemVc {
    #[turbo_tasks::function]
    pub async fn routes_changed(self) -> Result<CompletionVc> {
        match *self.await? {
            AppStructureItem::Page { url, .. } => url.await?,
            AppStructureItem::Route { url, .. } => url.await?,
        };
        Ok(CompletionVc::new())
    }
}

/// A (sub)directory in the app directory with all analyzed routes and folders.
#[turbo_tasks::value]
pub struct AppStructure {
    pub directory: FileSystemPathVc,
    pub item: Option<AppStructureItemVc>,
    pub children: Vec<AppStructureVc>,
}

#[turbo_tasks::value_impl]
impl AppStructureVc {
    /// Returns the directory of this structure.
    #[turbo_tasks::function]
    pub async fn directory(self) -> Result<FileSystemPathVc> {
        Ok(self.await?.directory)
    }

    /// Returns a completion that changes when any route in the whole tree
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(self) -> Result<CompletionVc> {
        if let Some(item) = self.await?.item {
            item.routes_changed().await?;
        }
        for child in self.await?.children.iter() {
            child.routes_changed().await?;
        }
        Ok(CompletionVc::new())
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionAppStructure(Option<AppStructureVc>);

#[turbo_tasks::value_impl]
impl OptionAppStructureVc {
    /// Returns a completion that changes when any route in the whole tree
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(self) -> Result<CompletionVc> {
        if let Some(app_structure) = *self.await? {
            app_structure.routes_changed().await?;
        }
        Ok(CompletionVc::new())
    }
}

/// Finds and returns the [AppStructure] of the app directory if enabled and
/// existing.
#[turbo_tasks::function]
pub async fn find_app_structure(
    project_path: FileSystemPathVc,
    server_root: FileSystemPathVc,
    next_config: NextConfigVc,
) -> Result<OptionAppStructureVc> {
    let project_path = wrap_with_next_js_fs(project_path);

    if !*next_config.app_dir().await? {
        return Ok(OptionAppStructureVc::cell(None));
    }

    let app = project_path.join("app");
    let src_app = project_path.join("src/app");
    let app_dir = if *app.get_type().await? == FileSystemEntryType::Directory {
        app
    } else if *src_app.get_type().await? == FileSystemEntryType::Directory {
        src_app
    } else {
        return Ok(OptionAppStructureVc::cell(None));
    }
    .resolve()
    .await?;

    Ok(OptionAppStructureVc::cell(Some(get_app_structure(
        app_dir,
        server_root,
        next_config.page_extensions(),
    ))))
}

/// Parses a directory as app directory and returns the [AppStructure].
#[turbo_tasks::function]
pub fn get_app_structure(
    app_dir: FileSystemPathVc,
    server_root: FileSystemPathVc,
    page_extensions: StringsVc,
) -> AppStructureVc {
    get_app_structure_for_directory(
        app_dir,
        true,
        SpecificityVc::exact(),
        0,
        server_root,
        server_root,
        LayoutSegmentsVc::cell(Vec::new()),
        page_extensions,
    )
}

#[allow(clippy::too_many_arguments)]
#[turbo_tasks::function]
async fn get_app_structure_for_directory(
    input_dir: FileSystemPathVc,
    root: bool,
    specificity: SpecificityVc,
    position: u32,
    target: FileSystemPathVc,
    url: FileSystemPathVc,
    layouts: LayoutSegmentsVc,
    page_extensions: StringsVc,
) -> Result<AppStructureVc> {
    let mut layouts = layouts;
    let mut page = None;
    let mut route = None;
    let mut files = HashMap::new();

    let DirectoryContent::Entries(entries) = &*input_dir.read_dir().await? else {
        bail!("{} is not a directory", input_dir.to_string().await?)
    };

    let allowed_extensions = &*page_extensions.await?;

    for (name, entry) in entries.iter() {
        if let &DirectoryEntry::File(file) = entry {
            if let Some((name, ext)) = name.rsplit_once('.') {
                if !allowed_extensions.iter().any(|allowed| allowed == ext) {
                    continue;
                }

                match name {
                    "page" => {
                        page = Some(file);
                    }
                    "route" => {
                        route = Some(file);
                    }
                    "layout" | "error" | "loading" | "template" | "not-found" | "head" => {
                        files.insert(name.to_string(), file);
                    }
                    _ => {
                        // Any other file is ignored
                    }
                }
            }
        }
    }

    let layout = files.get("layout");

    if let (Some(_), Some(route_path)) = (page, route) {
        AppStructureIssue {
            severity: IssueSeverity::Error.into(),
            path: route_path,
            message: StringVc::cell(
                "It's not possible to have a page and a route in the same directory. The route \
                 will be ignored in favor of the page."
                    .to_string(),
            ),
        }
        .cell()
        .as_issue()
        .emit();

        route = None;
    }

    // If a page exists but no layout exists, create a basic root layout
    // in `app/layout.js` or `app/layout.tsx`.
    //
    // TODO: Use let Some(page_file) = page in expression below when
    // https://rust-lang.github.io/rfcs/2497-if-let-chains.html lands
    if let (Some(page_file), None, true) = (page, layout, root) {
        // Use the extension to determine if the page file is TypeScript.
        // TODO: Use the presence of a tsconfig.json instead, like Next.js
        // stable does.
        let is_tsx = *page_file.extension().await? == "tsx";

        let layout = if is_tsx {
            input_dir.join("layout.tsx")
        } else {
            input_dir.join("layout.js")
        };
        files.insert("layout".to_string(), layout);
        let content = if is_tsx {
            include_str!("assets/layout.tsx")
        } else {
            include_str!("assets/layout.js")
        };

        layout.write(FileContentVc::from(File::from(content)));

        AppStructureIssue {
            severity: IssueSeverity::Warning.into(),
            path: page_file,
            message: StringVc::cell(format!(
                "Your page {} did not have a root layout, we created {} for you.",
                page_file.await?.path,
                layout.await?.path,
            )),
        }
        .cell()
        .as_issue()
        .emit();
    }

    let mut list = layouts.await?.clone_value();
    let segment = LayoutSegment { files, target }.cell();
    list.push(segment);
    layouts = LayoutSegmentsVc::cell(list);

    let mut children = Vec::new();
    for (name, entry) in entries.iter() {
        let DirectoryEntry::Directory(dir) = entry else {
            continue;
        };

        let specificity = if name.starts_with("[[") || name.starts_with("[...") {
            specificity.with_catch_all(position)
        } else if name.starts_with('[') {
            specificity.with_dynamic_segment(position)
        } else {
            specificity
        };

        let new_target = target.join(name);
        let (new_root, new_url, position) = if name.starts_with('(') && name.ends_with(')') {
            // This doesn't affect the url
            (root, url, position)
        } else {
            // This adds to the url
            (false, url.join(name), position + 1)
        };

        children.push((
            name,
            get_app_structure_for_directory(
                *dir,
                new_root,
                specificity,
                position,
                new_target,
                new_url,
                layouts,
                page_extensions,
            ),
        ));
    }

    let item = page
        .map(|page| {
            AppStructureItem::Page {
                page,
                segment,
                segments: layouts,
                url,
                specificity,
            }
            .cell()
        })
        .or_else(|| {
            route.map(|route| {
                AppStructureItem::Route {
                    route,
                    segment,
                    url,
                    specificity,
                }
                .cell()
            })
        });

    // Ensure deterministic order since read_dir is not deterministic
    children.sort_by_key(|(k, _)| *k);

    Ok(AppStructure {
        item,
        directory: input_dir,
        children: children.into_iter().map(|(_, v)| v).collect(),
    }
    .cell())
}

#[turbo_tasks::value(shared)]
struct AppStructureIssue {
    pub severity: IssueSeverityVc,
    pub path: FileSystemPathVc,
    pub message: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for AppStructureIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        self.severity
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<StringVc> {
        Ok(StringVc::cell(
            "An issue occurred while preparing your Next.js app".to_string(),
        ))
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("next app".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.message
    }
}
