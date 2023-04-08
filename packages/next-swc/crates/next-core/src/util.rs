use anyhow::{anyhow, bail, Context, Result};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use swc_core::ecma::ast::Program;
use turbo_binding::{
    turbo::tasks_fs::{json::parse_json_rope_with_source_context, FileContent, FileSystemPathVc},
    turbopack::{
        core::{
            asset::{Asset, AssetVc},
            ident::AssetIdentVc,
            issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc, OptionIssueSourceVc},
            reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
            resolve::{
                self, handle_resolve_error, node::node_cjs_resolve_options, parse::RequestVc,
                pattern::QueryMapVc, PrimaryResolveResult,
            },
        },
        ecmascript::{
            analyzer::{JsValue, ObjectPart},
            parse::ParseResult,
            EcmascriptModuleAssetVc,
        },
        turbopack::condition::ContextCondition,
    },
};
use turbo_tasks::{primitives::StringVc, trace::TraceRawVcs, Value, ValueToString};

use crate::next_config::NextConfigVc;

/// Converts a filename within the server root into a next pathname.
#[turbo_tasks::function]
pub async fn pathname_for_path(
    server_root: FileSystemPathVc,
    server_path: FileSystemPathVc,
    has_extension: bool,
    data: bool,
) -> Result<StringVc> {
    let server_path_value = &*server_path.await?;
    let path = if let Some(path) = server_root.await?.get_path_to(server_path_value) {
        path
    } else {
        bail!(
            "server_path ({}) is not in server_root ({})",
            server_path.to_string().await?,
            server_root.to_string().await?
        )
    };
    let path = if has_extension {
        path.rsplit_once('.')
            .ok_or_else(|| anyhow!("path ({}) has no extension", path))?
            .0
    } else {
        path
    };
    let path = if path == "index" && !data {
        ""
    } else {
        path.strip_suffix("/index").unwrap_or(path)
    };

    Ok(StringVc::cell(path.to_string()))
}

// Adapted from https://github.com/vercel/next.js/blob/canary/packages/next/shared/lib/router/utils/get-asset-path-from-route.ts
pub fn get_asset_path_from_route(route: &str, ext: &str) -> String {
    if route.is_empty() {
        format!("index{}", ext)
    } else if route == "index" || route.starts_with("index/") {
        format!("index/{}{}", route, ext)
    } else {
        format!("{}{}", route, ext)
    }
}

pub async fn foreign_code_context_condition(next_config: NextConfigVc) -> Result<ContextCondition> {
    let transpile_packages = next_config.transpile_packages().await?;
    let result = if transpile_packages.is_empty() {
        ContextCondition::InDirectory("node_modules".to_string())
    } else {
        ContextCondition::all(vec![
            ContextCondition::InDirectory("node_modules".to_string()),
            ContextCondition::not(ContextCondition::any(
                transpile_packages
                    .iter()
                    .map(|package| ContextCondition::InDirectory(format!("node_modules/{package}")))
                    .collect(),
            )),
        ])
    };
    Ok(result)
}

#[derive(Default, PartialEq, Eq, Clone, Copy, Debug, TraceRawVcs, Serialize, Deserialize)]
pub enum NextRuntime {
    #[default]
    NodeJs,
    Edge,
}

#[turbo_tasks::value]
#[derive(Default)]
pub struct NextSourceConfig {
    pub runtime: NextRuntime,

    /// Middleware router matchers
    pub matcher: Option<Vec<String>>,
}

#[turbo_tasks::value_impl]
impl NextSourceConfigVc {
    #[turbo_tasks::function]
    pub fn default() -> Self {
        NextSourceConfig::default().cell()
    }
}

/// An issue that occurred while resolving the React Refresh runtime module.
#[turbo_tasks::value(shared)]
pub struct NextSourceConfigParsingIssue {
    ident: AssetIdentVc,
    detail: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for NextSourceConfigParsingIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Unable to parse config export in source file".to_string())
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("parsing".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.ident.path()
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        StringVc::cell(
            "The exported configuration object in a source file need to have a very specific \
             format from which some properties can be statically parsed at compiled-time."
                .to_string(),
        )
    }

    #[turbo_tasks::function]
    fn detail(&self) -> StringVc {
        self.detail
    }
}

