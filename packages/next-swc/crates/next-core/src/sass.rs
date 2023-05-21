use anyhow::Result;
use turbo_tasks::primitives::JsonValueVc;
use turbopack_binding::turbopack::{
    node::transforms::webpack::{WebpackLoaderConfigItem, WebpackLoaderConfigItemsVc},
    turbopack::module_options::WebpackLoadersOptionsVc,
};

#[turbo_tasks::function]
pub async fn maybe_add_sass_loader(
    sass_options: JsonValueVc,
    webpack_options: WebpackLoadersOptionsVc,
) -> Result<WebpackLoadersOptionsVc> {
    let mut options = (*webpack_options.await?).clone();

    let sass_options = sass_options.await?.as_object().unwrap().clone();
    for ext in [".scss", ".sass"] {
        let loader = WebpackLoaderConfigItem::LoaderNameWithOptions {
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

        options.extension_to_loaders.insert(
            ext.to_owned(),
            if options.extension_to_loaders.contains_key(ext) {
                let mut new_configs = (*(options.extension_to_loaders[ext].await?)).clone();
                new_configs.push(loader);
                WebpackLoaderConfigItemsVc::cell(new_configs)
            } else {
                WebpackLoaderConfigItemsVc::cell(vec![loader])
            },
        );
    }

    Ok(options.cell())
}
