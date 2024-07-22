use std::{collections::HashMap, ops::Deref};

use anyhow::Result;
use once_cell::sync::Lazy;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;

use crate::next_app::{AppPage, PageSegment, PageType};

pub mod image;
pub mod route;

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

pub(crate) async fn get_content_type(path: Vc<FileSystemPath>) -> Result<String> {
    let stem = &*path.file_stem().await?;
    let ext = &*path.extension().await?;

    let name = stem.as_deref().unwrap_or_default();
    let mut ext = ext.as_str();
    if ext == "jpg" {
        ext = "jpeg"
    }

    if name == "favicon" && ext == "ico" {
        return Ok("image/x-icon".to_string());
    }
    if name == "sitemap" {
        return Ok("application/xml".to_string());
    }
    if name == "robots" {
        return Ok("text/plain".to_string());
    }
    if name == "manifest" {
        return Ok("application/manifest+json".to_string());
    }

    if ext == "png" || ext == "jpeg" || ext == "ico" || ext == "svg" {
        return Ok(mime_guess::from_ext(ext)
            .first_or_octet_stream()
            .to_string());
    }

    Ok("text/plain".to_string())
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
        if dir.is_empty() {
            return (Some("/"), basename);
        }

        (Some(dir), basename)
    } else {
        (None, path)
    }
}

fn filename(path: &str) -> &str {
    split_directory(path).1
}

pub(crate) fn split_extension(path: &str) -> (&str, Option<&str>) {
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

/// djb_2 hash implementation referenced from [here](http://www.cse.yorku.ca/~oz/hash.html)
fn djb2_hash(str: &str) -> u32 {
    str.chars().fold(5381, |hash, c| {
        ((hash << 5).wrapping_add(hash)).wrapping_add(c as u32) // hash * 33 + c
    })
}

// this is here to mirror next.js behaviour (`toString(36).slice(0, 6)`)
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

    result.reverse();
    result[..6].iter().collect()
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
        let is_static_metadata_file = is_static_metadata_route_file(&page.to_string());
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

        page.push(PageSegment::PageType(PageType::Route))?;
    }

    Ok(page)
}

#[cfg(test)]
mod test {
    use super::normalize_metadata_route;
    use crate::next_app::AppPage;

    #[test]
    fn test_normalize_metadata_route() {
        let cases = vec![
            [
                "/client/(meme)/more-route/twitter-image",
                "/client/(meme)/more-route/twitter-image-769mad/[[...__metadata_id__]]/route",
            ],
            [
                "/client/(meme)/more-route/twitter-image2",
                "/client/(meme)/more-route/twitter-image2-769mad/[[...__metadata_id__]]/route",
            ],
            ["/robots.txt", "/robots.txt/route"],
            ["/manifest.webmanifest", "/manifest.webmanifest/route"],
        ];

        for [input, expected] in cases {
            let page = AppPage::parse(input).unwrap();
            let normalized = normalize_metadata_route(page).unwrap();

            assert_eq!(&normalized.to_string(), expected);
        }
    }
}
