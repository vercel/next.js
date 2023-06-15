use std::ops::Deref;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use swc_core::{
    common::{source_map::Pos, Span, Spanned},
    ecma::ast::{Expr, Ident, Program},
};
use turbo_tasks::{primitives::StringVc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetVc},
        ident::AssetIdentVc,
        issue::{
            Issue, IssueSeverity, IssueSeverityVc, IssueSourceVc, IssueVc, OptionIssueSourceVc,
        },
    },
    ecmascript::{
        analyzer::{graph::EvalContext, JsValue},
        parse::ParseResult,
        EcmascriptModuleAssetVc,
    },
};

use crate::util::NextRuntime;

#[derive(Default, PartialEq, Eq, Clone, Copy, Debug, TraceRawVcs, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NextSegmentDynamic {
    #[default]
    Auto,
    ForceDynamic,
    Error,
    ForceStatic,
}

#[derive(Default, PartialEq, Eq, Clone, Copy, Debug, TraceRawVcs, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NextSegmentFetchCache {
    #[default]
    Auto,
    DefaultCache,
    OnlyCache,
    ForceCache,
    DefaultNoStore,
    OnlyNoStore,
    ForceNoStore,
}

#[turbo_tasks::value]
#[derive(Debug)]
#[serde(rename_all = "camelCase")]
pub struct NextSegmentConfig {
    pub dynamic: NextSegmentDynamic,
    pub dynamic_params: bool,
    pub revalidate: bool,
    pub fetch_cache: NextSegmentFetchCache,
    pub runtime: NextRuntime,
    pub referred_region: String,
}

#[turbo_tasks::value_impl]
impl NextSegmentConfigVc {
    #[turbo_tasks::function]
    pub fn default() -> Self {
        NextSegmentConfig::default().cell()
    }
}

impl Default for NextSegmentConfig {
    fn default() -> Self {
        NextSegmentConfig {
            dynamic: Default::default(),
            dynamic_params: true,
            revalidate: false,
            fetch_cache: Default::default(),
            runtime: Default::default(),
            referred_region: "auto".to_string(),
        }
    }
}

/// An issue that occurred while parsing the app segment config.
#[turbo_tasks::value(shared)]
pub struct NextSegmentConfigParsingIssue {
    ident: AssetIdentVc,
    detail: StringVc,
    source: IssueSourceVc,
}

#[turbo_tasks::value_impl]
impl Issue for NextSegmentConfigParsingIssue {
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

    #[turbo_tasks::function]
    fn documentation_link(&self) -> StringVc {
        StringVc::cell(
            "https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config"
                .to_string(),
        )
    }

    #[turbo_tasks::function]
    fn source(&self) -> OptionIssueSourceVc {
        OptionIssueSourceVc::some(self.source)
    }
}

#[turbo_tasks::function]
pub async fn parse_segment_config_from_source(
    module_asset: AssetVc,
) -> Result<NextSegmentConfigVc> {
    let Some(ecmascript_asset) = EcmascriptModuleAssetVc::resolve_from(module_asset).await? else {
        return Ok(NextSegmentConfigVc::default());
    };

    let ParseResult::Ok {
        program: Program::Module(module),
        eval_context,
        ..
    } = &*ecmascript_asset.parse().await? else {
        return Ok(NextSegmentConfigVc::default());
    };

    let mut config = NextSegmentConfig::default();

    for item in &module.body {
        let Some(decl) = item
            .as_module_decl()
            .and_then(|mod_decl| mod_decl.as_export_decl())
            .and_then(|export_decl| export_decl.decl.as_var()) else {
            continue;
        };

        for decl in &decl.decls {
            let Some(ident) = decl
                .name
                .as_ident()
                .map(|ident| ident.deref())
            else {
                continue;
            };

            if let Some(init) = decl.init.as_ref() {
                parse_config_value(module_asset, &mut config, ident, init, eval_context);
            }
        }
    }

    Ok(config.cell())
}

fn issue_source(source: AssetVc, span: Span) -> IssueSourceVc {
    IssueSourceVc::from_byte_offset(source, span.lo.to_usize(), span.hi.to_usize())
}

fn parse_config_value(
    module_asset: AssetVc,
    config: &mut NextSegmentConfig,
    ident: &Ident,
    init: &Expr,
    eval_context: &EvalContext,
) {
    let span = init.span();
    let invalid_config = |detail: &str, value: &JsValue| {
        let (explainer, hints) = value.explain(2, 0);
        NextSegmentConfigParsingIssue {
            ident: module_asset.ident(),
            detail: StringVc::cell(format!("{detail} Got {explainer}.{hints}")),
            source: issue_source(module_asset, span),
        }
        .cell()
        .as_issue()
        .emit();
    };

    match &*ident.sym {
        "dynamic" => {
            let value = eval_context.eval(init);
            let Some(val) = value.as_str() else {
                return invalid_config("`dynamic` needs to be a static string", &value);
            };

            config.dynamic = match serde_json::from_value(Value::String(val.to_string())) {
                Ok(dynamic) => dynamic,
                Err(err) => {
                    return invalid_config(
                        &format!("`dynamic` has an invalid value: {}", err),
                        &value,
                    )
                }
            };
        }
        "dynamicParams" => {
            let value = eval_context.eval(init);
            let Some(val) = value.as_bool() else {
                return invalid_config("`dynamicParams` needs to be a static boolean", &value);
            };

            config.dynamic_params = val;
        }
        "revalidate" => {
            let value = eval_context.eval(init);
            let Some(val) = value.as_bool() else {
                return invalid_config("`revalidate` needs to be a static boolean", &value);
            };

            config.revalidate = val;
        }
        "fetchCache" => {
            let value = eval_context.eval(init);
            let Some(val) = value.as_str() else {
                return invalid_config("`fetchCache` needs to be a static string", &value);
            };

            config.fetch_cache = match serde_json::from_value(Value::String(val.to_string())) {
                Ok(fetch_cache) => fetch_cache,
                Err(err) => {
                    return invalid_config(
                        &format!("`fetchCache` has an invalid value: {}", err),
                        &value,
                    )
                }
            };
        }
        "runtime" => {
            let value = eval_context.eval(init);
            let Some(val) = value.as_str() else {
                return invalid_config("`runtime` needs to be a static string", &value);
            };

            config.runtime = match serde_json::from_value(Value::String(val.to_string())) {
                Ok(runtime) => runtime,
                Err(err) => {
                    return invalid_config(
                        &format!("`runtime` has an invalid value: {}", err),
                        &value,
                    )
                }
            };
        }
        "preferredRegion" => {
            let value = eval_context.eval(init);
            let Some(val) = value.as_str() else {
                return invalid_config("`preferredRegion` needs to be a static string", &value);
            };

            config.referred_region = val.to_string();
        }
        _ => {}
    }
}
