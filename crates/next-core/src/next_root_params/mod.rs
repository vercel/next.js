use std::iter;

use anyhow::Result;
use indoc::formatdoc;
use itertools::Itertools;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileContent;
use turbopack_core::{
    asset::AssetContent,
    resolve::{ResolveResult, options::ImportMapping},
    virtual_source::VirtualSource,
};

use crate::{app_structure::CollectedRootParams, embed_js::next_js_file_path};

#[turbo_tasks::function]
pub async fn get_next_root_params_mapping(
    collected_root_params: Option<Vc<CollectedRootParams>>,
) -> Result<Vc<ImportMapping>> {
    let module_content = match collected_root_params {
        // If there's no root params, export nothing.
        None => "export {}".to_string(),
        Some(collected_root_params_vc) => {
            let collected_root_params = collected_root_params_vc.to_resolved().await?.await?;
            iter::once(formatdoc!(
                r#"
                    import {{ getRootParam }} from 'next/dist/server/request/root-params';
                "#,
            ))
            .chain(collected_root_params.iter().map(|param_name| {
                formatdoc!(
                    r#"
                        export function {param_name}() {{
                            return getRootParam('{param_name}');
                        }}
                    "#,
                    param_name = param_name,
                )
            }))
            .join("\n")
        }
    };

    let js_asset = VirtualSource::new(
        next_js_file_path("root-params.js".into()),
        AssetContent::file(FileContent::Content(module_content.into()).cell()),
    )
    .to_resolved()
    .await?;

    let mapping = ImportMapping::Direct(ResolveResult::source(ResolvedVc::upcast(js_asset)));
    Ok(mapping.cell())
}
