use std::{
    path::Path,
    sync::{Arc, LazyLock},
};

use next_taskless::{BUN_EXTERNALS, EDGE_NODE_EXTERNALS, NODE_EXTERNALS};
use rspack_core::{
    ApplyContext, DependencyCategory, ExternalItem, ExternalItemFnCtx, ExternalItemFnResult,
    ExternalItemObject, ExternalItemValue, Plugin, ResolveOptionsWithDependencyType, ResolveResult,
};
use rspack_error::ToStringResultToRspackResultExt;
use rspack_hook::plugin;
use rspack_plugin_externals::ExternalsPlugin;
use rspack_regex::RspackRegex;
use rustc_hash::{FxHashMap, FxHashSet};

use crate::{
    config_shared::NextConfigComplete,
    handle_externals::{ExternalHandler, ResolveFn},
};

static SUPPORTED_EDGE_POLYFILLS: LazyLock<FxHashSet<&'static str>> =
    LazyLock::new(|| EDGE_NODE_EXTERNALS.iter().copied().collect());

fn get_edge_polyfilled_modules() -> ExternalItem {
    ExternalItem::Object(
        EDGE_NODE_EXTERNALS
            .iter()
            .flat_map(|module| {
                [
                    (
                        module.to_string(),
                        ExternalItemValue::String(format!("commonjs node:{module}")),
                    ),
                    (
                        format!("node:{module}"),
                        ExternalItemValue::String(format!("commonjs node:{module}")),
                    ),
                ]
            })
            .collect::<ExternalItemObject>(),
    )
}

fn is_node_js_module(module_name: &str) -> bool {
    NODE_EXTERNALS
        .iter()
        .any(|builtin_module| *builtin_module == module_name)
        || BUN_EXTERNALS
            .iter()
            .any(|builtin_module| *builtin_module == module_name)
}

fn is_supported_edge_polyfill(module_name: &str) -> bool {
    SUPPORTED_EDGE_POLYFILLS.contains(module_name)
}

async fn handle_webpack_external_for_edge_runtime(
    ctx: ExternalItemFnCtx,
) -> rspack_error::Result<ExternalItemFnResult> {
    let is_middleware_or_api_edge = match &ctx.context_info.issuer_layer {
        Some(layer) => layer == "middleware" || layer == "api-edge",
        None => false,
    };

    let result = if is_middleware_or_api_edge
        && is_node_js_module(&ctx.request)
        && !is_supported_edge_polyfill(&ctx.request)
    {
        let resolver = ctx
            .resolver_factory
            .get(ctx.resolve_options_with_dependency_type);
        // Allow user to provide and use their polyfills, as we do with buffer.
        match resolver
            .resolve(Path::new(&ctx.context), &ctx.request)
            .await
        {
            Ok(_) => None,
            Err(_) => Some(ExternalItemValue::String(format!(
                "root globalThis.__import_unsupported('{}')",
                ctx.request
            ))),
        }
    } else {
        None
    };

    Ok(ExternalItemFnResult {
        external_type: None,
        result,
    })
}

#[derive(Debug)]
pub struct NextExternalsPluginOptions {
    pub compiler_type: String,
    pub config: NextConfigComplete,
    pub opt_out_bundling_package_regex: RspackRegex,
    pub final_transpile_packages: Vec<String>,
    pub dir: String,
    pub default_overrides: FxHashMap<String, String>,
}

#[derive(Debug)]
#[plugin]
pub struct NextExternalsPlugin {
    compiler_type: String,
    external_handler: Arc<ExternalHandler>,
}

impl NextExternalsPlugin {
    #[allow(dead_code)]
    pub fn new(options: NextExternalsPluginOptions) -> Self {
        let NextExternalsPluginOptions {
            compiler_type,
            config,
            opt_out_bundling_package_regex,
            final_transpile_packages,
            dir,
            default_overrides,
        } = options;

        let external_handler = ExternalHandler::new(
            config.clone(),
            opt_out_bundling_package_regex,
            final_transpile_packages,
            dir,
            default_overrides,
        );

        Self::new_inner(compiler_type, Arc::new(external_handler))
    }
}

