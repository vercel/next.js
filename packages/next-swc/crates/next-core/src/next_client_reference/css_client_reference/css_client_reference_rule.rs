use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    core::reference_type::{CssReferenceSubType, ReferenceType},
    turbopack::{
        module_options::{ModuleRule, ModuleRuleCondition, ModuleRuleEffect, ModuleType},
        transition::Transition,
    },
};

use super::css_client_reference_module_type::CssClientReferenceModuleType;

pub(crate) fn get_next_css_client_reference_transforms_rule(
    client_transition: Vc<Box<dyn Transition>>,
) -> ModuleRule {
    let module_type = CssClientReferenceModuleType::new(client_transition);

    ModuleRule::new_internal(
        // Override the default module type for CSS assets. Instead, they will go through the
        // custom CSS client reference module type, which will:
        // 1. Chunk them through the client chunking context.
        // 2. Propagate them to the client references manifest.
        ModuleRuleCondition::all(vec![ModuleRuleCondition::ReferenceType(
            ReferenceType::Css(CssReferenceSubType::Internal),
        )]),
        vec![ModuleRuleEffect::ModuleType(ModuleType::Custom(
            Vc::upcast(module_type),
        ))],
    )
}
