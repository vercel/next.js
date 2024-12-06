use std::ops::Deref;

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use swc_core::{
    common::{source_map::SmallPos, Span, Spanned, GLOBALS},
    ecma::ast::{Decl, Expr, FnExpr, Ident, Program},
};
use turbo_rcstr::RcStr;
use turbo_tasks::{trace::TraceRawVcs, ResolvedVc, TryJoinIterExt, ValueDefault, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    file_source::FileSource,
    ident::AssetIdent,
    issue::{
        Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, OptionIssueSource,
        OptionStyledString, StyledString,
    },
    source::Source,
};
use turbopack_ecmascript::{
    analyzer::{graph::EvalContext, ConstantNumber, ConstantValue, JsValue},
    parse::{parse, ParseResult},
    EcmascriptInputTransforms, EcmascriptModuleAssetType,
};

use crate::{app_structure::AppPageLoaderTree, util::NextRuntime};

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

#[derive(Default, PartialEq, Eq, Clone, Copy, Debug, TraceRawVcs, Serialize, Deserialize)]
pub enum NextRevalidate {
    #[default]
    Never,
    ForceCache,
    Frequency {
        seconds: u32,
    },
}

#[turbo_tasks::value(into = "shared")]
#[derive(Debug, Default, Clone)]
pub struct NextSegmentConfig {
    pub dynamic: Option<NextSegmentDynamic>,
    pub dynamic_params: Option<bool>,
    pub revalidate: Option<NextRevalidate>,
    pub fetch_cache: Option<NextSegmentFetchCache>,
    pub runtime: Option<NextRuntime>,
    pub preferred_region: Option<Vec<RcStr>>,
    pub experimental_ppr: Option<bool>,
    /// Whether these metadata exports are defined in the source file.
    pub generate_image_metadata: bool,
    pub generate_sitemaps: bool,
}

#[turbo_tasks::value_impl]
impl ValueDefault for NextSegmentConfig {
    #[turbo_tasks::function]
    pub fn value_default() -> Vc<Self> {
        NextSegmentConfig::default().cell()
    }
}

impl NextSegmentConfig {
    /// Applies the parent config to this config, setting any unset values to
    /// the parent's values.
    pub fn apply_parent_config(&mut self, parent: &Self) {
        let NextSegmentConfig {
            dynamic,
            dynamic_params,
            revalidate,
            fetch_cache,
            runtime,
            preferred_region,
            experimental_ppr,
            ..
        } = self;
        *dynamic = dynamic.or(parent.dynamic);
        *dynamic_params = dynamic_params.or(parent.dynamic_params);
        *revalidate = revalidate.or(parent.revalidate);
        *fetch_cache = fetch_cache.or(parent.fetch_cache);
        *runtime = runtime.or(parent.runtime);
        *preferred_region = preferred_region.take().or(parent.preferred_region.clone());
        *experimental_ppr = experimental_ppr.or(parent.experimental_ppr);
    }

    /// Applies a config from a parallel route to this config, returning an
    /// error if there are conflicting values.
    pub fn apply_parallel_config(&mut self, parallel_config: &Self) -> Result<()> {
        fn merge_parallel<T: PartialEq + Clone>(
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
        let Self {
            dynamic,
            dynamic_params,
            revalidate,
            fetch_cache,
            runtime,
            preferred_region,
            experimental_ppr,
            ..
        } = self;
        merge_parallel(dynamic, &parallel_config.dynamic, "dynamic")?;
        merge_parallel(
            dynamic_params,
            &parallel_config.dynamic_params,
            "dynamicParams",
        )?;
        merge_parallel(revalidate, &parallel_config.revalidate, "revalidate")?;
        merge_parallel(fetch_cache, &parallel_config.fetch_cache, "fetchCache")?;
        merge_parallel(runtime, &parallel_config.runtime, "runtime")?;
        merge_parallel(
            preferred_region,
            &parallel_config.preferred_region,
            "referredRegion",
        )?;
        merge_parallel(
            experimental_ppr,
            &parallel_config.experimental_ppr,
            "experimental_ppr",
        )?;
        Ok(())
    }
}

/// An issue that occurred while parsing the app segment config.
#[turbo_tasks::value(shared)]
pub struct NextSegmentConfigParsingIssue {
    ident: Vc<AssetIdent>,
    detail: ResolvedVc<StyledString>,
    source: Vc<IssueSource>,
}

#[turbo_tasks::value_impl]
impl Issue for NextSegmentConfigParsingIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Unable to parse config export in source file".into()).cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Parse.into()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.ident.path()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(
                "The exported configuration object in a source file needs to have a very specific \
                 format from which some properties can be statically parsed at compiled-time."
                    .into(),
            )
            .resolved_cell(),
        ))
    }

    #[turbo_tasks::function]
    fn detail(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.detail))
    }

    #[turbo_tasks::function]
    fn documentation_link(&self) -> Vc<RcStr> {
        Vc::cell(
            "https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config"
                .into(),
        )
    }

    #[turbo_tasks::function]
    async fn source(&self) -> Result<Vc<OptionIssueSource>> {
        Ok(Vc::cell(Some(
            self.source
                .resolve_source_map(self.ident.path())
                .to_resolved()
                .await?,
        )))
    }
}

