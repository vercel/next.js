pub(crate) mod debug_fn_name;
pub(crate) mod emotion;
pub(crate) mod modularize_imports;
pub(crate) mod next_cjs_optimizer;
pub(crate) mod next_disallow_re_export_all_in_page;
pub(crate) mod next_dynamic;
pub(crate) mod next_edge_node_api_assert;
pub(crate) mod next_font;
pub(crate) mod next_lint;
pub(crate) mod next_middleware_dynamic_assert;
pub(crate) mod next_optimize_server_react;
pub(crate) mod next_pure;
pub(crate) mod next_react_server_components;
pub(crate) mod next_strip_page_exports;
pub(crate) mod next_track_dynamic_imports;
pub(crate) mod react_remove_properties;
pub(crate) mod relay;
pub(crate) mod remove_console;
pub(crate) mod server_actions;
pub(crate) mod styled_components;
pub(crate) mod styled_jsx;
pub(crate) mod swc_ecma_transform_plugins;

use anyhow::Result;
pub use modularize_imports::{ModularizeImportPackageConfig, get_next_modularize_imports_rule};
pub use next_dynamic::get_next_dynamic_transform_rule;
pub use next_font::get_next_font_transform_rule;
pub use next_lint::get_next_lint_transform_rule;
pub use next_strip_page_exports::get_next_pages_transforms_rule;
pub use next_track_dynamic_imports::get_next_track_dynamic_imports_transform_rule;
pub use server_actions::get_server_actions_transform_rule;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect, ModuleType, RuleCondition};
use turbopack_core::reference_type::{
    EcmaScriptModulesReferenceSubType, ImportWithType, ReferenceType, UrlReferenceSubType,
};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform};

use crate::next_image::{StructuredImageModuleType, module::BlurPlaceholderMode};

pub async fn get_next_image_rule() -> Result<ModuleRule> {
    Ok(ModuleRule::new(
        RuleCondition::All(vec![
            // avoid urlAssetReference to be affected by this rule, since urlAssetReference
            // requires raw module to have its paths in the export
            RuleCondition::not(RuleCondition::ReferenceType(ReferenceType::Url(
                UrlReferenceSubType::Undefined,
            ))),
            RuleCondition::any(vec![
                RuleCondition::ResourcePathEndsWith(".jpg".to_string()),
                RuleCondition::ResourcePathEndsWith(".jpeg".to_string()),
                RuleCondition::ResourcePathEndsWith(".png".to_string()),
                RuleCondition::ResourcePathEndsWith(".apng".to_string()),
                RuleCondition::ResourcePathEndsWith(".gif".to_string()),
                RuleCondition::ResourcePathEndsWith(".svg".to_string()),
                RuleCondition::ResourcePathEndsWith(".bmp".to_string()),
                RuleCondition::ResourcePathEndsWith(".ico".to_string()),
                // These images may not be encoded by turbopack depends on the feature availability
                // As turbopack-image returns raw bytes if compile time codec support is not
                // enabled: ref:https://github.com/vercel/turbo/pull/5967
                RuleCondition::ResourcePathEndsWith(".webp".to_string()),
                RuleCondition::ResourcePathEndsWith(".avif".to_string()),
            ]),
        ]),
        vec![ModuleRuleEffect::ModuleType(ModuleType::Custom(
            ResolvedVc::upcast(
                StructuredImageModuleType::new(BlurPlaceholderMode::DataUrl)
                    .to_resolved()
                    .await?,
            ),
        ))],
    ))
}

fn match_js_extension(enable_mdx_rs: bool) -> RuleCondition {
    let mut conditions = vec![
        RuleCondition::ResourcePathEndsWith(".js".to_string()),
        RuleCondition::ResourcePathEndsWith(".jsx".to_string()),
        RuleCondition::All(vec![
            RuleCondition::ResourcePathEndsWith(".ts".to_string()),
            RuleCondition::Not(Box::new(RuleCondition::ResourcePathEndsWith(
                ".d.ts".to_string(),
            ))),
        ]),
        RuleCondition::ResourcePathEndsWith(".tsx".to_string()),
        RuleCondition::ResourcePathEndsWith(".mjs".to_string()),
        RuleCondition::ResourcePathEndsWith(".cjs".to_string()),
        RuleCondition::ContentTypeStartsWith("application/javascript".to_string()),
        RuleCondition::ContentTypeStartsWith("text/javascript".to_string()),
    ];

    if enable_mdx_rs {
        conditions.append(
            vec![
                RuleCondition::ResourcePathEndsWith(".md".to_string()),
                RuleCondition::ResourcePathEndsWith(".mdx".to_string()),
                RuleCondition::ContentTypeStartsWith("text/markdown".to_string()),
            ]
            .as_mut(),
        );
    }
    RuleCondition::any(conditions)
}

/// Returns a module rule condition matches to any ecmascript (with mdx if
/// enabled) except url reference type. This is a typical custom rule matching
/// condition for custom ecma specific transforms.
pub(crate) fn module_rule_match_js_no_url(enable_mdx_rs: bool) -> RuleCondition {
    RuleCondition::all(vec![
        RuleCondition::not(RuleCondition::ReferenceType(ReferenceType::Url(
            UrlReferenceSubType::Undefined,
        ))),
        match_js_extension(enable_mdx_rs),
    ])
}

pub(crate) fn module_rule_match_pages_page_file(
    enable_mdx_rs: bool,
    pages_directory: FileSystemPath,
) -> RuleCondition {
    RuleCondition::all(vec![
        module_rule_match_js_no_url(enable_mdx_rs),
        RuleCondition::ResourcePathInExactDirectory(pages_directory),
    ])
}

pub(crate) fn get_import_type_bytes_rule() -> ModuleRule {
    // Move this into turbopack once the feature is standardized
    ModuleRule::new(
        RuleCondition::ReferenceType(ReferenceType::EcmaScriptModules(
            EcmaScriptModulesReferenceSubType::ImportWithType(ImportWithType::Bytes),
        )),
        vec![ModuleRuleEffect::ModuleType(ModuleType::InlinedBytesJs)],
    )
}

pub(crate) enum EcmascriptTransformStage {
    Preprocess,
    Main,
    Postprocess,
}

/// Create a new module rule for the given ecmatransform, runs against
/// any ecmascript (with mdx if enabled) except url reference type
pub(crate) fn get_ecma_transform_rule(
    transformer: Box<dyn CustomTransformer + Send + Sync>,
    enable_mdx_rs: bool,
    stage: EcmascriptTransformStage,
) -> ModuleRule {
    let transformer = EcmascriptInputTransform::Plugin(ResolvedVc::cell(transformer as _));
    let (preprocess, main, postprocess) = match stage {
        EcmascriptTransformStage::Preprocess => (vec![transformer], vec![], vec![]),
        EcmascriptTransformStage::Main => (vec![], vec![transformer], vec![]),
        EcmascriptTransformStage::Postprocess => (vec![], vec![], vec![transformer]),
    };

    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: ResolvedVc::cell(preprocess),
            main: ResolvedVc::cell(main),
            postprocess: ResolvedVc::cell(postprocess),
        }],
    )
}
