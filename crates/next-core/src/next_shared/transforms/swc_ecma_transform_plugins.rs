use anyhow::Result;
#[allow(unused_imports)]
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::ModuleRule;

use crate::next_config::NextConfig;

pub async fn get_swc_ecma_transform_plugin_rule(
    next_config: Vc<NextConfig>,
    project_path: ResolvedVc<FileSystemPath>,
) -> Result<Option<ModuleRule>> {
    let plugin_configs = next_config.experimental_swc_plugins().await?;
    if !plugin_configs.is_empty() {
        #[cfg(feature = "plugin")]
        {
            let enable_mdx_rs = next_config.mdx_rs().await?.is_some();
            get_swc_ecma_transform_rule_impl(project_path, &plugin_configs, enable_mdx_rs).await
        }

        #[cfg(not(feature = "plugin"))]
        {
            let _ = project_path; // To satisfiy lint
            Ok(None)
        }
    } else {
        Ok(None)
    }
}

#[cfg(feature = "plugin")]
pub async fn get_swc_ecma_transform_rule_impl(
    project_path: ResolvedVc<FileSystemPath>,
    plugin_configs: &[(RcStr, serde_json::Value)],
    enable_mdx_rs: bool,
) -> Result<Option<ModuleRule>> {
    use anyhow::{bail, Context};
    use turbo_tasks::{TryJoinIterExt, Value};
    use turbo_tasks_fs::FileContent;
    use turbopack::{resolve_options, resolve_options_context::ResolveOptionsContext};
    use turbopack_core::{
        asset::Asset,
        reference_type::{CommonJsReferenceSubType, ReferenceType},
        resolve::{handle_resolve_error, parse::Request, pattern::Pattern, resolve},
    };
    use turbopack_ecmascript_plugins::transform::swc_ecma_transform_plugins::{
        SwcEcmaTransformPluginsTransformer, SwcPluginModule,
    };

    use crate::next_shared::transforms::get_ecma_transform_rule;

    let plugins = plugin_configs
        .iter()
        .map(|(name, config)| async move {
            // [TODO]: SWC's current experimental config supports
            // two forms of plugin path,
            // one for implicit package name resolves to node_modules,
            // and one for explicit path to a .wasm binary.
            // Current resolve will fail with latter.
            let request = Request::parse(Value::new(Pattern::Constant(name.as_str().into())));
            let resolve_options = resolve_options(
                *project_path,
                ResolveOptionsContext {
                    enable_node_modules: Some(project_path.root().to_resolved().await?),
                    enable_node_native_modules: true,
                    ..Default::default()
                }
                .cell(),
            );

            let plugin_wasm_module_resolve_result = handle_resolve_error(
                resolve(
                    *project_path,
                    Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined)),
                    request,
                    resolve_options,
                )
                .as_raw_module_result(),
                Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined)),
                *project_path,
                request,
                resolve_options,
                false,
                None,
            )
            .await?;
            let plugin_module = plugin_wasm_module_resolve_result
                .first_module()
                .await?
                .context("Expected to find module")?;

            let content = &*plugin_module.content().file_content().await?;

            let FileContent::Content(file) = content else {
                bail!("Expected file content for plugin module");
            };

            Ok((
                SwcPluginModule::new(name, file.content().to_bytes()?.to_vec()).resolved_cell(),
                config.clone(),
            ))
        })
        .try_join()
        .await?;

    Ok(Some(get_ecma_transform_rule(
        Box::new(SwcEcmaTransformPluginsTransformer::new(plugins)),
        enable_mdx_rs,
        true,
    )))
}
