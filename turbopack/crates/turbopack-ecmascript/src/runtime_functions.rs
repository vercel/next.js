pub const TURBOPACK_REQUIRE: &str = "__turbopack_context__.r";
pub const TURBOPACK_MODULE_CONTEXT: &str = "__turbopack_context__.f";
pub const TURBOPACK_IMPORT: &str = "__turbopack_context__.i";
pub const TURBOPACK_ESM: &str = "__turbopack_context__.s";
pub const TURBOPACK_EXPORT_VALUE: &str = "__turbopack_context__.v";
pub const TURBOPACK_EXPORT_NAMESPACE: &str = "__turbopack_context__.n";
pub const TURBOPACK_CACHE: &str = "__turbopack_context__.c";
pub const TURBOPACK_MODULES: &str = "__turbopack_context__.M";
pub const TURBOPACK_LOAD: &str = "__turbopack_context__.l";
pub const TURBOPACK_DYNAMIC: &str = "__turbopack_context__.j";
pub const TURBOPACK_RESOLVE_ABSOLUTE_PATH: &str = "__turbopack_context__.P";
pub const TURBOPACK_RELATIVE_URL: &str = "__turbopack_context__.U";
pub const TURBOPACK_RESOLVE_MODULE_ID_PATH: &str = "__turbopack_context__.R";
pub const TURBOPACK_WORKER_BLOB_URL: &str = "__turbopack_context__.b";
pub const TURBOPACK_ASYNC_MODULE: &str = "__turbopack_context__.a";
pub const TURBOPACK_EXTERNAL_REQUIRE: &str = "__turbopack_context__.x";
pub const TURBOPACK_EXTERNAL_IMPORT: &str = "__turbopack_context__.y";
pub const TURBOPACK_REFRESH: &str = "__turbopack_context__.k";
pub const TURBOPACK_REQUIRE_STUB: &str = "__turbopack_context__.z";
pub const TURBOPACK_REQUIRE_REAL: &str = "__turbopack_context__.t";

pub const TUBROPACK_RUNTIME_FUNCTION_SHORTCUTS: [(&str, &str); 20] = [
    ("__turbopack_require__", "r"),
    ("__turbopack_module_context__", "f"),
    ("__turbopack_import__", "i"),
    ("__turbopack_esm__", "s"),
    ("__turbopack_export_value__", "v"),
    ("__turbopack_export_namespace__", "n"),
    ("__turbopack_cache__", "c"),
    ("__turbopack_modules__", "M"),
    ("__turbopack_load__", "l"),
    ("__turbopack_dynamic__", "j"),
    ("__turbopack_resolve_absolute_path__", "P"),
    ("__turbopack_relative_url__", "U"),
    ("__turbopack_resolve_module_id_path__", "R"),
    ("__turbopack_worker_blob_url__", "b"),
    ("__turbopack_async_module__", "a"),
    ("__turbopack_external_require__", "x"),
    ("__turbopack_external_import__", "y"),
    ("__turbopack_refresh__", "k"),
    ("__turbopack_require_stub__", "z"),
    ("__turbopack_require_real__", "t"),
];
