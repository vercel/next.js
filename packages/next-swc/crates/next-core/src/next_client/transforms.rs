use anyhow::Result;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::NextJsPageExportFilter;

use crate::{
    next_client::context::ClientContextType,
    next_shared::transforms::{
        get_next_dynamic_transform_rule, get_next_font_transform_rule,
        get_next_pages_transforms_rule,
    },
};

/// Returns a list of module rules which apply client-side, Next.js-specific
/// transforms.
pub async fn get_next_client_transforms_rules(
    context_ty: ClientContextType,
) -> Result<Vec<ModuleRule>> {
    let mut rules = vec![];

    rules.push(get_next_font_transform_rule());

    let pages_dir = match context_ty {
        ClientContextType::Pages { pages_dir } => {
            rules.push(
                get_next_pages_transforms_rule(pages_dir, NextJsPageExportFilter::StripDataExports)
                    .await?,
            );
            Some(pages_dir)
        }
        ClientContextType::App { .. } | ClientContextType::Fallback | ClientContextType::Other => {
            None
        }
    };

    rules.push(get_next_dynamic_transform_rule(
        true, false, false, pages_dir,
    ));

    Ok(rules)
}
