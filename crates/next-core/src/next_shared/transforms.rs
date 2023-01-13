use anyhow::Result;
use turbo_tasks::primitives::StringsVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::module_options::{ModuleRule, ModuleRuleCondition, ModuleRuleEffect};
use turbopack_core::reference_type::{ReferenceType, UrlReferenceSubType};
use turbopack_ecmascript::{
    EcmascriptInputTransform, EcmascriptInputTransformsVc, NextJsPageExportFilter,
};

/// Returns a rule which applies the Next.js page export stripping transform.
pub async fn get_next_pages_transforms_rule(
    pages_dir: FileSystemPathVc,
    export_filter: NextJsPageExportFilter,
) -> Result<ModuleRule> {
    // Apply the Next SSG transform to all pages.
    let strip_transform = EcmascriptInputTransform::NextJsStripPageExports(export_filter);
    Ok(ModuleRule::new(
        ModuleRuleCondition::all(vec![
            ModuleRuleCondition::all(vec![
                ModuleRuleCondition::ResourcePathInExactDirectory(pages_dir.await?),
                ModuleRuleCondition::not(ModuleRuleCondition::ResourcePathInExactDirectory(
                    pages_dir.join("api").await?,
                )),
                ModuleRuleCondition::not(ModuleRuleCondition::any(vec![
                    // TODO(alexkirsz): Possibly ignore _app as well?
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.js").await?),
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.jsx").await?),
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.ts").await?),
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.tsx").await?),
                ])),
            ]),
            module_rule_match_js_no_url(),
        ]),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(
            EcmascriptInputTransformsVc::cell(vec![strip_transform]),
        )],
    ))
}

/// Returns a rule which applies the Next.js dynamic transform.
pub fn get_next_dynamic_transform_rule(
    is_development: bool,
    is_server: bool,
    is_server_components: bool,
    pages_dir: Option<FileSystemPathVc>,
) -> ModuleRule {
    let dynamic_transform = EcmascriptInputTransform::NextJsDynamic {
        is_development,
        is_server,
        is_server_components,
        pages_dir,
    };
    ModuleRule::new(
        module_rule_match_js_no_url(),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(
            EcmascriptInputTransformsVc::cell(vec![dynamic_transform]),
        )],
    )
}

/// Returns a rule which applies the Next.js font transform.
pub fn get_next_font_transform_rule() -> ModuleRule {
    #[allow(unused_mut)] // This is mutated when next-font-local is enabled
    let mut font_loaders = vec!["@next/font/google".to_owned()];
    #[cfg(feature = "next-font-local")]
    font_loaders.push("@next/font/local".to_owned());

    ModuleRule::new(
        // TODO: Only match in pages (not pages/api), app/, etc.
        module_rule_match_js_no_url(),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(
            EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::NextJsFont(
                StringsVc::cell(font_loaders),
            )]),
        )],
    )
}

fn module_rule_match_js_no_url() -> ModuleRuleCondition {
    ModuleRuleCondition::all(vec![
        ModuleRuleCondition::not(ModuleRuleCondition::ReferenceType(ReferenceType::Url(
            UrlReferenceSubType::Undefined,
        ))),
        ModuleRuleCondition::any(vec![
            ModuleRuleCondition::ResourcePathEndsWith(".js".to_string()),
            ModuleRuleCondition::ResourcePathEndsWith(".jsx".to_string()),
            ModuleRuleCondition::ResourcePathEndsWith(".ts".to_string()),
            ModuleRuleCondition::ResourcePathEndsWith(".tsx".to_string()),
        ]),
    ])
}