impl Plugin for NextExternalsPlugin {
    fn name(&self) -> &'static str {
        "NextExternalsPlugin"
    }

    fn apply(&self, ctx: &mut ApplyContext<'_>) -> rspack_error::Result<()> {
        let is_client = self.compiler_type == "client";
        let is_edge_server = self.compiler_type == "edge-server";

        let external_type = if is_client || is_edge_server {
            "assign".to_string()
        } else {
            "commonjs2".to_string()
        };

        let externals = if is_client || is_edge_server {
            if is_edge_server {
                vec![
                    ExternalItem::String("next".to_string()),
                    ExternalItem::Object(FxHashMap::from_iter([
                        (
                            "@builder.io/partytown".to_string(),
                            ExternalItemValue::String("{}".to_string()),
                        ),
                        (
                            "next/dist/compiled/etag".to_string(),
                            ExternalItemValue::String("{}".to_string()),
                        ),
                    ])),
                    get_edge_polyfilled_modules(),
                    ExternalItem::Fn(Box::new(move |ctx| {
                        Box::pin(async move { handle_webpack_external_for_edge_runtime(ctx).await })
                    })),
                ]
            } else {
                vec![ExternalItem::String("next".to_string())]
            }
        } else {
            let external_handler = self.external_handler.clone();

            let external_fn = ExternalItem::Fn(Box::new(move |ctx| {
                let external_handler = external_handler.clone();

                let get_resolve: impl Fn(Option<ResolveOptionsWithDependencyType>) -> ResolveFn =
                    move |options: Option<ResolveOptionsWithDependencyType>| {
                        let first = ctx.resolve_options_with_dependency_type.clone();
                        let second = options.unwrap_or(ResolveOptionsWithDependencyType {
                            resolve_options: None,
                            resolve_to_context: false,
                            dependency_category: DependencyCategory::Unknown,
                        });

                        let merged_resolve_options = match second.resolve_options.as_ref() {
                            Some(second_resolve_options) => match first.resolve_options.as_ref() {
                                Some(first_resolve_options) => Some(Box::new(
                                    first_resolve_options
                                        .clone()
                                        .merge(*second_resolve_options.clone()),
                                )),
                                None => Some(second_resolve_options.clone()),
                            },
                            None => first.resolve_options.clone(),
                        };
                        let merged_options = ResolveOptionsWithDependencyType {
                            resolve_options: merged_resolve_options,
                            resolve_to_context: first.resolve_to_context,
                            dependency_category: first.dependency_category,
                        };
                        let resolver = ctx.resolver_factory.get(merged_options);

                        Box::new(move |resolve_context: String, request_to_resolve: String| {
                            let resolver = resolver.clone();
                            Box::pin(async move {
                                let resolve_result = resolver
                                    .resolve(Path::new(&resolve_context), &request_to_resolve)
                                    .await
                                    .to_rspack_result()?;
                                Ok(match resolve_result {
                                    ResolveResult::Resource(resource) => {
                                        let is_esm = if resource.path.as_str().ends_with(".js") {
                                            resource.description_data.as_ref().is_some_and(
                                                |description_data| {
                                                    if let Some(object) =
                                                        description_data.json().as_object()
                                                    {
                                                        object.get("type").is_some_and(|v| {
                                                            v.as_str() == Some("module")
                                                        })
                                                    } else {
                                                        false
                                                    }
                                                },
                                            )
                                        } else {
                                            resource.path.as_str().ends_with(".mjs")
                                        };
                                        (Some(resource.full_path()), is_esm)
                                    }
                                    ResolveResult::Ignored => (None, false),
                                })
                            })
                        })
                    };

                Box::pin(async move {
                    let external_result = external_handler
                        .handle_externals(
                            ctx.context,
                            ctx.request,
                            &ctx.dependency_type,
                            ctx.context_info.issuer_layer.as_deref(),
                            &get_resolve,
                        )
                        .await?;
                    Ok(ExternalItemFnResult {
                        external_type: None,
                        result: external_result.map(ExternalItemValue::String),
                    })
                })
            }));

            NODE_EXTERNALS
                .iter()
                .chain(BUN_EXTERNALS.iter())
                .map(|module| ExternalItem::String(module.to_string()))
                .chain([external_fn])
                .collect::<Vec<_>>()
        };

        ExternalsPlugin::new(external_type, externals, false).apply(ctx)?;

        Ok(())
    }
}
