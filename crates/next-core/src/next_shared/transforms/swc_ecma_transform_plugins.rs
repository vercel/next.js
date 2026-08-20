use anyhow::Result;
use turbo_rcstr::RcStr;
#[cfg(not(target_family = "wasm"))]
use turbo_tasks::ResolvedVc;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::ModuleRule;
#[cfg(not(target_family = "wasm"))]
use turbopack_ecmascript::{CustomTransformer, TransformPlugin};

use crate::next_config::NextConfig;

// Everything below only backs the native implementation of `get_swc_ecma_transform_rule_impl`; on
// wasm that function is a stub, because SWC wasm plugins need the wasmtime backend.
#[cfg(not(target_family = "wasm"))]
mod native_types {
    use bincode::{Decode, Encode};
    use serde::{Deserialize, Serialize};
    use turbo_tasks::trace::TraceRawVcs;

    /// A wrapper around [`serde_json::Value`] that implements [`turbo_tasks::TaskInput`].
    ///
    /// [`serde_json::Value`] does not implement [`std::hash::Hash`], so we implement it manually by
    /// hashing the serialized JSON string.
    #[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, Encode, Decode)]
    pub struct JsonValue(
        #[bincode(with = "turbo_bincode::serde_self_describing")] pub serde_json::Value,
    );

    impl std::hash::Hash for JsonValue {
        fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
            serde_json::to_string(&self.0)
                .expect("JSON serialization should never fail")
                .hash(state);
        }
    }

    // Manual impl because `serde_json::Value` doesn't implement `TaskInput`, but `JsonValue` can
    // never contain any `Vc` types.
    impl turbo_tasks::TaskInput for JsonValue {
        fn is_transient(&self) -> bool {
            false
        }
    }
}

#[cfg(not(target_family = "wasm"))]
pub use native_types::JsonValue;

pub async fn get_swc_ecma_transform_plugin_rule(
    next_config: Vc<NextConfig>,
    project_path: FileSystemPath,
) -> Result<Option<ModuleRule>> {
    let plugin_configs = next_config.experimental_swc_plugins().await?;
    if !plugin_configs.is_empty() {
        let enable_mdx_rs = next_config.mdx_rs().await?.is_some();
        get_swc_ecma_transform_rule_impl(project_path, &plugin_configs, enable_mdx_rs).await
    } else {
        Ok(None)
    }
}

/// SWC wasm plugins are not available when Next.js itself is built for wasm: executing them needs
/// the wasmtime backend, which cannot be hosted inside wasm. SWC skips plugin transforms on wasm32
/// for the same reason, see <https://github.com/swc-project/swc/issues/3934>.
#[cfg(target_family = "wasm")]
pub async fn get_swc_ecma_transform_rule_impl(
    _project_path: FileSystemPath,
    _plugin_configs: &[(RcStr, serde_json::Value)],
    _enable_mdx_rs: bool,
) -> Result<Option<ModuleRule>> {
    Ok(None)
}

#[cfg(not(target_family = "wasm"))]
pub async fn get_swc_ecma_transform_rule_impl(
    project_path: FileSystemPath,
    plugin_configs: &[(RcStr, serde_json::Value)],
    enable_mdx_rs: bool,
) -> Result<Option<ModuleRule>> {
    use anyhow::bail;
    use turbo_tasks::TryFlatJoinIterExt;
    use turbo_tasks_fs::FileContent;
    use turbopack_core::{
        asset::Asset,
        module::Module,
        reference_type::{CommonJsReferenceSubType, ReferenceType},
        resolve::{ResolveErrorMode, error::handle_resolve_error, parse::Request, resolve},
    };
    use turbopack_ecmascript_plugins::transform::swc_ecma_transform_plugins::SwcPluginModule;
    use turbopack_resolve::{
        resolve::resolve_options, resolve_options_context::ResolveOptionsContext,
    };

    use crate::next_shared::transforms::{EcmascriptTransformStage, get_ecma_transform_rule};

    let plugins = plugin_configs
        .iter()
        .map(|(name, config)| {
            let project_path = project_path.clone();

            async move {
                // [TODO]: SWC's current experimental config supports
                // two forms of plugin path,
                // one for implicit package name resolves to node_modules,
                // and one for explicit path to a .wasm binary.
                // Current resolve will fail with latter.
                let request = Request::parse_string(name.clone());
                let resolve_options = resolve_options(
                    project_path.clone(),
                    ResolveOptionsContext {
                        enable_node_modules: Some(project_path.root().owned().await?),
                        enable_node_native_modules: true,
                        ..Default::default()
                    }
                    .cell(),
                );

                let plugin_wasm_module_resolve_result = handle_resolve_error(
                    resolve(
                        project_path.clone(),
                        ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined),
                        request,
                        resolve_options,
                    )
                    .as_raw_module_result(),
                    ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined),
                    // TODO proper error location
                    project_path.clone(),
                    request,
                    resolve_options,
                    ResolveErrorMode::Error,
                    // TODO proper error location
                    None,
                )
                .await?;

                let Some(plugin_module) = plugin_wasm_module_resolve_result
                    .await?
                    .first_module()
                    .await?
                else {
                    // Ignore unresolvable plugin modules, handle_resolve_error has already emitted
                    // an issue.
                    return Ok(None);
                };

                let Some(plugin_source) = &*plugin_module.source().await? else {
                    turbo_tasks::turbobail!(
                        "Expected source for plugin module: {}",
                        plugin_module.ident()
                    );
                };

                let content = &*plugin_source.content().file_content().await?;
                let FileContent::Content(file) = content else {
                    bail!("Expected file content for plugin module");
                };

                Ok(Some((
                    SwcPluginModule::new(name.clone(), file.content().to_bytes().to_vec())
                        .resolved_cell(),
                    JsonValue(config.clone()),
                )))
            }
        })
        .try_flat_join()
        .await?;

    Ok(Some(get_ecma_transform_rule(
        swc_ecma_transform_plugins_transform_plugin(plugins)
            .to_resolved()
            .await?,
        enable_mdx_rs,
        EcmascriptTransformStage::Main,
    )))
}

#[cfg(not(target_family = "wasm"))]
#[turbo_tasks::function]
fn swc_ecma_transform_plugins_transform_plugin(
    plugins: Vec<(
        ResolvedVc<
            turbopack_ecmascript_plugins::transform::swc_ecma_transform_plugins::SwcPluginModule,
        >,
        JsonValue,
    )>,
) -> Vc<TransformPlugin> {
    use turbopack_ecmascript_plugins::transform::swc_ecma_transform_plugins::SwcEcmaTransformPluginsTransformer;
    Vc::cell(Box::new(SwcEcmaTransformPluginsTransformer::new(
        plugins.into_iter().map(|(m, v)| (m, v.0)).collect(),
    )) as Box<dyn CustomTransformer + Send + Sync>)
}
