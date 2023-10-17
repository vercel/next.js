pub(crate) mod emotion;
pub(crate) mod modularize_imports;
pub(crate) mod next_dynamic;
pub(crate) mod next_font;
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
pub use relay::get_relay_transform_plugin;
pub use server_actions::get_server_actions_transform_rule;
use turbo_tasks::{Value, Vc};
use turbopack_binding::turbopack::{
    core::reference_type::{ReferenceType, UrlReferenceSubType},
    turbopack::module_options::{ModuleRule, ModuleRuleCondition, ModuleRuleEffect, ModuleType},
};

use crate::next_image::{module::BlurPlaceholderMode, StructuredImageModuleType};

/// Returns a rule which applies the Next.js dynamic transform.
pub fn get_next_image_rule() -> ModuleRule {
    ModuleRule::new(
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
            // As turbopack-image returns raw bytes if compile time codec support is not enabled:
            // ref:https://github.com/vercel/turbo/pull/5967
            ModuleRuleCondition::ResourcePathEndsWith(".webp".to_string()),
            ModuleRuleCondition::ResourcePathEndsWith(".avif".to_string()),
        ]),
        vec![ModuleRuleEffect::ModuleType(ModuleType::Custom(
            Vc::upcast(StructuredImageModuleType::new(Value::new(
                BlurPlaceholderMode::DataUrl,
            ))),
        ))],
    )
}

pub(crate) fn module_rule_match_js_no_url() -> ModuleRuleCondition {
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
