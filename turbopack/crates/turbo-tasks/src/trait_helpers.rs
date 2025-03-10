use std::borrow::Cow;

use crate::{registry, FunctionId, TraitType, TraitTypeId, ValueTypeId};

pub fn get_trait_method(
    trait_type: TraitTypeId,
    value_type: ValueTypeId,
    name: Cow<'static, str>,
) -> Result<FunctionId, Cow<'static, str>> {
    let key = (trait_type, name);
    if let Some(func) = registry::get_value_type(value_type).get_trait_method(&key) {
        Ok(*func)
    } else if let Some(func) = registry::get_trait(trait_type)
        .methods
        .get(&key.1)
        .and_then(|method| method.default_method)
    {
        Ok(func)
    } else {
        Err(key.1)
    }
}

pub fn has_trait(value_type: ValueTypeId, trait_type: TraitTypeId) -> bool {
    registry::get_value_type(value_type).has_trait(&trait_type)
}

pub fn traits(value_type: ValueTypeId) -> Vec<&'static TraitType> {
    registry::get_value_type(value_type)
        .traits_iter()
        .map(registry::get_trait)
        .collect()
}
