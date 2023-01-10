use anyhow::{anyhow, bail, Result};
use turbo_tasks::{primitives::StringVc, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::condition::ContextCondition;
use turbopack_node::path_regex::{PathRegexBuilder, PathRegexVc};

use crate::next_config::NextConfigVc;

/// Converts a filename within the server root into a next pathname.
#[turbo_tasks::function]
pub async fn pathname_for_path(
    server_root: FileSystemPathVc,
    server_path: FileSystemPathVc,
    has_extension: bool,
) -> Result<StringVc> {
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

    Ok(StringVc::cell(path.to_string()))
}

/// Converts a filename within the server root into a regular expression with
/// named capture groups for every dynamic segment.
#[turbo_tasks::function]
pub async fn regular_expression_for_path(pathname: StringVc) -> Result<PathRegexVc> {
    let path = pathname.await?;

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

// Adapted from https://github.com/vercel/next.js/blob/canary/packages/next/shared/lib/router/utils/get-asset-path-from-route.ts
pub fn get_asset_path_from_route(route: &str, ext: &str) -> String {
    if route.is_empty() {
        format!("index{}", ext)
    } else if route == "index" || route.starts_with("index/") {
        format!("index/{}{}", route, ext)
    } else {
        format!("{}{}", route, ext)
    }
}

pub async fn foreign_code_context_condition(next_config: NextConfigVc) -> Result<ContextCondition> {
    let transpile_packages = next_config.transpile_packages().await?;
    let result = if transpile_packages.is_empty() {
        ContextCondition::InDirectory("node_modules".to_string())
    } else {
        ContextCondition::all(vec![
            ContextCondition::InDirectory("node_modules".to_string()),
            ContextCondition::not(ContextCondition::any(
                transpile_packages
                    .iter()
                    .map(|package| ContextCondition::InDirectory(format!("node_modules/{package}")))
                    .collect(),
            )),
        ])
    };
    Ok(result)
}
