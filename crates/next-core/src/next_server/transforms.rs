use anyhow::Result;
use next_custom_transforms::transforms::strip_page_exports::ExportFilter;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::module_options::{ModuleRule, ModuleRuleEffect, RuleCondition};
use turbopack_core::reference_type::{ReferenceType, UrlReferenceSubType};

use crate::{
    mode::NextMode,
    next_config::NextConfig,
    next_server::context::ServerContextType,
    next_shared::transforms::{
        get_next_dynamic_transform_rule, get_next_font_transform_rule, get_next_image_rule,
        get_next_lint_transform_rule, get_next_modularize_imports_rule,
        get_next_pages_transforms_rule, get_next_track_dynamic_imports_transform_rule,
        get_server_actions_transform_rule, next_amp_attributes::get_next_amp_attr_rule,
        next_cjs_optimizer::get_next_cjs_optimizer_rule,
        next_disallow_re_export_all_in_page::get_next_disallow_export_all_in_page_rule,
        next_edge_node_api_assert::next_edge_node_api_assert,
        next_middleware_dynamic_assert::get_middleware_dynamic_assert_rule,
        next_page_static_info::get_next_page_static_info_assert_rule,
        next_pure::get_next_pure_rule, server_actions::ActionsTransform,
    },
    util::NextRuntime,
};

