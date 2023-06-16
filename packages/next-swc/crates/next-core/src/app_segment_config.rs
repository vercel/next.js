use std::ops::Deref;

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use swc_core::{
    common::{source_map::Pos, Span, Spanned},
    ecma::ast::{Expr, Ident, Program},
};
use turbo_tasks::{primitives::StringVc, trace::TraceRawVcs, TryJoinIterExt};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetVc},
        context::{AssetContext, AssetContextVc},
        ident::AssetIdentVc,
        issue::{
            Issue, IssueSeverity, IssueSeverityVc, IssueSourceVc, IssueVc, OptionIssueSourceVc,
        },
        reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
        source_asset::SourceAssetVc,
    },
    ecmascript::{
        analyzer::{graph::EvalContext, JsValue},
        parse::ParseResult,
        EcmascriptModuleAssetVc,
    },
};

use crate::{app_structure::LoaderTreeVc, util::NextRuntime};

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
#[derive(Debug, Default)]
pub struct NextSegmentConfig {
    pub dynamic: Option<NextSegmentDynamic>,
    pub dynamic_params: Option<bool>,
    pub revalidate: Option<bool>,
    pub fetch_cache: Option<NextSegmentFetchCache>,
    pub runtime: Option<NextRuntime>,
    pub preferred_region: Option<String>,
}

#[turbo_tasks::value_impl]
impl NextSegmentConfigVc {
    #[turbo_tasks::function]
    pub fn default() -> Self {
        NextSegmentConfig::default().cell()
    }
}

impl NextSegmentConfig {
    /// Applies the parent config to this config, setting any unset values to
    /// the parent's values.
    pub fn apply_parent_config(&mut self, parent: &Self) {
        self.dynamic = self.dynamic.or(parent.dynamic);
        self.dynamic_params = self.dynamic_params.or(parent.dynamic_params);
        self.revalidate = self.revalidate.or(parent.revalidate);
        self.fetch_cache = self.fetch_cache.or(parent.fetch_cache);
        self.runtime = self.runtime.or(parent.runtime);
        self.preferred_region = self
            .preferred_region
            .take()
            .or(parent.preferred_region.clone());
    }

    /// Applies the sibling config to this config, returning an error if there
    /// are conflicting values.
    pub fn apply_sibling_config(&mut self, sibling: &Self) -> Result<()> {
        fn merge_sibling<T: PartialEq + Clone>(
            a: &mut Option<T>,
            b: &Option<T>,
            name: &str,
        ) -> Result<()> {
            match (a.as_ref(), b) {
                (Some(a), Some(b)) => {
                    if *a != *b {
                        bail!(
                            "Sibling segment configs have conflicting values for {}",
                            name
                        )
                    }
                }
                (None, Some(b)) => {
                    *a = Some(b.clone());
                }
                _ => {}
            }
            Ok(())
        }
        merge_sibling(&mut self.dynamic, &sibling.dynamic, "dynamic")?;
        merge_sibling(
            &mut self.dynamic_params,
            &sibling.dynamic_params,
            "dynamicParams",
        )?;
        merge_sibling(&mut self.revalidate, &sibling.revalidate, "revalidate")?;
        merge_sibling(&mut self.fetch_cache, &sibling.fetch_cache, "fetchCache")?;
        merge_sibling(&mut self.runtime, &sibling.runtime, "runtime")?;
        merge_sibling(
            &mut self.preferred_region,
            &sibling.preferred_region,
            "referredRegion",
        )?;
        Ok(())
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
                Ok(dynamic) => Some(dynamic),
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

            config.dynamic_params = Some(val);
        }
        "revalidate" => {
            let value = eval_context.eval(init);
            let Some(val) = value.as_bool() else {
                return invalid_config("`revalidate` needs to be a static boolean", &value);
            };

            config.revalidate = Some(val);
        }
        "fetchCache" => {
            let value = eval_context.eval(init);
            let Some(val) = value.as_str() else {
                return invalid_config("`fetchCache` needs to be a static string", &value);
            };

            config.fetch_cache = match serde_json::from_value(Value::String(val.to_string())) {
                Ok(fetch_cache) => Some(fetch_cache),
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
                Ok(runtime) => Some(runtime),
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

            config.preferred_region = Some(val.to_string());
        }
        _ => {}
    }
}

#[turbo_tasks::function]
pub async fn parse_segment_config_from_loader_tree(
    loader_tree: LoaderTreeVc,
    context: AssetContextVc,
) -> Result<NextSegmentConfigVc> {
    let loader_tree = loader_tree.await?;
    let components = loader_tree.components.await?;
    let mut config = NextSegmentConfig::default();
    let siblings = loader_tree
        .parallel_routes
        .values()
        .copied()
        .map(|tree| parse_segment_config_from_loader_tree(tree, context))
        .try_join()
        .await?;
    for tree in siblings {
        config.apply_sibling_config(&tree)?;
    }
    for component in [components.page, components.default, components.layout]
        .into_iter()
        .flatten()
    {
        config.apply_parent_config(
            &*parse_segment_config_from_source(context.process(
                SourceAssetVc::new(component).into(),
                turbo_tasks::Value::new(ReferenceType::EcmaScriptModules(
                    EcmaScriptModulesReferenceSubType::Undefined,
                )),
            ))
            .await?,
        );
    }
    Ok(config.cell())
}