#[turbo_tasks::function]
pub async fn parse_segment_config_from_source(
    source: Vc<Box<dyn Source>>,
) -> Result<Vc<NextSegmentConfig>> {
    let path = source.ident().path().await?;

    // Don't try parsing if it's not a javascript file, otherwise it will emit an
    // issue causing the build to "fail".
    if path.path.ends_with(".d.ts")
        || !(path.path.ends_with(".js")
            || path.path.ends_with(".jsx")
            || path.path.ends_with(".ts")
            || path.path.ends_with(".tsx"))
    {
        return Ok(Default::default());
    }

    let result = &*parse(
        source,
        turbo_tasks::Value::new(if path.path.ends_with(".ts") {
            EcmascriptModuleAssetType::Typescript {
                tsx: false,
                analyze_types: false,
            }
        } else if path.path.ends_with(".tsx") {
            EcmascriptModuleAssetType::Typescript {
                tsx: true,
                analyze_types: false,
            }
        } else {
            EcmascriptModuleAssetType::Ecmascript
        }),
        EcmascriptInputTransforms::empty(),
    )
    .await?;

    let ParseResult::Ok {
        program: Program::Module(module_ast),
        eval_context,
        globals,
        ..
    } = result
    else {
        return Ok(Default::default());
    };

    let config = GLOBALS.set(globals, || {
        let mut config = NextSegmentConfig::default();

        for item in &module_ast.body {
            let Some(export_decl) = item
                .as_module_decl()
                .and_then(|mod_decl| mod_decl.as_export_decl())
            else {
                continue;
            };

            match &export_decl.decl {
                Decl::Var(var_decl) => {
                    for decl in &var_decl.decls {
                        let Some(ident) = decl.name.as_ident().map(|ident| ident.deref()) else {
                            continue;
                        };

                        if let Some(init) = decl.init.as_ref() {
                            parse_config_value(source, &mut config, ident, init, eval_context);
                        }
                    }
                }
                Decl::Fn(fn_decl) => {
                    let ident = &fn_decl.ident;
                    // create an empty expression of {}, we don't need init for function
                    let init = Expr::Fn(FnExpr {
                        ident: None,
                        function: fn_decl.function.clone(),
                    });
                    parse_config_value(source, &mut config, ident, &init, eval_context);
                }
                _ => {}
            }
        }
        config
    });

    Ok(config.cell())
}

fn issue_source(source: Vc<Box<dyn Source>>, span: Span) -> Vc<IssueSource> {
    IssueSource::from_swc_offsets(source, span.lo.to_usize(), span.hi.to_usize())
}

