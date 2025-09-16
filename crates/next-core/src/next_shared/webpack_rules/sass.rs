use std::{mem::take, sync::LazyLock};

use anyhow::{Result, bail};
use regex::Regex;
use serde_json::Value as JsonValue;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::module_options::LoaderRuleItem;
use turbopack_node::transforms::webpack::WebpackLoaderItem;

// Try to match any reasonably-written glob pattern that might be intended to match `*.sass` or
// `*.scss` (e.g. isn't just a full wildcard match with no extension)
static SASS_GLOB_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"([\.*\}]|\{([^\}]*,)?)s([ac]|\[[ac]{2}\]|\{[ac,]{3}\})ss(,[^\}]*\}|\})?$").unwrap()
});

static SASS_LOADER_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(^|/)@?sass[-/]loader($|/|\.)").unwrap());

pub async fn detect_likely_sass_loader(
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
    sass_options: Vc<JsonValue>,
) -> Result<Vec<(RcStr, LoaderRuleItem)>> {
    let sass_options = sass_options.await?;
    let Some(mut sass_options) = sass_options.as_object().cloned() else {
        bail!("sass_options must be an object");
    };

    // TODO: Remove this once we upgrade to sass-loader 16
    let silence_deprecations = if let Some(v) = sass_options.get("silenceDeprecations") {
        v.clone()
    } else {
        serde_json::json!(["legacy-js-api"])
    };

    sass_options.insert("silenceDeprecations".into(), silence_deprecations);

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
