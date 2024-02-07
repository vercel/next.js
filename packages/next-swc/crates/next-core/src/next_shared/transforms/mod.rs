pub(crate) mod emotion;
pub(crate) mod modularize_imports;
pub(crate) mod next_amp_attributes;
pub(crate) mod next_cjs_optimizer;
pub(crate) mod next_disallow_re_export_all_in_page;
pub(crate) mod next_dynamic;
pub(crate) mod next_font;
pub(crate) mod next_optimize_server_react;
pub(crate) mod next_page_config;
pub(crate) mod next_pure;
pub(crate) mod next_react_server_components;
pub(crate) mod next_shake_exports;
pub(crate) mod next_strip_page_exports;
pub(crate) mod relay;
pub(crate) mod server_actions;
pub(crate) mod styled_components;
pub(crate) mod styled_jsx;
pub(crate) mod swc_ecma_transform_plugins;

pub use modularize_imports::{get_next_modularize_imports_rule, ModularizeImportPackageConfig};
pub use next_dynamic::get_next_dynamic_transform_rule;
pub use next_font::get_next_font_transform_rule;
pub use next_strip_page_exports::get_next_pages_transforms_rule;
pub use server_actions::get_server_actions_transform_rule;
use turbo_tasks::{ReadRef, Value, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_binding::turbopack::{
    core::reference_type::{ReferenceType, UrlReferenceSubType},
    ecmascript::{CustomTransformer, EcmascriptInputTransform},
    turbopack::module_options::{ModuleRule, ModuleRuleCondition, ModuleRuleEffect, ModuleType},
};

use crate::next_image::{module::BlurPlaceholderMode, StructuredImageModuleType};

pub fn get_next_image_rule() -> ModuleRule {
    ModuleRule::new(
        ModuleRuleCondition::All(vec![
            // avoid urlAssetReference to be affected by this rule, since urlAssetReference
            // requires raw module to have its paths in the export
            ModuleRuleCondition::not(ModuleRuleCondition::ReferenceType(ReferenceType::Url(
                UrlReferenceSubType::Undefined,
            ))),
            ModuleRuleCondition::any(vec![
                ModuleRuleCondition::ResourcePathEndsWith(".jpg".to_string()),
                ModuleRuleCondition::ResourcePathEndsWith(".jpeg".to_string()),
                ModuleRuleCondition::ResourcePathEndsWith(".png".to_string()),
                ModuleRuleCondition::ResourcePathEndsWith(".apng".to_string()),
                ModuleRuleCondition::ResourcePathEndsWith(".gif".to_string()),
                ModuleRuleCondition::ResourcePathEndsWith(".svg".to_string()),
                ModuleRuleCondition::ResourcePathEndsWith(".bmp".to_string()),
                ModuleRuleCondition::ResourcePathEndsWith(".ico".to_string()),
                // These images may not be encoded by turbopack depends on the feature availability
                // As turbopack-image returns raw bytes if compile time codec support is not
                // enabled: ref:https://github.com/vercel/turbo/pull/5967
                ModuleRuleCondition::ResourcePathEndsWith(".webp".to_string()),
                ModuleRuleCondition::ResourcePathEndsWith(".avif".to_string()),
            ]),
        ]),
        vec![ModuleRuleEffect::ModuleType(ModuleType::Custom(
            Vc::upcast(StructuredImageModuleType::new(Value::new(
                BlurPlaceholderMode::DataUrl,
            ))),
        ))],
    )
}

fn match_js_extension(enable_mdx_rs: bool) -> Vec<ModuleRuleCondition> {
    let mut conditions = vec![
        ModuleRuleCondition::ResourcePathEndsWith(".js".to_string()),
        ModuleRuleCondition::ResourcePathEndsWith(".jsx".to_string()),
        ModuleRuleCondition::ResourcePathEndsWith(".ts".to_string()),
        ModuleRuleCondition::ResourcePathEndsWith(".tsx".to_string()),
        ModuleRuleCondition::ResourcePathEndsWith(".mjs".to_string()),
        ModuleRuleCondition::ResourcePathEndsWith(".cjs".to_string()),
    ];

    if enable_mdx_rs {
        conditions.append(
            vec![
                ModuleRuleCondition::ResourcePathEndsWith(".md".to_string()),
                ModuleRuleCondition::ResourcePathEndsWith(".mdx".to_string()),
            ]
            .as_mut(),
        );
    }
    conditions
}

/// Returns a module rule condition matches to any ecmascript (with mdx if
/// enabled) except url reference type. This is a typical custom rule matching
/// condition for custom ecma specific transforms.
pub(crate) fn module_rule_match_js_no_url(enable_mdx_rs: bool) -> ModuleRuleCondition {
    let conditions = match_js_extension(enable_mdx_rs);

    ModuleRuleCondition::all(vec![
        ModuleRuleCondition::not(ModuleRuleCondition::ReferenceType(ReferenceType::Url(
            UrlReferenceSubType::Undefined,
        ))),
        ModuleRuleCondition::any(conditions),
    ])
}

pub(crate) fn module_rule_match_pages_page_file(
    enable_mdx_rs: bool,
    pages_directory: ReadRef<FileSystemPath>,
) -> ModuleRuleCondition {
    let conditions = match_js_extension(enable_mdx_rs);

    ModuleRuleCondition::all(vec![
        ModuleRuleCondition::not(ModuleRuleCondition::ReferenceType(ReferenceType::Url(
            UrlReferenceSubType::Undefined,
        ))),
        ModuleRuleCondition::ResourcePathInExactDirectory(pages_directory),
        ModuleRuleCondition::any(conditions),
    ])
}

/// Create a new module rule for the given ecmatransform, runs against
/// any ecmascript (with mdx if enabled) except url reference type
pub(crate) fn get_ecma_transform_rule(
    transformer: Box<dyn CustomTransformer + Send + Sync>,
    enable_mdx_rs: bool,
    prepend: bool,
) -> ModuleRule {
    let transformer = EcmascriptInputTransform::Plugin(Vc::cell(transformer as _));
    let (prepend, append) = if prepend {
        (Vc::cell(vec![transformer]), Vc::cell(vec![]))
    } else {
        (Vc::cell(vec![]), Vc::cell(vec![transformer]))
    };

    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms { prepend, append }],
    )
}
