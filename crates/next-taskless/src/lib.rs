#![doc = include_str!("../README.md")]

mod constants;
mod patterns;

use std::sync::LazyLock;

use anyhow::{Context, Result, bail};
pub use constants::*;
pub use patterns::*;
use regex::Regex;
use turbo_unix_path::{get_parent_path, get_relative_path_to, join_path, normalize_path};

/// Given a next.js template file's contents, replaces `replacements` and `injections` and makes
/// sure there are none left over.
///
/// See `packages/next/src/build/templates/` for examples.
///
/// Paths should be unix or node.js-style paths where `/` is used as the path separator. They should
/// not be windows-style paths.
pub fn expand_next_js_template<'a>(
    content: &str,
    template_path: &str,
    next_package_dir_path: &str,
    replacements: impl IntoIterator<Item = (&'a str, &'a str)>,
    injections: impl IntoIterator<Item = (&'a str, &'a str)>,
    imports: impl IntoIterator<Item = (&'a str, Option<&'a str>)>,
) -> Result<String> {
    let template_parent_path = normalize_path(get_parent_path(template_path))
        .context("failed to normalize template path")?;
    let next_package_dir_parent_path = normalize_path(get_parent_path(next_package_dir_path))
        .context("failed to normalize package dir path")?;

    /// See [regex::Regex::replace_all].
    fn replace_all<E>(
        re: &regex::Regex,
        haystack: &str,
        mut replacement: impl FnMut(&regex::Captures<'_>) -> Result<String, E>,
    ) -> Result<String, E> {
        let mut new = String::with_capacity(haystack.len());
        let mut last_match = 0;
        for caps in re.captures_iter(haystack) {
            let m = caps.get(0).unwrap();
            new.push_str(&haystack[last_match..m.start()]);
            new.push_str(&replacement(&caps)?);
            last_match = m.end();
        }
        new.push_str(&haystack[last_match..]);
        Ok(new)
    }

    // Update the relative imports to be absolute. This will update any relative imports to be
    // relative to the root of the `next` package.
    static IMPORT_PATH_RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new("(?:from '(\\..*)'|import '(\\..*)')").unwrap());

    let mut count = 0;
    let mut content = replace_all(&IMPORT_PATH_RE, content, |caps| {
        let from_request = caps.get(1).map_or("", |c| c.as_str());
        count += 1;
        let is_from_request = !from_request.is_empty();

        let imported_path = join_path(
            &template_parent_path,
            if is_from_request {
                from_request
            } else {
                caps.get(2).context("import path must exist")?.as_str()
            },
        )
        .context("path should not leave the fs")?;

        let relative = get_relative_path_to(&next_package_dir_parent_path, &imported_path);

        if !relative.starts_with("./next/") {
            bail!(
                "Invariant: Expected relative import to start with \"./next/\", found \
                 {relative:?}. Path computed from {next_package_dir_parent_path:?} to \
                 {imported_path:?}.",
            )
        }

        let relative = relative
            .strip_prefix("./")
            .context("should be able to strip the prefix")?;

        Ok(if is_from_request {
            format!("from {}", serde_json::to_string(relative).unwrap())
        } else {
            format!("import {}", serde_json::to_string(relative).unwrap())
        })
    })
    .context("replacing imports failed")?;

    // Verify that at least one import was replaced. It's the case today where every template file
    // has at least one import to update, so this ensures that we don't accidentally remove the
    // import replacement code or use the wrong template file.
    if count == 0 {
        bail!("Invariant: Expected to replace at least one import")
    }

    // Replace all the template variables with the actual values. If a template variable is missing,
    // throw an error.
    let mut missing_replacements = Vec::new();
    for (key, replacement) in replacements {
        let full = format!("'{key}'");

        if content.contains(&full) {
            content = content.replace(&full, &serde_json::to_string(&replacement).unwrap());
        } else {
            missing_replacements.push(key)
        }
    }

    // Check to see if there's any remaining template variables.
    static TEMPLATE_VAR_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new("VAR_[A-Z_]+").unwrap());
    let mut matches = TEMPLATE_VAR_RE.find_iter(&content).peekable();

    if matches.peek().is_some() {
        bail!(
            "Invariant: Expected to replace all template variables, found {}",
            matches.map(|m| m.as_str()).collect::<Vec<_>>().join(", "),
        )
    }

    // Check to see if any template variable was provided but not used.
    if !missing_replacements.is_empty() {
        bail!(
            "Invariant: Expected to replace all template variables, missing {} in template",
            missing_replacements.join(", "),
        )
    }

    // Replace the injections.
    let mut missing_injections = Vec::new();
    for (key, injection) in injections {
        let full = format!("// INJECT:{key}");

        if content.contains(&full) {
            content = content.replace(&full, &format!("const {key} = {injection}"));
        } else {
            missing_injections.push(key);
        }
    }

    // Check to see if there's any remaining injections.
    static INJECT_RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new("// INJECT:[A-Za-z0-9_]+").unwrap());
    let mut matches = INJECT_RE.find_iter(&content).peekable();

    if matches.peek().is_some() {
        bail!(
            "Invariant: Expected to inject all injections, found {}",
            matches.map(|m| m.as_str()).collect::<Vec<_>>().join(", "),
        )
    }

    // Check to see if any injection was provided but not used.
    if !missing_injections.is_empty() {
        bail!(
            "Invariant: Expected to inject all injections, missing {} in template",
            missing_injections.join(", "),
        )
    }

    // Replace the optional imports.
    let mut missing_imports = Vec::new();
    for (key, import_path) in imports {
        let mut full = format!("// OPTIONAL_IMPORT:{key}");
        let namespace = if !content.contains(&full) {
            full = format!("// OPTIONAL_IMPORT:* as {key}");
            if content.contains(&full) {
                true
            } else {
                missing_imports.push(key);
                continue;
            }
        } else {
            false
        };

        if let Some(path) = import_path {
            content = content.replace(
                &full,
                &format!(
                    "import {}{} from {}",
                    if namespace { "* as " } else { "" },
                    key,
                    serde_json::to_string(&path).unwrap(),
                ),
            );
        } else {
            content = content.replace(&full, &format!("const {key} = null"));
        }
    }

    // Check to see if there's any remaining imports.
    static OPTIONAL_IMPORT_RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new("// OPTIONAL_IMPORT:(\\* as )?[A-Za-z0-9_]+").unwrap());
    let mut matches = OPTIONAL_IMPORT_RE.find_iter(&content).peekable();

    if matches.peek().is_some() {
        bail!(
            "Invariant: Expected to inject all imports, found {}",
            matches.map(|m| m.as_str()).collect::<Vec<_>>().join(", "),
        )
    }

    // Check to see if any import was provided but not used.
    if !missing_imports.is_empty() {
        bail!(
            "Invariant: Expected to inject all imports, missing {} in template",
            missing_imports.join(", "),
        )
    }

    // Ensure that the last line is a newline.
    if !content.ends_with('\n') {
        content.push('\n');
    }

    Ok(content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_expand_next_js_template() {
        let input = r#"
            import '../../foo/bar';
            import * as userlandPage from 'VAR_USERLAND'
            // OPTIONAL_IMPORT:* as userland500Page
            // OPTIONAL_IMPORT:incrementalCacheHandler

            // INJECT:nextConfig
            const srcPage = 'VAR_PAGE'
        "#;

        let expected = r#"
            import "next/src/foo/bar";
            import * as userlandPage from "INNER_PAGE_ENTRY"
            import * as userland500Page from "INNER_ERROR_500"
            const incrementalCacheHandler = null

            const nextConfig = {}
            const srcPage = "./some/path.js"
        "#;

        let output = expand_next_js_template(
            input,
            "project/node_modules/next/src/build/templates/test-case.js",
            "project/node_modules/next",
            [
                ("VAR_USERLAND", "INNER_PAGE_ENTRY"),
                ("VAR_PAGE", "./some/path.js"),
            ],
            [("nextConfig", "{}")],
            [
                ("incrementalCacheHandler", None),
                ("userland500Page", Some("INNER_ERROR_500")),
            ],
        )
        .unwrap();
        println!("{output}");

        assert_eq!(output.trim_end(), expected.trim_end());
    }
}
