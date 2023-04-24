use anyhow::Result;
use next_transform_strip_page_exports::ExportFilter;
use turbo_binding::turbopack::turbopack::module_options::ModuleRule;

use crate::{
    next_config::NextConfigVc,
    next_server::context::ServerContextType,
    next_shared::transforms::{
        get_next_dynamic_transform_rule, get_next_font_transform_rule, get_next_image_rule,
        get_next_modularize_imports_rule, get_next_pages_transforms_rule,
    },
};

/// Returns a list of module rules which apply server-side, Next.js-specific
/// transforms.
pub async fn get_next_server_transforms_rules(
    next_config: NextConfigVc,
    context_ty: ServerContextType,
) -> Result<Vec<ModuleRule>> {
    let mut rules = vec![];

    let modularize_imports_config = &next_config.await?.modularize_imports;
    if let Some(modularize_imports_config) = modularize_imports_config {
        rules.push(get_next_modularize_imports_rule(modularize_imports_config));
    }
    rules.push(get_next_font_transform_rule());

    let (is_server_components, pages_dir) = match context_ty {
        ServerContextType::Pages { pages_dir } => (false, Some(pages_dir)),
        ServerContextType::PagesData { pages_dir } => {
            rules.push(
                get_next_pages_transforms_rule(pages_dir, ExportFilter::StripDefaultExport).await?,
            );
            (false, Some(pages_dir))
        }
        ServerContextType::AppSSR { .. } => (false, None),
        ServerContextType::AppRSC { .. } => (true, None),
        ServerContextType::AppRoute { .. } => (false, None),
        ServerContextType::Middleware { .. } => (false, None),
    };

    rules.push(get_next_dynamic_transform_rule(true, true, is_server_components, pages_dir).await?);

    rules.push(get_next_image_rule());

    Ok(rules)
}
