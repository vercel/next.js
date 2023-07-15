use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_binding::turbopack::ecmascript::OptionTransformPlugin;

use crate::next_config::NextConfig;

#[turbo_tasks::function]
pub async fn get_swc_ecma_transform_plugin(
    project_path: Vc<FileSystemPath>,
    next_config: Vc<NextConfig>,
) -> Result<Vc<OptionTransformPlugin>> {
    let config = next_config.await?;
    match config.experimental.swc_plugins.as_ref() {
        Some(plugin_configs) if !plugin_configs.is_empty() => {
            #[cfg(feature = "plugin")]
            {
                return get_swc_ecma_transform_plugin_impl(project_path, plugin_configs).await;
            }

            #[cfg(not(feature = "plugin"))]
            {
                let _ = project_path;
                return Ok(Vc::cell(None));
            }
        }
        _ => Ok(Vc::cell(None)),
    }
}

#[cfg(feature = "plugin")]
pub async fn get_swc_ecma_transform_plugin_impl(
    project_path: Vc<FileSystemPath>,
    plugin_configs: &[(String, serde_json::Value)],
) -> Result<Vc<OptionTransformPlugin>> {
    use anyhow::{bail, Context};
    use turbo_tasks::{Value, Vc};
    use turbo_tasks_fs::FileContent;
    use turbopack_binding::turbopack::{
        core::{
            asset::Asset,
            issue::{IssueSeverity, OptionIssueSource},
            reference_type::ReferenceType,
            resolve::{
                handle_resolve_error, parse::Request, pattern::Pattern, resolve,
                PrimaryResolveResult,
            },
        },
        ecmascript::{OptionTransformPlugin, TransformPlugin},
        ecmascript_plugin::transform::swc_ecma_transform_plugins::{
            SwcEcmaTransformPluginsTransformer, SwcPluginModule,
        },
        turbopack::{resolve_options, resolve_options_context::ResolveOptionsContext},
    };

    let mut plugins = vec![];
    for (name, config) in plugin_configs.iter() {
        // [TODO]: SWC's current experimental config supports
        // two forms of plugin path,
        // one for implicit package name resolves to node_modules,
        // and one for explicit path to a .wasm binary.
        // Current resolve will fail with latter.
        let request = Request::parse(Value::new(Pattern::Constant(name.to_string())));
        let resolve_options = resolve_options(
            project_path,
            ResolveOptionsContext {
                enable_node_modules: Some(project_path.root().resolve().await?),
                enable_node_native_modules: true,
                ..Default::default()
            }
            .cell(),
        );

        let plugin_wasm_module_resolve_result = handle_resolve_error(
            resolve(project_path, request, resolve_options),
            Value::new(ReferenceType::Undefined),
            project_path,
            request,
            resolve_options,
            OptionIssueSource::none(),
            IssueSeverity::Error.cell(),
        )
        .await?;
        let plugin_wasm_module_resolve_result = &*plugin_wasm_module_resolve_result.await?;

        let primary = plugin_wasm_module_resolve_result
            .primary
            .first()
            .context("Unable to resolve primary context")?;

        let PrimaryResolveResult::Asset(plugin_module_asset) = primary else {
            bail!("Expected to find asset");
        };

        let content = &*plugin_module_asset.content().file_content().await?;

        let FileContent::Content(file) = content else {
            bail!("Expected file content for plugin module");
        };

        plugins.push((
            SwcPluginModule::cell(SwcPluginModule::new(
                name,
                file.content().to_bytes()?.to_vec(),
            )),
            config.clone(),
        ));
    }

    return Ok(Vc::cell(Some(TransformPlugin::cell(Box::new(
        SwcEcmaTransformPluginsTransformer::new(plugins),
    )))));
}