#[turbo_tasks::function]
pub async fn parse_config_from_source(module_asset: AssetVc) -> Result<NextSourceConfigVc> {
    if let Some(ecmascript_asset) = EcmascriptModuleAssetVc::resolve_from(module_asset).await? {
        if let ParseResult::Ok {
            program: Program::Module(module),
            eval_context,
            ..
        } = &*ecmascript_asset.parse().await?
        {
            for item in &module.body {
                if let Some(decl) = item
                    .as_module_decl()
                    .and_then(|mod_decl| mod_decl.as_export_decl())
                    .and_then(|export_decl| export_decl.decl.as_var())
                {
                    for decl in &decl.decls {
                        if decl
                            .name
                            .as_ident()
                            .map(|ident| &*ident.sym == "config")
                            .unwrap_or_default()
                        {
                            if let Some(init) = decl.init.as_ref() {
                                let value = eval_context.eval(init);
                                return Ok(parse_config_from_js_value(module_asset, &value).cell());
                            } else {
                                NextSourceConfigParsingIssue {
                                    ident: module_asset.ident(),
                                    detail: StringVc::cell(
                                        "The exported config object must contain an variable \
                                         initializer."
                                            .to_string(),
                                    ),
                                }
                                .cell()
                                .as_issue()
                                .emit()
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(NextSourceConfigVc::default())
}

fn parse_config_from_js_value(module_asset: AssetVc, value: &JsValue) -> NextSourceConfig {
    let mut config = NextSourceConfig::default();
    let invalid_config = |detail: &str, value: &JsValue| {
        let (explainer, hints) = value.explain(2, 0);
        NextSourceConfigParsingIssue {
            ident: module_asset.ident(),
            detail: StringVc::cell(format!("{detail} Got {explainer}.{hints}")),
        }
        .cell()
        .as_issue()
        .emit()
    };
    if let JsValue::Object { parts, .. } = value {
        for part in parts {
            match part {
                ObjectPart::Spread(_) => invalid_config(
                    "Spread properties are not supported in the config export.",
                    value,
                ),
                ObjectPart::KeyValue(key, value) => {
                    if let Some(key) = key.as_str() {
                        if key == "runtime" {
                            if let JsValue::Constant(runtime) = value {
                                if let Some(runtime) = runtime.as_str() {
                                    match runtime {
                                        "edge" | "experimental-edge" => {
                                            config.runtime = NextRuntime::Edge;
                                        }
                                        "nodejs" => {
                                            config.runtime = NextRuntime::NodeJs;
                                        }
                                        _ => {
                                            invalid_config(
                                                "The runtime property must be either \"nodejs\" \
                                                 or \"edge\".",
                                                value,
                                            );
                                        }
                                    }
                                }
                            } else {
                                invalid_config(
                                    "The runtime property must be a constant string.",
                                    value,
                                );
                            }
                        }
                        if key == "matcher" {
                            let mut matchers = vec![];
                            match value {
                                JsValue::Constant(matcher) => {
                                    if let Some(matcher) = matcher.as_str() {
                                        matchers.push(matcher.to_string());
                                    } else {
                                        invalid_config(
                                            "The matcher property must be a string or array of \
                                             strings",
                                            value,
                                        );
                                    }
                                }
                                JsValue::Array { items, .. } => {
                                    for item in items {
                                        if let Some(matcher) = item.as_str() {
                                            matchers.push(matcher.to_string());
                                        } else {
                                            invalid_config(
                                                "The matcher property must be a string or array \
                                                 of strings",
                                                value,
                                            );
                                        }
                                    }
                                }
                                _ => invalid_config(
                                    "The matcher property must be a string or array of strings",
                                    value,
                                ),
                            }
                            config.matcher = Some(matchers);
                        }
                    } else {
                        invalid_config(
                            "The exported config object must not contain non-constant strings.",
                            key,
                        );
                    }
                }
            }
        }
    } else {
        invalid_config(
            "The exported config object must be a valid object literal.",
            value,
        );
    }

    config
}

pub async fn load_next_json<T: DeserializeOwned>(
    context: FileSystemPathVc,
    path: &str,
) -> Result<T> {
    let request = RequestVc::module(
        "next".to_owned(),
        Value::new(path.to_string().into()),
        QueryMapVc::cell(None),
    );
    let resolve_options = node_cjs_resolve_options(context.root());

    let resolve_result = handle_resolve_error(
        resolve::resolve(context, request, resolve_options),
        Value::new(ReferenceType::EcmaScriptModules(
            EcmaScriptModulesReferenceSubType::Undefined,
        )),
        context,
        request,
        resolve_options,
        OptionIssueSourceVc::none(),
        IssueSeverity::Error.cell(),
    )
    .await?;
    let resolve_result = &*resolve_result.await?;

    let primary = resolve_result
        .primary
        .first()
        .context("Unable to resolve primary asset")?;

    let PrimaryResolveResult::Asset(metrics_asset) = primary else {
        bail!("Expected to find asset");
    };

    let content = &*metrics_asset.content().file_content().await?;

    let FileContent::Content(file) = content else {
        bail!("Expected file content for metrics data");
    };

    let result: T = parse_json_rope_with_source_context(file.content())?;

    Ok(result)
}