/// Returns a list of module rules which apply server-side, Next.js-specific
/// transforms.
pub async fn get_next_server_transforms_rules(
    next_config: Vc<NextConfig>,
    context_ty: ServerContextType,
    mode: Vc<NextMode>,
    foreign_code: bool,
    next_runtime: NextRuntime,
    encryption_key: ResolvedVc<RcStr>,
) -> Result<Vec<ModuleRule>> {
    let mut rules = vec![];

    let modularize_imports_config = &next_config.modularize_imports().await?;
    let mdx_rs = next_config.mdx_rs().await?.is_some();

    rules.push(get_next_lint_transform_rule(mdx_rs));

    if !modularize_imports_config.is_empty() {
        rules.push(get_next_modularize_imports_rule(
            modularize_imports_config,
            mdx_rs,
        ));
    }
    rules.push(get_next_font_transform_rule(mdx_rs));

    if !matches!(context_ty, ServerContextType::AppRSC { .. }) {
        rules.extend([
            // Ignore the internal ModuleCssAsset -> CssModuleAsset references
            // The CSS Module module itself is still needed for class names
            ModuleRule::new_internal(
                RuleCondition::any(vec![
                    RuleCondition::ResourcePathEndsWith(".module.css".into()),
                    RuleCondition::ContentTypeStartsWith("text/css+module".into()),
                ]),
                vec![ModuleRuleEffect::Ignore],
            ),
        ]);
        rules.extend([
            // Ignore all non-module CSS references
            ModuleRule::new(
                RuleCondition::any(vec![
                    RuleCondition::all(vec![
                        RuleCondition::ResourcePathEndsWith(".css".into()),
                        RuleCondition::not(RuleCondition::ResourcePathEndsWith(
                            ".module.css".into(),
                        )),
                    ]),
                    RuleCondition::all(vec![
                        RuleCondition::ContentTypeStartsWith("text/css".into()),
                        RuleCondition::not(RuleCondition::ContentTypeStartsWith(
                            "text/css+module".into(),
                        )),
                    ]),
                ]),
                vec![ModuleRuleEffect::Ignore],
            ),
        ]);
    }

    if !foreign_code {
        rules.push(get_next_page_static_info_assert_rule(
            mdx_rs,
            Some(context_ty.clone()),
            None,
        ));
    }

    let use_cache_enabled = *next_config.enable_use_cache().await?;
    let cache_kinds = next_config.cache_kinds().to_resolved().await?;
    let mut is_app_dir = false;

    let is_server_components = match &context_ty {
        ServerContextType::Pages { pages_dir } | ServerContextType::PagesApi { pages_dir } => {
            if !foreign_code {
                rules.push(get_next_disallow_export_all_in_page_rule(
                    mdx_rs,
                    pages_dir.clone(),
                ));
            }
            false
        }
        ServerContextType::PagesData { pages_dir } => {
            if !foreign_code {
                rules.push(
                    get_next_pages_transforms_rule(
                        pages_dir.clone(),
                        ExportFilter::StripDefaultExport,
                        mdx_rs,
                    )
                    .await?,
                );
                rules.push(get_next_disallow_export_all_in_page_rule(
                    mdx_rs,
                    pages_dir.clone(),
                ));
            }
            false
        }
        ServerContextType::AppSSR { .. } => {
            // Yah, this is SSR, but this is still treated as a Client transform layer.
            // need to apply to foreign code too
            rules.push(
                get_server_actions_transform_rule(
                    mode,
                    ActionsTransform::Client,
                    encryption_key,
                    mdx_rs,
                    use_cache_enabled,
                    cache_kinds,
                )
                .await?,
            );

            is_app_dir = true;

            false
        }
        ServerContextType::AppRSC { .. } => {
            rules.push(
                get_server_actions_transform_rule(
                    mode,
                    ActionsTransform::Server,
                    encryption_key,
                    mdx_rs,
                    use_cache_enabled,
                    cache_kinds,
                )
                .await?,
            );

            is_app_dir = true;

            true
        }
        ServerContextType::AppRoute { .. } => {
            rules.push(
                get_server_actions_transform_rule(
                    mode,
                    ActionsTransform::Server,
                    encryption_key,
                    mdx_rs,
                    use_cache_enabled,
                    cache_kinds,
                )
                .await?,
            );

            is_app_dir = true;

            false
        }
        ServerContextType::Middleware { .. } | ServerContextType::Instrumentation { .. } => false,
    };

    if is_app_dir &&
        // `dynamicIO` is not supported in the edge runtime.
        // (also, the code generated by the dynamic imports transform relies on `CacheSignal`, which uses nodejs-specific APIs)
        next_runtime != NextRuntime::Edge &&
        *next_config.enable_dynamic_io().await?
    {
        rules.push(get_next_track_dynamic_imports_transform_rule(mdx_rs));
    }

    if !foreign_code {
        rules.push(
            get_next_dynamic_transform_rule(true, is_server_components, is_app_dir, mode, mdx_rs)
                .await?,
        );

        rules.push(get_next_amp_attr_rule(mdx_rs));
        rules.push(get_next_cjs_optimizer_rule(mdx_rs));
        rules.push(get_next_pure_rule(mdx_rs));

        // [NOTE]: this rule only works in prod config
        // https://github.com/vercel/next.js/blob/a1d0259ea06592c5ca6df882e9b1d0d0121c5083/packages/next/src/build/swc/options.ts#L409
        // rules.push(get_next_optimize_server_react_rule(enable_mdx_rs,
        // optimize_use_state))

        rules.push(get_next_image_rule().await?);
    }

    if let NextRuntime::Edge = next_runtime {
        rules.push(get_middleware_dynamic_assert_rule(mdx_rs));

        if !foreign_code {
            rules.push(next_edge_node_api_assert(
                mdx_rs,
                matches!(context_ty, ServerContextType::Middleware { .. })
                    && matches!(*mode.await?, NextMode::Build),
                matches!(*mode.await?, NextMode::Build),
            ));
        }

        if matches!(context_ty, ServerContextType::AppRoute { .. }) {
            // Ignore static asset imports in Edge routes, these are really intended for the client
            // (i.e. for pages), while still allowing `new URL(..., import.meta.url)`
            rules.push(ModuleRule::new(
                RuleCondition::all(vec![
                    RuleCondition::not(RuleCondition::ReferenceType(ReferenceType::Url(
                        UrlReferenceSubType::Undefined,
                    ))),
                    RuleCondition::any(vec![
                        RuleCondition::ResourcePathEndsWith(".apng".to_string()),
                        RuleCondition::ResourcePathEndsWith(".avif".to_string()),
                        RuleCondition::ResourcePathEndsWith(".gif".to_string()),
                        RuleCondition::ResourcePathEndsWith(".ico".to_string()),
                        RuleCondition::ResourcePathEndsWith(".jpg".to_string()),
                        RuleCondition::ResourcePathEndsWith(".jpeg".to_string()),
                        RuleCondition::ResourcePathEndsWith(".png".to_string()),
                        RuleCondition::ResourcePathEndsWith(".svg".to_string()),
                        RuleCondition::ResourcePathEndsWith(".webp".to_string()),
                        RuleCondition::ResourcePathEndsWith(".woff2".to_string()),
                    ]),
                ]),
                vec![ModuleRuleEffect::Ignore],
            ));
        }
    }

    Ok(rules)
}

/// Returns a list of module rules which apply server-side, Next.js-specific
/// transforms, but which are only applied to internal modules.
pub async fn get_next_server_internal_transforms_rules(
    context_ty: ServerContextType,
    mdx_rs: bool,
) -> Result<Vec<ModuleRule>> {
    let mut rules = vec![];

    match context_ty {
        ServerContextType::Pages { .. } => {
            // Apply next/font transforms to foreign code
            rules.push(get_next_font_transform_rule(mdx_rs));
        }
        ServerContextType::PagesApi { .. } => {}
        ServerContextType::PagesData { .. } => {}
        ServerContextType::AppSSR { .. } => {
            rules.push(get_next_font_transform_rule(mdx_rs));
        }
        ServerContextType::AppRSC { .. } => {
            rules.push(get_next_font_transform_rule(mdx_rs));
        }
        ServerContextType::AppRoute { .. } => {}
        ServerContextType::Middleware { .. } => {}
        ServerContextType::Instrumentation { .. } => {}
    };

    Ok(rules)
}
