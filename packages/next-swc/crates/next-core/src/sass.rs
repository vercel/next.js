use anyhow::{bail, Result};
use serde_json::Value as JsonValue;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    node::transforms::webpack::WebpackLoaderItem,
    turbopack::module_options::{LoaderRuleItem, OptionWebpackRules, WebpackRules},
};

#[turbo_tasks::function]
pub async fn maybe_add_sass_loader(
    sass_options: Vc<JsonValue>,
    webpack_rules: Option<Vc<WebpackRules>>,
) -> Result<Vc<OptionWebpackRules>> {
    let sass_options = sass_options.await?;
    let Some(sass_options) = sass_options.as_object() else {
        bail!("sass_options must be an object");
    };
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
        let rule = rules.get_mut(pattern);
        let loader = WebpackLoaderItem {
            loader: "next/dist/compiled/sass-loader".to_string(),
            options: serde_json::json!({
                //https://github.com/vercel/turbo/blob/d527eb54be384a4658243304cecd547d09c05c6b/crates/turbopack-node/src/transforms/webpack.rs#L191
                "sourceMap": false,
                "sassOptions": sass_options,
            })
            .as_object()
            .unwrap()
            .clone(),
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
            loaders.push(loader);
            rule.loaders = Vc::cell(loaders);
        } else {
            rules.insert(
                pattern.to_string(),
                LoaderRuleItem {
                    loaders: Vc::cell(vec![loader]),
                    rename_as: Some(format!("*{rename}")),
                },
            );
        }
    }

    Ok(Vc::cell(Some(Vc::cell(rules))))
}
