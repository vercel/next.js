use std::{collections::HashMap, ops::Deref};

use anyhow::Result;
use once_cell::sync::Lazy;
use turbo_tasks::{TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_binding::turbopack::{
    core::issue::{Issue, IssueSeverity},
    ecmascript::utils::FormatIter,
};

use crate::next_app::{AppPage, PageSegment};

pub mod route;
pub mod image;

pub static STATIC_LOCAL_METADATA: Lazy<HashMap<&'static str, &'static [&'static str]>> =
    Lazy::new(|| {
        HashMap::from([
            (
                "icon",
                &["ico", "jpg", "jpeg", "png", "svg"] as &'static [&'static str],
            ),
            ("apple-icon", &["jpg", "jpeg", "png"]),
            ("opengraph-image", &["jpg", "jpeg", "png", "gif"]),
            ("twitter-image", &["jpg", "jpeg", "png", "gif"]),
            ("sitemap", &["xml"]),
        ])
    });

pub static STATIC_GLOBAL_METADATA: Lazy<HashMap<&'static str, &'static [&'static str]>> =
    Lazy::new(|| {
        HashMap::from([
            ("favicon", &["ico"] as &'static [&'static str]),
            ("manifest", &["webmanifest", "json"]),
            ("robots", &["txt"]),
        ])
    });

pub struct MetadataFileMatch<'a> {
    pub metadata_type: &'a str,
    pub number: Option<u32>,
    pub dynamic: bool,
}

fn match_numbered_metadata(stem: &str) -> Option<(&str, &str)> {
    let (_whole, stem, number) = lazy_regex::regex_captures!(
        "^(icon|apple-icon|opengraph-image|twitter-image)(\\d+)$",
        stem
    )?;

    Some((stem, number))
}

fn match_metadata_file<'a>(
    filename: &'a str,
    page_extensions: &[String],
    metadata: &HashMap<&str, &[&str]>,
) -> Option<MetadataFileMatch<'a>> {
    let (stem, ext) = filename.split_once('.')?;

    let (stem, number) = match match_numbered_metadata(stem) {
        Some((stem, number)) => {
            let number: u32 = number.parse().ok()?;
            (stem, Some(number))
        }
        _ => (stem, None),
    };

    let exts = metadata.get(stem)?;

    // favicon can't be dynamic
    if stem != "favicon" && page_extensions.iter().any(|e| e == ext) {
        return Some(MetadataFileMatch {
            metadata_type: stem,
            number,
            dynamic: true,
        });
    }

    exts.contains(&ext).then_some(MetadataFileMatch {
        metadata_type: stem,
        number,
        dynamic: false,
    })
}

pub fn match_local_metadata_file<'a>(
    basename: &'a str,
    page_extensions: &[String],
) -> Option<MetadataFileMatch<'a>> {
    match_metadata_file(basename, page_extensions, STATIC_LOCAL_METADATA.deref())
}

pub struct GlobalMetadataFileMatch<'a> {
    pub metadata_type: &'a str,
    pub dynamic: bool,
}

pub fn match_global_metadata_file<'a>(
    basename: &'a str,
    page_extensions: &[String],
) -> Option<GlobalMetadataFileMatch<'a>> {
    match_metadata_file(basename, page_extensions, STATIC_GLOBAL_METADATA.deref()).map(|m| {
        GlobalMetadataFileMatch {
            metadata_type: m.metadata_type,
            dynamic: m.dynamic,
        }
    })
}

fn split_directory(path: &str) -> (Option<&str>, &str) {
    if let Some((dir, basename)) = path.rsplit_once('/') {
        (Some(dir), basename)
    } else {
        (None, path)
    }
}

fn filename(path: &str) -> &str {
    split_directory(path).1
}

fn split_extension(path: &str) -> (&str, Option<&str>) {
    let filename = filename(path);
    if let Some((filename_before_extension, ext)) = filename.rsplit_once('.') {
        if filename_before_extension.is_empty() {
            return (filename, None);
        }

        (filename_before_extension, Some(ext))
    } else {
        (filename, None)
    }
}

fn file_stem(path: &str) -> &str {
    split_extension(path).0
}

