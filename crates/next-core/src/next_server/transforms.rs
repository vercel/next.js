use anyhow::Result;
use next_custom_transforms::transforms::strip_page_exports::ExportFilter;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::module_options::{ModuleRule, ModuleRuleEffect, RuleCondition};
use turbopack_core::reference_type::{
    CssReferenceSubType, EntryReferenceSubType, ReferenceType, UrlReferenceSubType,
};

use crate::{
    mode::NextMode,
    next_config::NextConfig,
    next_server::context::ServerContextType,
    next_shared::transforms::{
        get_import_type_bytes_rule, get_next_dynamic_transform_rule, get_next_font_transform_rule,
        get_next_image_rule, get_next_lint_transform_rule, get_next_modularize_imports_rule,
        get_next_pages_transforms_rule, get_next_track_dynamic_imports_transform_rule,
        get_server_actions_transform_rule, next_cjs_optimizer::get_next_cjs_optimizer_rule,
        next_disallow_re_export_all_in_page::get_next_disallow_export_all_in_page_rule,
        next_edge_node_api_assert::next_edge_node_api_assert,
        next_middleware_dynamic_assert::get_middleware_dynamic_assert_rule,
        next_pure::get_next_pure_rule, server_actions::ActionsTransform,
    },
    util::{NextRuntime, module_styles_rule_condition, styles_rule_condition},
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

    if !foreign_code {
        rules.push(get_next_lint_transform_rule(mdx_rs));
    }

    if !modularize_imports_config.is_empty() {
        rules.push(get_next_modularize_imports_rule(
            modularize_imports_config,
            mdx_rs,
        ));
    }
    rules.push(get_next_font_transform_rule(mdx_rs));

    if !matches!(context_ty, ServerContextType::AppRSC { .. }) {
        rules.extend([
            // Ignore the inner ModuleCssAsset -> CssModuleAsset references
            // The CSS Module module itself (and the Analyze reference) is still needed to generate
            // the class names object.
            ModuleRule::new(
                RuleCondition::all(vec![
                    RuleCondition::ReferenceType(ReferenceType::Css(CssReferenceSubType::Inner)),
                    module_styles_rule_condition(),
                ]),
                vec![ModuleRuleEffect::Ignore],
            ),
            // Ignore all non-module CSS references
            ModuleRule::new(styles_rule_condition(), vec![ModuleRuleEffect::Ignore]),
        ]);
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
                rules.push(get_next_pages_transforms_rule(
                    pages_dir.clone(),
                    ExportFilter::StripDefaultExport,
                    mdx_rs,
                    vec![RuleCondition::ReferenceType(ReferenceType::Entry(
                        EntryReferenceSubType::PageData,
                    ))],
                )?);
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
        // `cacheComponents` is not supported in the edge runtime.
        // (also, the code generated by the dynamic imports transform relies on `CacheSignal`, which uses nodejs-specific APIs)
        next_runtime != NextRuntime::Edge &&
        *next_config.enable_cache_components().await?
    {
        rules.push(get_next_track_dynamic_imports_transform_rule(mdx_rs));
    }

    if !foreign_code {
        rules.push(
            get_next_dynamic_transform_rule(true, is_server_components, is_app_dir, mode, mdx_rs)
                .await?,
        );

        rules.push(get_next_cjs_optimizer_rule(mdx_rs));
        rules.push(get_next_pure_rule(mdx_rs));

        // [NOTE]: this rule only works in prod config
        // https://github.com/vercel/next.js/blob/a1d0259ea06592c5ca6df882e9b1d0d0121c5083/packages/next/src/build/swc/options.ts#L409
        // rules.push(get_next_optimize_server_react_rule(enable_mdx_rs,
        // optimize_use_state))

        rules.push(get_next_image_rule().await?);
    }

    if let NextRuntime::Edge = next_runtime {
        let mode = *mode.await?;

        if mode == NextMode::Development {
            rules.push(get_middleware_dynamic_assert_rule(mdx_rs));
        }

        if !foreign_code {
            rules.push(next_edge_node_api_assert(
                mdx_rs,
                matches!(context_ty, ServerContextType::Middleware { .. })
                    && mode == NextMode::Build,
                mode == NextMode::Build,
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

    if *next_config.turbopack_import_type_bytes().await? {
        rules.push(get_import_type_bytes_rule());
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