fn parse_config_value(
    source: Vc<Box<dyn Source>>,
    config: &mut NextSegmentConfig,
    ident: &Ident,
    init: &Expr,
    eval_context: &EvalContext,
) {
    let span = init.span();
    let invalid_config = |detail: &str, value: &JsValue| {
        let (explainer, hints) = value.explain(2, 0);
        let detail =
            StyledString::Text(format!("{detail} Got {explainer}.{hints}").into()).resolved_cell();

        NextSegmentConfigParsingIssue {
            ident: source.ident(),
            detail,
            source: issue_source(source, span),
        }
        .cell()
        .emit();
    };

    match &*ident.sym {
        "dynamic" => {
            let value = eval_context.eval(init);
            let Some(val) = value.as_str() else {
                invalid_config("`dynamic` needs to be a static string", &value);
                return;
            };

            config.dynamic = match serde_json::from_value(Value::String(val.to_string())) {
                Ok(dynamic) => Some(dynamic),
                Err(err) => {
                    invalid_config(&format!("`dynamic` has an invalid value: {}", err), &value);
                    return;
                }
            };
        }
        "dynamicParams" => {
            let value = eval_context.eval(init);
            let Some(val) = value.as_bool() else {
                invalid_config("`dynamicParams` needs to be a static boolean", &value);
                return;
            };

            config.dynamic_params = Some(val);
        }
        "revalidate" => {
            let value = eval_context.eval(init);
            match value {
                JsValue::Constant(ConstantValue::Num(ConstantNumber(val))) if val >= 0.0 => {
                    config.revalidate = Some(NextRevalidate::Frequency {
                        seconds: val as u32,
                    });
                }
                JsValue::Constant(ConstantValue::False) => {
                    config.revalidate = Some(NextRevalidate::Never);
                }
                JsValue::Constant(ConstantValue::Str(str)) if str.as_str() == "force-cache" => {
                    config.revalidate = Some(NextRevalidate::ForceCache);
                }
                _ => {
                    //noop; revalidate validation occurs in runtime at
                    //https://github.com/vercel/next.js/blob/cd46c221d2b7f796f963d2b81eea1e405023db23/packages/next/src/server/lib/patch-fetch.ts#L20
                }
            }
        }
        "fetchCache" => {
            let value = eval_context.eval(init);
            let Some(val) = value.as_str() else {
                invalid_config("`fetchCache` needs to be a static string", &value);
                return;
            };

            config.fetch_cache = match serde_json::from_value(Value::String(val.to_string())) {
                Ok(fetch_cache) => Some(fetch_cache),
                Err(err) => {
                    invalid_config(
                        &format!("`fetchCache` has an invalid value: {}", err),
                        &value,
                    );
                    return;
                }
            };
        }
        "runtime" => {
            let value = eval_context.eval(init);
            let Some(val) = value.as_str() else {
                invalid_config("`runtime` needs to be a static string", &value);
                return;
            };

            config.runtime = match serde_json::from_value(Value::String(val.to_string())) {
                Ok(runtime) => Some(runtime),
                Err(err) => {
                    invalid_config(&format!("`runtime` has an invalid value: {}", err), &value);
                    return;
                }
            };
        }
        "preferredRegion" => {
            let value = eval_context.eval(init);

            let preferred_region = match value {
                // Single value is turned into a single-element Vec.
                JsValue::Constant(ConstantValue::Str(str)) => vec![str.to_string().into()],
                // Array of strings is turned into a Vec. If one of the values in not a String it
                // will error.
                JsValue::Array { items, .. } => {
                    let mut regions = Vec::new();
                    for item in items {
                        if let JsValue::Constant(ConstantValue::Str(str)) = item {
                            regions.push(str.to_string().into());
                        } else {
                            invalid_config(
                                "Values of the `preferredRegion` array need to static strings",
                                &item,
                            );
                            return;
                        }
                    }
                    regions
                }
                _ => {
                    invalid_config(
                        "`preferredRegion` needs to be a static string or array of static strings",
                        &value,
                    );
                    return;
                }
            };

            config.preferred_region = Some(preferred_region);
        }
        // Match exported generateImageMetadata function and generateSitemaps function, and pass
        // them to config.
        "generateImageMetadata" => {
            config.generate_image_metadata = true;
        }
        "generateSitemaps" => {
            config.generate_sitemaps = true;
        }
        "experimental_ppr" => {
            let value = eval_context.eval(init);
            let Some(val) = value.as_bool() else {
                invalid_config("`experimental_ppr` needs to be a static boolean", &value);
                return;
            };

            config.experimental_ppr = Some(val);
        }
        _ => {}
    }
}

#[turbo_tasks::function]
pub async fn parse_segment_config_from_loader_tree(
    loader_tree: Vc<AppPageLoaderTree>,
) -> Result<Vc<NextSegmentConfig>> {
    let loader_tree = &*loader_tree.await?;

    Ok(parse_segment_config_from_loader_tree_internal(loader_tree)
        .await?
        .cell())
}

pub async fn parse_segment_config_from_loader_tree_internal(
    loader_tree: &AppPageLoaderTree,
) -> Result<NextSegmentConfig> {
    let mut config = NextSegmentConfig::default();

    let parallel_configs = loader_tree
        .parallel_routes
        .values()
        .map(|loader_tree| async move {
            Box::pin(parse_segment_config_from_loader_tree_internal(loader_tree)).await
        })
        .try_join()
        .await?;

    for tree in parallel_configs {
        config.apply_parallel_config(&tree)?;
    }

    let modules = &loader_tree.modules;
    for path in [modules.page, modules.default, modules.layout]
        .into_iter()
        .flatten()
    {
        let source = Vc::upcast(FileSource::new(*path));
        config.apply_parent_config(&*parse_segment_config_from_source(source).await?);
    }

    Ok(config)
}
