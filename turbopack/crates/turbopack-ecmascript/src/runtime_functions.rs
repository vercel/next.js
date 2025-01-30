use std::fmt::{Display, Formatter};

use swc_core::ecma::ast::{Expr, MemberExpr, MemberProp};
use turbopack_core::compile_time_info::FreeVarReference;

pub struct TurbopackRuntimeFunctionShortcut {
    pub shortcut: &'static str,
    pub full: &'static str,
}

impl TurbopackRuntimeFunctionShortcut {
    pub const fn new(full: &'static str, shortcut: &'static str) -> Self {
        Self { full, shortcut }
    }
}

impl Display for TurbopackRuntimeFunctionShortcut {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.full)
    }
}

impl From<&TurbopackRuntimeFunctionShortcut> for FreeVarReference {
    fn from(val: &TurbopackRuntimeFunctionShortcut) -> Self {
        FreeVarReference::Member("__turbopack_context__".into(), val.shortcut.into())
    }
}

impl From<&TurbopackRuntimeFunctionShortcut> for Expr {
    fn from(val: &TurbopackRuntimeFunctionShortcut) -> Self {
        Expr::Member(MemberExpr {
            obj: Box::new(Expr::Ident("__turbopack_context__".into())),
            prop: MemberProp::Ident(val.shortcut.into()),
            ..Default::default()
        })
    }
}

pub const TURBOPACK_REQUIRE: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.r", "r");
pub const TURBOPACK_MODULE_CONTEXT: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.f", "f");
pub const TURBOPACK_IMPORT: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.i", "i");
pub const TURBOPACK_ESM: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.s", "s");
pub const TURBOPACK_EXPORT_VALUE: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.v", "v");
pub const TURBOPACK_EXPORT_NAMESPACE: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.n", "n");
pub const TURBOPACK_CACHE: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.c", "c");
pub const TURBOPACK_MODULES: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.M", "M");
pub const TURBOPACK_LOAD: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.l", "l");
pub const TURBOPACK_DYNAMIC: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.j", "j");
pub const TURBOPACK_RESOLVE_ABSOLUTE_PATH: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.P", "P");
pub const TURBOPACK_RELATIVE_URL: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.U", "U");
pub const TURBOPACK_RESOLVE_MODULE_ID_PATH: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.R", "R");
pub const TURBOPACK_WORKER_BLOB_URL: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.b", "b");
pub const TURBOPACK_ASYNC_MODULE: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.a", "a");
pub const TURBOPACK_EXTERNAL_REQUIRE: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.x", "x");
pub const TURBOPACK_EXTERNAL_IMPORT: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.y", "y");
pub const TURBOPACK_REFRESH: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.k", "k");
pub const TURBOPACK_REQUIRE_STUB: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.z", "z");
pub const TURBOPACK_REQUIRE_REAL: &TurbopackRuntimeFunctionShortcut =
    &TurbopackRuntimeFunctionShortcut::new("__turbopack_context__.t", "t");

pub const TUBROPACK_RUNTIME_FUNCTION_SHORTCUTS: [(&str, &TurbopackRuntimeFunctionShortcut); 20] = [
    ("__turbopack_require__", TURBOPACK_REQUIRE),
    ("__turbopack_module_context__", TURBOPACK_MODULE_CONTEXT),
    ("__turbopack_import__", TURBOPACK_IMPORT),
    ("__turbopack_esm__", TURBOPACK_ESM),
    ("__turbopack_export_value__", TURBOPACK_EXPORT_VALUE),
    ("__turbopack_export_namespace__", TURBOPACK_EXPORT_NAMESPACE),
    ("__turbopack_cache__", TURBOPACK_CACHE),
    ("__turbopack_modules__", TURBOPACK_MODULES),
    ("__turbopack_load__", TURBOPACK_LOAD),
    ("__turbopack_dynamic__", TURBOPACK_DYNAMIC),
    (
        "__turbopack_resolve_absolute_path__",
        TURBOPACK_RESOLVE_ABSOLUTE_PATH,
    ),
    ("__turbopack_relative_url__", TURBOPACK_RELATIVE_URL),
    (
        "__turbopack_resolve_module_id_path__",
        TURBOPACK_RESOLVE_MODULE_ID_PATH,
    ),
    ("__turbopack_worker_blob_url__", TURBOPACK_WORKER_BLOB_URL),
    ("__turbopack_async_module__", TURBOPACK_ASYNC_MODULE),
    ("__turbopack_external_require__", TURBOPACK_EXTERNAL_REQUIRE),
    ("__turbopack_external_import__", TURBOPACK_EXTERNAL_IMPORT),
    ("__turbopack_refresh__", TURBOPACK_REFRESH),
    ("__turbopack_require_stub__", TURBOPACK_REQUIRE_STUB),
    ("__turbopack_require_real__", TURBOPACK_REQUIRE_REAL),
];
