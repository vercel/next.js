use std::env;

const DEBUG_JS_VAR: &str = "TURBOPACK_DEBUG_JS";

/// Checks if the operation passed is included in the `TURBOPACK_DEBUG_JS` env
/// var to enable node.js debugging at runtime.
///
/// This is preferable to manually passing a boolean because recompiling won't
/// be necessary.
pub fn should_debug(operation: &str) -> bool {
    let Ok(val) = env::var(DEBUG_JS_VAR) else {
        return false;
    };

    val == "*" || val.split(',').any(|part| part == operation)
}
