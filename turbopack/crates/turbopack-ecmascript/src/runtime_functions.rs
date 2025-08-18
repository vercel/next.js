use std::fmt::{Display, Formatter};

use swc_core::{
    atoms::atom,
    ecma::ast::{Expr, MemberExpr, MemberProp},
};
use turbo_rcstr::rcstr;
use turbopack_core::compile_time_info::FreeVarReference;

pub struct TurbopackRuntimeFunctionShortcut {
    pub shortcut: &'static str,
    pub full: &'static str,
}

impl TurbopackRuntimeFunctionShortcut {
    pub const fn new(full: &'static str, shortcut: &'static str) -> Self {
        Self { full, shortcut }
    }

    pub fn bound(&self) -> String {
        format!(
            "__turbopack_context__.{}.bind(__turbopack_context__)",
            self.shortcut
        )
    }
}

impl Display for TurbopackRuntimeFunctionShortcut {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.full)
    }
}

impl From<&TurbopackRuntimeFunctionShortcut> for FreeVarReference {
    fn from(val: &TurbopackRuntimeFunctionShortcut) -> Self {
        FreeVarReference::Member(rcstr!("__turbopack_context__"), val.shortcut.into())
    }
}

impl From<&TurbopackRuntimeFunctionShortcut> for Expr {
    fn from(val: &TurbopackRuntimeFunctionShortcut) -> Self {
        Expr::Member(MemberExpr {
            obj: Box::new(Expr::Ident(atom!("__turbopack_context__").into())),
            prop: MemberProp::Ident(val.shortcut.into()),
            ..Default::default()
        })
    }
}

impl<'l> From<&'l TurbopackRuntimeFunctionShortcut> for &'l str {
    fn from(val: &TurbopackRuntimeFunctionShortcut) -> Self {
        val.full
    }
}

macro_rules! make_shortcut {
    ($shortcut:expr) => {
        const {
            &TurbopackRuntimeFunctionShortcut::new(
                concat!("__turbopack_context__.", $shortcut),
                $shortcut,
            )
        }
    };
}

pub const TURBOPACK_EXPORTS: &TurbopackRuntimeFunctionShortcut = make_shortcut!("e");
pub const TURBOPACK_MODULE: &TurbopackRuntimeFunctionShortcut = make_shortcut!("m");
pub const TURBOPACK_REQUIRE: &TurbopackRuntimeFunctionShortcut = make_shortcut!("r");
pub const TURBOPACK_ASYNC_LOADER: &TurbopackRuntimeFunctionShortcut = make_shortcut!("A");
pub const TURBOPACK_MODULE_CONTEXT: &TurbopackRuntimeFunctionShortcut = make_shortcut!("f");
pub const TURBOPACK_IMPORT: &TurbopackRuntimeFunctionShortcut = make_shortcut!("i");
pub const TURBOPACK_ESM: &TurbopackRuntimeFunctionShortcut = make_shortcut!("s");
pub const TURBOPACK_EXPORT_VALUE: &TurbopackRuntimeFunctionShortcut = make_shortcut!("v");
pub const TURBOPACK_EXPORT_NAMESPACE: &TurbopackRuntimeFunctionShortcut = make_shortcut!("n");
pub const TURBOPACK_CACHE: &TurbopackRuntimeFunctionShortcut = make_shortcut!("c");
pub const TURBOPACK_MODULES: &TurbopackRuntimeFunctionShortcut = make_shortcut!("M");
pub const TURBOPACK_LOAD: &TurbopackRuntimeFunctionShortcut = make_shortcut!("l");
pub const TURBOPACK_LOAD_BY_URL: &TurbopackRuntimeFunctionShortcut = make_shortcut!("L");
pub const TURBOPACK_CLEAR_CHUNK_CACHE: &TurbopackRuntimeFunctionShortcut = make_shortcut!("C");
pub const TURBOPACK_DYNAMIC: &TurbopackRuntimeFunctionShortcut = make_shortcut!("j");
pub const TURBOPACK_RESOLVE_ABSOLUTE_PATH: &TurbopackRuntimeFunctionShortcut = make_shortcut!("P");
pub const TURBOPACK_RELATIVE_URL: &TurbopackRuntimeFunctionShortcut = make_shortcut!("U");
pub const TURBOPACK_RESOLVE_MODULE_ID_PATH: &TurbopackRuntimeFunctionShortcut = make_shortcut!("R");
pub const TURBOPACK_WORKER_BLOB_URL: &TurbopackRuntimeFunctionShortcut = make_shortcut!("b");
pub const TURBOPACK_ASYNC_MODULE: &TurbopackRuntimeFunctionShortcut = make_shortcut!("a");
pub const TURBOPACK_EXTERNAL_REQUIRE: &TurbopackRuntimeFunctionShortcut = make_shortcut!("x");
pub const TURBOPACK_EXTERNAL_IMPORT: &TurbopackRuntimeFunctionShortcut = make_shortcut!("y");
pub const TURBOPACK_REFRESH: &TurbopackRuntimeFunctionShortcut = make_shortcut!("k");
pub const TURBOPACK_REQUIRE_STUB: &TurbopackRuntimeFunctionShortcut = make_shortcut!("z");
pub const TURBOPACK_REQUIRE_REAL: &TurbopackRuntimeFunctionShortcut = make_shortcut!("t");
pub const TURBOPACK_WASM: &TurbopackRuntimeFunctionShortcut = make_shortcut!("w");
pub const TURBOPACK_WASM_MODULE: &TurbopackRuntimeFunctionShortcut = make_shortcut!("u");
pub const TURBOPACK_GLOBAL: &TurbopackRuntimeFunctionShortcut = make_shortcut!("g");

/// Adding an entry to this list will automatically ensure that `__turbopack_XXX__` can be called
/// from user code (by inserting a replacement into free_var_references)
pub const TURBOPACK_RUNTIME_FUNCTION_SHORTCUTS: [(&str, &TurbopackRuntimeFunctionShortcut); 22] = [
    ("__turbopack_require__", TURBOPACK_REQUIRE),
    ("__turbopack_module_context__", TURBOPACK_MODULE_CONTEXT),
    ("__turbopack_import__", TURBOPACK_IMPORT),
    ("__turbopack_export_value__", TURBOPACK_EXPORT_VALUE),
    ("__turbopack_export_namespace__", TURBOPACK_EXPORT_NAMESPACE),
    ("__turbopack_cache__", TURBOPACK_CACHE),
    ("__turbopack_modules__", TURBOPACK_MODULES),
    ("__turbopack_load__", TURBOPACK_LOAD),
    ("__turbopack_load_by_url__", TURBOPACK_LOAD_BY_URL),
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
    ("__turbopack_external_require__", TURBOPACK_EXTERNAL_REQUIRE),
    ("__turbopack_external_import__", TURBOPACK_EXTERNAL_IMPORT),
    ("__turbopack_refresh__", TURBOPACK_REFRESH),
    ("__turbopack_require_stub__", TURBOPACK_REQUIRE_STUB),
    ("__turbopack_require_real__", TURBOPACK_REQUIRE_REAL),
    (
        "__turbopack_clear_chunk_cache__",
        TURBOPACK_CLEAR_CHUNK_CACHE,
    ),
    ("__turbopack_wasm__", TURBOPACK_WASM),
    ("__turbopack_wasm_module__", TURBOPACK_WASM_MODULE),
];
