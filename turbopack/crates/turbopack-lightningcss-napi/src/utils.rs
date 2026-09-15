use napi::{
    Result, ValueType,
    bindgen_prelude::{Function, JsObjectValue, Object, Unknown},
};

/// Read a named property as an `Unknown`.
///
/// On napi v3 the typed `Object::get_named_property::<T>` validates the value
/// against `T` before returning. That validation used to be unreliable for
/// functions in compat mode (silently returning `Err`), so we read the raw
/// `Unknown` and let callers check/convert it explicitly.
pub fn get_named_unknown<'env>(obj: &Object<'env>, property: &str) -> Result<Unknown<'env>> {
    obj.get_named_property_unchecked::<Unknown>(property)
}

/// Get a named property as a JS function, if present and callable.
pub fn get_named_function<'env>(obj: &Object<'env>, property: &str) -> Option<Function<'env>> {
    let unknown = get_named_unknown(obj, property).ok()?;
    as_function(unknown)
}

/// Get a named property as a JS object, if present.
pub fn get_named_object<'env>(obj: &Object<'env>, property: &str) -> Option<Object<'env>> {
    let unknown = get_named_unknown(obj, property).ok()?;
    as_object(unknown)
}

/// Convert an `Unknown` into a `Function` if it is one.
pub fn as_function<'env>(value: Unknown<'env>) -> Option<Function<'env>> {
    match value.get_type() {
        Ok(ValueType::Function) => unsafe { value.cast::<Function<'env>>().ok() },
        _ => None,
    }
}

/// Convert an `Unknown` into an `Object` if it is one.
pub fn as_object<'env>(value: Unknown<'env>) -> Option<Object<'env>> {
    match value.get_type() {
        Ok(ValueType::Object) => unsafe { value.cast::<Object<'env>>().ok() },
        _ => None,
    }
}
