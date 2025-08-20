use std::{
  path::Path,
  sync::{Arc, LazyLock},
};

use rspack_core::{
  ApplyContext, CompilerOptions, DependencyCategory, ExternalItem, ExternalItemFnCtx,
  ExternalItemFnResult, ExternalItemObject, ExternalItemValue, Plugin, PluginContext,
  ResolveOptionsWithDependencyType, ResolveResult,
};
use rspack_error::ToStringResultToRspackResultExt;
use rspack_hook::plugin;
use rspack_plugin_externals::ExternalsPlugin;
use rspack_regex::RspackRegex;
use rustc_hash::{FxHashMap, FxHashSet};

use crate::{config_shared::NextConfigComplete, handle_externals::ExternalHandler};

static SUPPORTED_NATIVE_MODULES: &[&str] = &["buffer", "events", "assert", "util", "async_hooks"];

static SUPPORTED_EDGE_POLYFILLS: LazyLock<FxHashSet<&'static str>> =
  LazyLock::new(|| SUPPORTED_NATIVE_MODULES.iter().copied().collect());

fn get_edge_polyfilled_modules() -> ExternalItem {
  let mut externals = ExternalItemObject::default();
  for &module in SUPPORTED_NATIVE_MODULES {
    externals.insert(
      module.to_string(),
      ExternalItemValue::String(format!("commonjs node:{module}")),
    );
    externals.insert(
      format!("node:{module}"),
      ExternalItemValue::String(format!("commonjs node:{module}")),
    );
  }
  ExternalItem::Object(externals)
}

fn is_node_js_module(module_name: &str, builtin_modules: &[String]) -> bool {
  builtin_modules
    .iter()
    .any(|builtin_module| builtin_module == module_name)
}

fn is_supported_edge_polyfill(module_name: &str) -> bool {
  SUPPORTED_EDGE_POLYFILLS.contains(module_name)
}

async fn handle_webpack_external_for_edge_runtime(
  ctx: ExternalItemFnCtx,
  builtin_modules: Arc<Vec<String>>,
) -> rspack_error::Result<ExternalItemFnResult> {
  let is_middleware_or_api_edge = match &ctx.context_info.issuer_layer {
    Some(layer) => layer == "middleware" || layer == "api-edge",
    None => false,
  };

  let result = if is_middleware_or_api_edge
    && is_node_js_module(&ctx.request, &builtin_modules)
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
  pub builtin_modules: Vec<String>,
  pub opt_out_bundling_package_regex: RspackRegex,
  pub final_transpile_packages: Vec<String>,
  pub dir: String,
  pub default_overrides: FxHashMap<String, String>,
}

#[derive(Debug)]
#[plugin]
pub struct NextExternalsPlugin {
  compiler_type: String,
  builtin_modules: Arc<Vec<String>>,
  external_handler: Arc<ExternalHandler>,
}

impl NextExternalsPlugin {
  #[allow(dead_code)]
  pub fn new(options: NextExternalsPluginOptions) -> Self {
    let NextExternalsPluginOptions {
      compiler_type,
      config,
      builtin_modules,
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

    Self::new_inner(
      compiler_type,
      Arc::new(builtin_modules),
      Arc::new(external_handler),
    )
  }
}

impl Plugin for NextExternalsPlugin {
  fn name(&self) -> &'static str {
    "NextExternalsPlugin"
  }

  fn apply(
    &self,
    ctx: PluginContext<&mut ApplyContext>,
    options: &CompilerOptions,
  ) -> rspack_error::Result<()> {
    let is_client = self.compiler_type == "client";
    let is_edge_server = self.compiler_type == "edge-server";

    let external_type = if is_client || is_edge_server {
      "assign".to_string()
    } else {
      "commonjs2".to_string()
    };

    let builtin_modules = self.builtin_modules.clone();
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
            let builtin_modules = builtin_modules.clone();
            Box::pin(
              async move { handle_webpack_external_for_edge_runtime(ctx, builtin_modules).await },
            )
          })),
        ]
      } else {
        vec![ExternalItem::String("next".to_string())]
      }
    } else {
      let external_handler = self.external_handler.clone();
      self
        .builtin_modules
        .iter()
        .map(|module| ExternalItem::String(module.to_string()))
        .chain([ExternalItem::Fn(Box::new(move |ctx| {
          let external_handler = external_handler.clone();
          let result = Box::pin(async move {
            let external_result = external_handler
              .handle_externals(
                ctx.context,
                ctx.request,
                &ctx.dependency_type,
                ctx.context_info.issuer_layer.as_deref(),
                Arc::new(move |options: Option<ResolveOptionsWithDependencyType>| {
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
                            resource.description_data.as_ref().is_some_and(|description_data| {
                              if let Some(object) = description_data.json().as_object() {
                                object.get("type").is_some_and(|v| v.as_str() == Some("module"))
                              } else {
                                false
                              }
                            })
                          } else {
                            resource.path.as_str().ends_with(".mjs")
                          };
                          (Some(resource.full_path()), is_esm)
                        }
                        ResolveResult::Ignored => (None, false),
                      })
                    })
                  })
                }),
              )
              .await?;
            Ok(ExternalItemFnResult {
              external_type: None,
              result: external_result.map(ExternalItemValue::String),
            })
          });
          result
        }))])
        .collect::<Vec<_>>()
    };

    ExternalsPlugin::new(external_type, externals)
      .apply(PluginContext::with_context(ctx.context), options)?;

    Ok(())
  }
}
