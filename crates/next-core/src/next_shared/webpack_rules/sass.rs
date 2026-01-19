use std::{mem::take, sync::LazyLock};

use anyhow::{Result, bail};
use regex::Regex;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::LoaderRuleItem;
use turbopack_core::issue::IssueExt;
use turbopack_node::transforms::webpack::WebpackLoaderItem;

use crate::{
    next_config::NextConfig, next_shared::webpack_rules::ManuallyConfiguredBuiltinLoaderIssue,
};

// Try to match any reasonably-written glob pattern that might be intended to match `*.sass` or
// `*.scss` (e.g. isn't just a full wildcard match with no extension)
static SASS_GLOB_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"([\.*\}]|\{([^\}]*,)?)s([ac]|\[[ac]{2}\]|\{[ac,]{3}\})ss(,[^\}]*\}|\})?$").unwrap()
});

static SASS_LOADER_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(^|/)@?sass[-/]loader($|/|\.)").unwrap());

/// Detect manually-configured sass loaders. This is used to generate a warning, suggesting using
/// the built-in sass support.
async fn detect_likely_sass_loader(
    webpack_rules: &[(RcStr, LoaderRuleItem)],
) -> Result<Option<RcStr>> {
    for (glob, rule) in webpack_rules {
        if SASS_GLOB_RE.is_match(glob)
            || rule
                .loaders
                .await?
                .iter()
                .any(|item| SASS_LOADER_RE.is_match(&item.loader))
        {
            return Ok(Some(glob.clone()));
        }
    }
    Ok(None)
}

pub async fn get_sass_loader_rules(
    project_path: &FileSystemPath,
    next_config: Vc<NextConfig>,
    user_webpack_rules: &[(RcStr, LoaderRuleItem)],
) -> Result<Vec<(RcStr, LoaderRuleItem)>> {
    let use_builtin_sass = next_config
        .experimental_turbopack_use_builtin_sass()
        .await?;

    match *use_builtin_sass {
        Some(true) => {}
        Some(false) => return Ok(Vec::new()),
        None => {
            if let Some(glob) = detect_likely_sass_loader(user_webpack_rules).await? {
                ManuallyConfiguredBuiltinLoaderIssue {
                    glob,
                    loader: rcstr!("sass-loader"),
                    config_key: rcstr!("experimental.turbopackUseBuiltinSass"),
                    config_file_path: next_config
                        .config_file_path(project_path.clone())
                        .owned()
                        .await?,
                }
                .resolved_cell()
                .emit();
            }
        }
    }

    let sass_options = next_config.sass_config().await?;
    let Some(sass_options) = sass_options.as_object() else {
        bail!("sass_options must be an object");
    };

    // additionalData is a loader option but Next.js has it under `sassOptions` in
    // `next.config.js`
    let additional_data = sass_options
        .get("prependData")
        .or(sass_options.get("additionalData"));
    let sass_loader = WebpackLoaderItem {
        loader: rcstr!("next/dist/compiled/sass-loader"),
        options: take(
            serde_json::json!({
                "implementation": sass_options.get("implementation"),
                "sourceMap": true,
                "sassOptions": sass_options,
                "additionalData": additional_data
            })
            .as_object_mut()
            .unwrap(),
        ),
    };
    let resolve_url_loader = WebpackLoaderItem {
        loader: rcstr!("next/dist/build/webpack/loaders/resolve-url-loader/index"),
        options: take(
            serde_json::json!({
                // https://github.com/vercel/turbo/blob/d527eb54be384a4658243304cecd547d09c05c6b/crates/turbopack-node/src/transforms/webpack.rs#L191
                "sourceMap": true
            })
            .as_object_mut()
            .unwrap(),
        ),
    };

    let loaders = ResolvedVc::cell(vec![resolve_url_loader, sass_loader]);

    let mut rules = Vec::new();

    for (pattern, rename) in [
        (rcstr!("*.module.s[ac]ss"), rcstr!("*.module.css")),
        (rcstr!("*.s[ac]ss"), rcstr!("*.css")),
    ] {
        rules.push((
            pattern,
            LoaderRuleItem {
                loaders,
                rename_as: Some(rename),
                condition: None,
            },
        ));
    }

    Ok(rules)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sass_glob_regex() {
        let valid_patterns = vec![
            "foobar.scss",
            "foobar.sass",
            // Bracket expansion
            "*.s[ac]ss",
            "*.s[ca]ss",
            // Brace expansion
            "*.{scss}",
            "*.{sass}",
            "*.{ext,scss}",
            "*.{sass,ext}",
            // Brace expansion of a/c
            "*.s{a,c}ss",
            "*.s{c,a}ss",
            "*.{css,s{c,a}ss}",
            // Following a brace expansion
            "{foo.,bar.}sass",
        ];

        let invalid_patterns = vec!["*", "*.css", "*.scss.css", "endswithsass", "endswithscss"];

        for pattern in valid_patterns {
            assert!(
                SASS_GLOB_RE.is_match(pattern),
                "VALID pattern should match: {pattern:?}",
            );
        }

        for pattern in invalid_patterns {
            assert!(
                !SASS_GLOB_RE.is_match(pattern),
                "INVALID pattern should NOT match: {pattern:?}",
            );
        }
    }
}
