use anyhow::{anyhow, bail, Result};
use turbo_tasks::ValueToString;
use turbo_tasks_fs::FileSystemPathVc;

use crate::path_regex::{PathRegexBuilder, PathRegexVc};

/// Converts a filename within the server root to a regular expression with
/// named capture groups for every dynamic segment.
#[turbo_tasks::function]
pub async fn regular_expression_for_path(
    server_root: FileSystemPathVc,
    server_path: FileSystemPathVc,
    has_extension: bool,
) -> Result<PathRegexVc> {
    let server_path_value = &*server_path.await?;
    let path = if let Some(path) = server_root.await?.get_path_to(server_path_value) {
        path
    } else {
        bail!(
            "server_path ({}) is not in server_root ({})",
            server_path.to_string().await?,
            server_root.to_string().await?
        )
    };
    let path = if has_extension {
        path.rsplit_once('.')
            .ok_or_else(|| anyhow!("path ({}) has no extension", path))?
            .0
    } else {
        path
    };
    let path = if path == "index" {
        ""
    } else {
        path.strip_suffix("/index").unwrap_or(path)
    };
    let mut path_regex = PathRegexBuilder::new();
    for segment in path.split('/') {
        if let Some(segment) = segment.strip_prefix('[') {
            if let Some(segment) = segment.strip_prefix("[...") {
                if let Some((placeholder, rem)) = segment.split_once("]]") {
                    path_regex.push_optional_catch_all(placeholder, rem);
                } else {
                    bail!(
                        "path ({}) contains '[[' without matching ']]' at '[[...{}'",
                        path,
                        segment
                    );
                }
            } else if let Some(segment) = segment.strip_prefix("...") {
                if let Some((placeholder, rem)) = segment.split_once(']') {
                    path_regex.push_catch_all(placeholder, rem);
                } else {
                    bail!(
                        "path ({}) contains '[' without matching ']' at '[...{}'",
                        path,
                        segment
                    );
                }
            } else if let Some((placeholder, rem)) = segment.split_once(']') {
                path_regex.push_dynamic_segment(placeholder, rem);
            } else {
                bail!(
                    "path ({}) contains '[' without matching ']' at '[{}'",
                    path,
                    segment
                );
            }
        } else {
            path_regex.push_static_segment(segment);
        }
    }
    Ok(PathRegexVc::cell(path_regex.build()?))
}
