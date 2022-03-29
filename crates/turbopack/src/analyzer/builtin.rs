use super::JsValue;

pub fn replace_builtin(value: JsValue) -> (JsValue, bool) {
    (
        match value {
            JsValue::Member(box JsValue::Unknown(inner, reason), prop) => JsValue::Unknown(
                Some(box JsValue::Member(
                    box JsValue::Unknown(inner, reason),
                    prop,
                )),
                "property on unknown",
            ),
            JsValue::Member(box JsValue::Array(mut array), box JsValue::Unknown(inner, reason)) => {
                array.push(JsValue::Unknown(
                    Some(box JsValue::Member(
                        box JsValue::Array(Vec::new()),
                        box JsValue::Unknown(inner, reason),
                    )),
                    "unknown array prototype methods or values",
                ));
                JsValue::Alternatives(array)
            }
            _ => return (value, false),
        },
        true,
    )
}
