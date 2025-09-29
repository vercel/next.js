use anyhow::Result;
use next_custom_transforms::transforms::strip_page_exports::ExportFilter;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::module_options::{ModuleRule, ModuleRuleEffect, ModuleType, RuleCondition};

use crate::{
    mode::NextMode,
    next_client::context::ClientContextType,
    next_config::NextConfig,
    next_shared::transforms::{
        debug_fn_name::get_debug_fn_name_rule, get_import_type_bytes_rule,
        get_next_dynamic_transform_rule, get_next_font_transform_rule, get_next_image_rule,
        get_next_lint_transform_rule, get_next_modularize_imports_rule,
        get_next_pages_transforms_rule, get_server_actions_transform_rule,
        next_cjs_optimizer::get_next_cjs_optimizer_rule,
        next_disallow_re_export_all_in_page::get_next_disallow_export_all_in_page_rule,
        next_pure::get_next_pure_rule, server_actions::ActionsTransform,
    },
    raw_ecmascript_module::RawEcmascriptModuleType,
};

/// Returns a list of module rules which apply client-side, Next.js-specific
/// transforms.
pub async fn get_next_client_transforms_rules(
    next_config: Vc<NextConfig>,
    context_ty: ClientContextType,
    mode: Vc<NextMode>,
    foreign_code: bool,
    encryption_key: ResolvedVc<RcStr>,
) -> Result<Vec<ModuleRule>> {
    let mut rules = vec![];

    let modularize_imports_config = &next_config.modularize_imports().await?;
    let enable_mdx_rs = next_config.mdx_rs().await?.is_some();

    if !foreign_code {
        rules.push(get_next_lint_transform_rule(enable_mdx_rs));
    }

    if !modularize_imports_config.is_empty() {
        rules.push(get_next_modularize_imports_rule(
            modularize_imports_config,
            enable_mdx_rs,
        ));
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

    rules.push(get_next_font_transform_rule(enable_mdx_rs));

    let is_development = mode.await?.is_development();
    if is_development {
        rules.push(get_debug_fn_name_rule(enable_mdx_rs));
    }

    let use_cache_enabled = *next_config.enable_use_cache().await?;
    let cache_kinds = next_config.cache_kinds().to_resolved().await?;
    let mut is_app_dir = false;

    match &context_ty {
        ClientContextType::Pages { pages_dir } => {
            if !foreign_code {
                rules.push(get_next_pages_transforms_rule(
                    pages_dir.clone(),
                    ExportFilter::StripDataExports,
                    enable_mdx_rs,
                    vec![],
                )?);
                rules.push(get_next_disallow_export_all_in_page_rule(
                    enable_mdx_rs,
                    pages_dir.clone(),
                ));
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
        rules.push(get_next_cjs_optimizer_rule(enable_mdx_rs));
        rules.push(get_next_pure_rule(enable_mdx_rs));

        rules.push(
            get_next_dynamic_transform_rule(false, false, is_app_dir, mode, enable_mdx_rs).await?,
        );

        rules.push(get_next_image_rule().await?);
    }

    if *next_config.turbopack_import_type_bytes().await? {
        rules.push(get_import_type_bytes_rule());
    }

    Ok(rules)
}
