use napi::{Error, JsObject, Result, Unknown as JsUnknown};

// Workaround for https://github.com/napi-rs/napi-rs/issues/1641
pub fn get_named_property<T: for<'a> TryFrom<JsUnknown<'a>, Error = Error>>(
    obj: &JsObject,
    property: &str,
) -> Result<T> {
    let unknown = obj.get_named_property::<JsUnknown>(property)?;
    T::try_from(unknown)
}
