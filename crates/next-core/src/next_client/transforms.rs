use anyhow::Result;
use next_custom_transforms::transforms::strip_page_exports::ExportFilter;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect, ModuleType, RuleCondition};
use turbopack_core::environment::RuntimeVersions;

use crate::{
    mode::NextMode,
    next_client::context::ClientContextType,
    next_config::NextConfig,
    next_shared::transforms::{
        debug_fn_name::get_debug_fn_name_rule, emotion::get_emotion_transform_rule,
        get_next_dynamic_transform_rule, get_next_font_transform_rule, get_next_image_rule,
        get_next_lint_transform_rule, get_next_modularize_imports_rule,
        get_next_pages_transforms_rule, get_server_actions_transform_rule,
        next_cjs_optimizer::get_next_cjs_optimizer_rule,
        next_disallow_re_export_all_in_page::get_next_disallow_export_all_in_page_rule,
        next_pure::get_next_pure_rule,
        react_remove_properties::get_react_remove_properties_transform_rule,
        relay::get_relay_transform_rule, remove_console::get_remove_console_transform_rule,
        server_actions::ActionsTransform, styled_components::get_styled_components_transform_rule,
        styled_jsx::get_styled_jsx_transform_rule,
        swc_ecma_transform_plugins::get_swc_ecma_transform_plugin_rule,
    },
    raw_ecmascript_module::RawEcmascriptModuleType,
};

/// Returns a list of module rules which apply client-side, Next.js-specific
/// transforms.
pub async fn get_next_client_transforms_rules(
    next_config: Vc<NextConfig>,
    project_path: &FileSystemPath,
    context_ty: ClientContextType,
    mode: Vc<NextMode>,
    foreign_code: bool,
    encryption_key: ResolvedVc<RcStr>,
    target_browsers: Vc<RuntimeVersions>,
) -> Result<Vec<ModuleRule>> {
    let mut rules = vec![];

    let modularize_imports_config = next_config.modularize_imports();
    let enable_mdx_rs = next_config.mdx_rs().await?.is_some();

    if !foreign_code {
        rules.push(get_next_lint_transform_rule(enable_mdx_rs).await?);
    }

    if !modularize_imports_config.await?.is_empty() {
        rules.push(
            get_next_modularize_imports_rule(modularize_imports_config, enable_mdx_rs).await?,
        );
    }

    // This is purely a performance optimization:
    // - The next-devtools file is very large and rather slow to analyze (unforatunately, at least
    //   with our current implementation)
    // - It's used by every single application in dev, even tiny (CNA) apps
    // - It's prebundled already and doesn't contain any imports/requires
    rules.push(ModuleRule::new(
        RuleCondition::ResourcePathEndsWith(
            "next/dist/compiled/next-devtools/index.js".to_string(),
        ),
        vec![ModuleRuleEffect::ModuleType(ModuleType::Custom(
            ResolvedVc::upcast(RawEcmascriptModuleType {}.resolved_cell()),
        ))],
    ));

    rules.push(get_next_font_transform_rule(enable_mdx_rs).await?);

    let is_development = mode.await?.is_development();
    if is_development {
        rules.push(get_debug_fn_name_rule(enable_mdx_rs).await?);
    }

    let use_cache_enabled = *next_config.enable_use_cache().await?;
    let cache_kinds = next_config.cache_kinds().to_resolved().await?;
    let mut is_app_dir = false;

    match &context_ty {
        ClientContextType::Pages { pages_dir } => {
            if !foreign_code {
                rules.push(
                    get_next_pages_transforms_rule(
                        pages_dir.clone(),
                        ExportFilter::StripDataExports,
                        enable_mdx_rs,
                        vec![],
                        &next_config.page_extensions().await?,
                    )
                    .await?,
                );
                rules.push(
                    get_next_disallow_export_all_in_page_rule(enable_mdx_rs, pages_dir.clone())
                        .await?,
                );
            }
        }
        ClientContextType::App { .. } => {
            is_app_dir = true;
            rules.push(
                get_server_actions_transform_rule(
                    mode,
                    ActionsTransform::Client,
                    encryption_key,
                    enable_mdx_rs,
                    use_cache_enabled,
                    cache_kinds,
                )
                .await?,
            );
        }
        ClientContextType::Fallback | ClientContextType::Other => {}
    };

    if !foreign_code {
        rules.push(get_next_cjs_optimizer_rule(enable_mdx_rs).await?);
        rules.push(get_next_pure_rule(enable_mdx_rs).await?);

        rules.push(
            get_next_dynamic_transform_rule(false, false, is_app_dir, mode, enable_mdx_rs).await?,
        );

        rules.push(get_next_image_rule().await?);

        rules.extend(get_swc_ecma_transform_plugin_rule(next_config, project_path.clone()).await?);
        rules.extend(get_relay_transform_rule(next_config, project_path.clone()).await?);
        rules.extend(get_emotion_transform_rule(next_config).await?);
        rules.extend(get_styled_components_transform_rule(next_config).await?);
        rules.extend(get_styled_jsx_transform_rule(next_config, target_browsers).await?);
        rules.extend(get_react_remove_properties_transform_rule(next_config).await?);
        rules.extend(get_remove_console_transform_rule(next_config).await?);
    }

    Ok(rules)
}
