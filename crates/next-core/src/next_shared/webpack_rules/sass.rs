use std::mem::take;

use anyhow::{bail, Result};
use semver::Version;
use serde_json::Value as JsonValue;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::module_options::{LoaderRuleItem, OptionWebpackRules, WebpackRules};
use turbopack_core::{
    reference_type::ReferenceType,
    resolve::{node::node_cjs_resolve_options, parse::Request::Module, resolve},
};
use turbopack_node::transforms::webpack::WebpackLoaderItem;

#[turbo_tasks::function]
pub async fn maybe_add_sass_loader(
    sass_options: Vc<JsonValue>,
    webpack_rules: Option<Vc<WebpackRules>>,
) -> Result<Vc<OptionWebpackRules>> {
    let sass_options = sass_options.await?;
    let Some(mut sass_options) = sass_options.as_object().cloned() else {
        bail!("sass_options must be an object");
    };

    // Since sass is an optional peer dependency, it may be missing.
    let sass_version =
        Version::parse(&resolve_from::resolve_from(".", "sass").unwrap_or_default())?;
    // The modern Sass API with breaking changes was added in sass@1.45.0.
    // https://sass-lang.com/documentation/breaking-changes/legacy-js-api
    // Since sass-loader and our peer dependency sass version is ^1.3.0,
    // we need to use the legacy Sass API for versions less than 1.45.0.
    let should_use_legacy_sass_api = sass_version < Version::parse("1.45.0")?;

    // TODO(jiwon): Once the peer dependency for sass is upgraded to >= 1.45.0, we can remove this.
    sass_options.insert(
        "api".into(),
        serde_json::json!(if should_use_legacy_sass_api {
            "legacy"
        } else {
            "modern"
        }),
    );
    let mut rules = if let Some(webpack_rules) = webpack_rules {
        webpack_rules.await?.clone_value()
    } else {
        Default::default()
    };
    for (pattern, rename) in [
        ("*.module.scss", ".module.css"),
        ("*.module.sass", ".module.css"),
        ("*.scss", ".css"),
        ("*.sass", ".css"),
    ] {
        // additionalData is a loader option but Next.js has it under `sassOptions` in
        // `next.config.js`
        let additional_data = sass_options
            .get("prependData")
            .or(sass_options.get("additionalData"));
        let rule = rules.get_mut(pattern);
        let sass_loader = WebpackLoaderItem {
            loader: "next/dist/compiled/sass-loader".into(),
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
            loader: "next/dist/build/webpack/loaders/resolve-url-loader/index".into(),
            options: take(
                serde_json::json!({
                    //https://github.com/vercel/turbo/blob/d527eb54be384a4658243304cecd547d09c05c6b/crates/turbopack-node/src/transforms/webpack.rs#L191
                    "sourceMap": true
                })
                .as_object_mut()
                .unwrap(),
            ),
        };

        if let Some(rule) = rule {
            // Without `as`, loader result would be JS code, so we don't want to apply
            // sass-loader on that.
            let Some(rename_as) = rule.rename_as.as_ref() else {
                continue;
            };
            // Only when the result should run through the sass pipeline, we apply
            // sass-loader.
            if rename_as != "*" {
                continue;
            }
            let mut loaders = rule.loaders.await?.clone_value();
            loaders.push(resolve_url_loader);
            loaders.push(sass_loader);
            rule.loaders = ResolvedVc::cell(loaders);
        } else {
            rules.insert(
                pattern.into(),
                LoaderRuleItem {
                    loaders: ResolvedVc::cell(vec![resolve_url_loader, sass_loader]),
                    rename_as: Some(format!("*{rename}").into()),
                },
            );
        }
    }

    Ok(Vc::cell(Some(ResolvedVc::cell(rules))))
}
