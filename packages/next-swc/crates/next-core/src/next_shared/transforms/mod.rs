pub(crate) mod modularize_imports;
pub(crate) mod next_dynamic;
pub(crate) mod next_font;
pub(crate) mod next_strip_page_exports;
pub(crate) mod relay;

pub use modularize_imports::{get_next_modularize_imports_rule, ModularizeImportPackageConfig};
pub use next_dynamic::get_next_dynamic_transform_rule;
pub use next_font::get_next_font_transform_rule;
pub use next_strip_page_exports::get_next_pages_transforms_rule;
pub use relay::get_relay_transform_plugin;
use turbo_binding::turbopack::{
    core::reference_type::{ReferenceType, UrlReferenceSubType},
    turbopack::module_options::{ModuleRule, ModuleRuleCondition, ModuleRuleEffect, ModuleType},
};
use turbo_tasks::Value;

use crate::next_image::{module::BlurPlaceholderMode, StructuredImageModuleTypeVc};

/// Returns a rule which applies the Next.js dynamic transform.
pub fn get_next_image_rule() -> ModuleRule {
    ModuleRule::new(
        ModuleRuleCondition::any(vec![
            ModuleRuleCondition::ResourcePathEndsWith(".jpg".to_string()),
            ModuleRuleCondition::ResourcePathEndsWith(".jpeg".to_string()),
            ModuleRuleCondition::ResourcePathEndsWith(".png".to_string()),
            ModuleRuleCondition::ResourcePathEndsWith(".webp".to_string()),
            ModuleRuleCondition::ResourcePathEndsWith(".avif".to_string()),
            ModuleRuleCondition::ResourcePathEndsWith(".apng".to_string()),
            ModuleRuleCondition::ResourcePathEndsWith(".gif".to_string()),
            ModuleRuleCondition::ResourcePathEndsWith(".svg".to_string()),
        ]),
        vec![ModuleRuleEffect::ModuleType(ModuleType::Custom(
            StructuredImageModuleTypeVc::new(Value::new(BlurPlaceholderMode::DataUrl)).into(),
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