/// When you only pass the file extension as `[]`, it will only match the static
/// convention files e.g. `/robots.txt`, `/sitemap.xml`, `/favicon.ico`,
/// `/manifest.json`.
///
/// When you pass the file extension as `['js', 'jsx', 'ts',
/// 'tsx']`, it will also match the dynamic convention files e.g. /robots.js,
/// /sitemap.tsx, /favicon.jsx, /manifest.ts.
///
/// When `withExtension` is false, it will match the static convention files
/// without the extension, by default it's true e.g. /robots, /sitemap,
/// /favicon, /manifest, use to match dynamic API routes like app/robots.ts.
pub fn is_metadata_route_file(
    app_dir_relative_path: &str,
    page_extensions: &[String],
    with_extension: bool,
) -> bool {
    let (dir, filename) = split_directory(app_dir_relative_path);

    if with_extension {
        if match_local_metadata_file(filename, page_extensions).is_some() {
            return true;
        }
    } else {
        let stem = file_stem(filename);
        let stem = match_numbered_metadata(stem)
            .map(|(stem, _)| stem)
            .unwrap_or(stem);

        if STATIC_LOCAL_METADATA.contains_key(stem) {
            return true;
        }
    }

    if dir != Some("/") {
        return false;
    }

    if with_extension {
        if match_global_metadata_file(filename, page_extensions).is_some() {
            return true;
        }
    } else {
        let base_name = file_stem(filename);
        if STATIC_GLOBAL_METADATA.contains_key(base_name) {
            return true;
        }
    }

    false
}

pub fn is_static_metadata_route_file(app_dir_relative_path: &str) -> bool {
    is_metadata_route_file(app_dir_relative_path, &[], true)
}

/// Remove the 'app' prefix or '/route' suffix, only check the route name since
/// they're only allowed in root app directory
///
/// e.g.
/// - /app/robots -> /robots
/// - app/robots -> /robots
/// - /robots -> /robots
pub fn is_metadata_route(mut route: &str) -> bool {
    if let Some(stripped) = route.strip_prefix("/app/") {
        route = stripped;
    } else if let Some(stripped) = route.strip_prefix("app/") {
        route = stripped;
    }

    if let Some(stripped) = route.strip_suffix("/route") {
        route = stripped;
    }

    let mut page = route.to_string();
    if !page.starts_with('/') {
        page = format!("/{}", page);
    }

    !page.ends_with("/page") && is_metadata_route_file(&page, &[], false)
}

/// http://www.cse.yorku.ca/~oz/hash.html
fn djb2_hash(str: &str) -> u32 {
    str.chars().fold(5381, |hash, c| {
        ((hash << 5).wrapping_add(hash)).wrapping_add(c as u32) // hash * 33 + c
    })
}

// this is here to mirror next.js behaviour.
fn format_radix(mut x: u32, radix: u32) -> String {
    let mut result = vec![];

    loop {
        let m = x % radix;
        x /= radix;

        // will panic if you use a bad radix (< 2 or > 36).
        result.push(std::char::from_digit(m, radix).unwrap());
        if x == 0 {
            break;
        }
    }

    result.into_iter().rev().collect()
}

/// If there's special convention like (...) or @ in the page path,
/// Give it a unique hash suffix to avoid conflicts
///
/// e.g.
/// /app/open-graph.tsx -> /open-graph/route
/// /app/(post)/open-graph.tsx -> /open-graph/route-[0-9a-z]{6}
fn get_metadata_route_suffix(page: &str) -> Option<String> {
    if (page.contains('(') && page.contains(')')) || page.contains('@') {
        Some(format_radix(djb2_hash(page), 36))
    } else {
        None
    }
}

// page: `/(dashboard)/user/[id]/page`
// pathname: `/user/[id]`
//
// page: `/account/route`
// pathname: `/account`

/// Map metadata page key to the corresponding route
///
/// static file page key:    /app/robots.txt -> /robots.txt -> /robots.txt/route
/// dynamic route page key:  /app/robots.tsx -> /robots -> /robots.txt/route
pub fn normalize_metadata_route(mut page: AppPage) -> Result<AppPage> {
    if !is_metadata_route(&format!("{page}")) {
        return Ok(page);
    }

    let mut route = page.to_string();
    let mut suffix: Option<String> = None;
    if route == "/robots" {
        route += ".txt"
    } else if route == "/manifest" {
        route += ".webmanifest"
    } else if route.ends_with("/sitemap") {
        route += ".xml"
    } else {
        // Remove the file extension, e.g. /route-path/robots.txt -> /route-path
        let pathname_prefix = split_directory(&route).0.unwrap_or_default();
        suffix = get_metadata_route_suffix(pathname_prefix);
    }

    // Support both /<metadata-route.ext> and custom routes
    // /<metadata-route>/route.ts. If it's a metadata file route, we need to
    // append /[id]/route to the page.
    if !route.ends_with("/route") {
        let is_static_metadata_file = is_static_metadata_route_file(&route);
        let (base_name, ext) = split_extension(&route);

        let is_static_route = route.starts_with("/robots")
            || route.starts_with("/manifest")
            || is_static_metadata_file;

        page.0.pop();

        page.push(PageSegment::Static(format!(
            "{}{}{}",
            base_name,
            suffix
                .map(|suffix| format!("-{suffix}"))
                .unwrap_or_default(),
            ext.map(|ext| format!(".{ext}")).unwrap_or_default(),
        )))?;

        if !is_static_route {
            page.push(PageSegment::OptionalCatchAll("__metadata_id__".to_string()))?;
        }

        // the next version has a `/route` suffix added here, do we need it?
    }

    Ok(page)
}

#[cfg(test)]
mod test {
    use super::normalize_metadata_route;
    use crate::next_app::{AppPage, PageSegment};

    #[test]
    fn test_normalize_metadata_route() {
        let normalized = normalize_metadata_route(AppPage(vec![
            PageSegment::Static("client".to_string()),
            PageSegment::Group("meme".to_string()),
            PageSegment::Static("more-route".to_string()),
            PageSegment::Static("twitter-image".to_string()),
        ]))
        .unwrap();

        let expected = AppPage(vec![
            PageSegment::Static("client".to_string()),
            PageSegment::Group("meme".to_string()),
            PageSegment::Static("more-route".to_string()),
            PageSegment::Static("twitter-image-769mad".to_string()),
            PageSegment::OptionalCatchAll("__metadata_id__".to_string()),
        ]);

        assert_eq!(normalized, expected);
    }

    #[test]
    fn test_normalize_metadata_route2() {
        let page = AppPage::parse("/client/(meme)/more-route/twitter-image2").unwrap();

        assert_eq!(
            normalize_metadata_route(page).unwrap(),
            AppPage(vec![
                PageSegment::Static("client".to_string()),
                PageSegment::Group("meme".to_string()),
                PageSegment::Static("more-route".to_string()),
                PageSegment::Static("twitter-image2-769mad".to_string()),
                PageSegment::OptionalCatchAll("__metadata_id__".to_string()),
            ])
        );
    }
}

// pub fn normalize_metadata_route(page: &str) -> String {
//     if !is_metadata_route(page) {
//         return page.to_string();
//     }
//
//     let mut route = page.to_string();
//     let mut suffix: Option<String> = None;
//     if route == "/robots" {
//         route += ".txt"
//     } else if route == "/manifest" {
//         route += ".webmanifest"
//     } else if route.ends_with("/sitemap") {
//         route += ".xml"
//     } else {
//         // Remove the file extension, e.g. /route-path/robots.txt ->
// /route-path         let pathname_prefix =
// split_directory(page).0.unwrap_or_default();         suffix =
// get_metadata_route_suffix(pathname_prefix);     }
//
//     // Support both /<metadata-route.ext> and custom routes
//     // /<metadata-route>/route.ts. If it's a metadata file route, we need to
//     // append /[id]/route to the page.
//     if !route.ends_with("/route") {
//         let is_static_metadata_file = is_static_metadata_route_file(page);
//         let (dir, filename) = split_directory(&route);
//         let (base_name, ext) = split_extensions(filename);
//
//         let is_static_route =
//             page.starts_with("/robots") || page.starts_with("/manifest") ||
// is_static_metadata_file;
//
//         // the next version has a `/route` suffix added here, do we need it?
//         route = format!(
//             "{}/{}{}{}{}",
//             dir.unwrap_or_default(),
//             base_name,
//             suffix
//                 .map(|suffix| format!("-{suffix}"))
//                 .unwrap_or_default(),
//             ext.map(|ext| format!(".{ext}")).unwrap_or_default(),
//             (!is_static_route)
//                 .then_some("/[[...__metadata_id__]]")
//                 .unwrap_or_default(),
//         );
//     }
//
//     route
// }

#[turbo_tasks::value(shared)]
pub struct UnsupportedDynamicMetadataIssue {
    pub app_dir: Vc<FileSystemPath>,
    pub files: Vec<Vc<FileSystemPath>>,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedDynamicMetadataIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("unsupported".to_string())
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.app_dir
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<String> {
        Vc::cell(
            "Dynamic metadata from filesystem is currently not supported in Turbopack".to_string(),
        )
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        let mut files = self
            .files
            .iter()
            .map(|file| file.to_string())
            .try_join()
            .await?;
        files.sort();
        Ok(Vc::cell(format!(
            "The following files were found in the app directory, but are not supported by \
             Turbopack. They are ignored:\n{}",
            FormatIter(|| files.iter().flat_map(|file| vec!["\n- ", file]))
        )))
    }
}
