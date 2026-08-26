use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Expr, Ident, KeyValueProp, ObjectLit, PropName, PropOrSpread},
    quote,
};
use turbo_rcstr::rcstr;
use turbo_tasks::{NonLocalValue, ResolvedVc, Vc, debug::ValueDebugFormat, trace::TraceRawVcs};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    code_gen::{CodeGen, CodeGeneration},
    create_visitor, magic_identifier,
    references::{AstPath, esm::mangle::mangled_export_names},
};

/// Responsible for initializing the `ExportsInfoBinding` object binding, so that it may be
/// referenced in the the file.
///
/// There can be many references, and they appear at any nesting in the file. But we must only
/// initialize the binding a single time.
///
/// This singleton behavior must be enforced by the caller!
#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct ExportsInfoBinding {}

impl ExportsInfoBinding {
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        ExportsInfoBinding {}
    }

    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        exports: ResolvedVc<EcmascriptExports>,
    ) -> Result<CodeGeneration> {
        let export_usage_info = chunking_context
            .module_export_usage(*ResolvedVc::upcast(module))
            .await?;
        let export_usage_info = export_usage_info.export_usage.await?;
        // The keys of `__webpack_exports_info__` stay the *original* export names — user code
        // looks them up by name. The emitted key is reported as `mangledName` instead, which is
        // always present alongside `canMangle` (`null` when `canMangle` is false), regardless of
        // whether export mangling is enabled at all — see the `map` closure below for exactly
        // what each of the three fields means.
        let exports = exports.await?;
        let mangled_names = mangled_export_names(*module, chunking_context).await?;

        let props = if let EcmascriptExports::EsmExports(exports) = &*exports {
            exports
                .await?
                .exports
                .keys()
                .map(|e| {
                    let is_used = export_usage_info.is_export_used(e);
                    let used: Expr = is_used.into();
                    // `canMangle` is true exactly when this export is a genuine candidate for
                    // mangling: the module has to be eligible at all (which is what a `Some` map
                    // means — see `mangled_export_names`) and the export itself has to be used, as
                    // an unused export is never emitted and so was never a candidate.
                    // `mangledName` is then always a string — the assigned key when mangling
                    // actually renamed it, or the export's own name when it was considered but
                    // kept itself (e.g. already short enough) — and only `null` when `canMangle`
                    // is false.
                    let can_mangle_names = mangled_names.as_ref().filter(|_| is_used);
                    let can_mangle_expr: Expr = can_mangle_names.is_some().into();
                    let mangled_name: Expr =
                        match can_mangle_names {
                            Some(names) => Expr::Lit(names.get(e).unwrap_or(e).as_str().into()),
                            None => Expr::Lit(swc_core::ecma::ast::Lit::Null(
                                swc_core::ecma::ast::Null { span: DUMMY_SP },
                            )),
                        };
                    PropOrSpread::Prop(Box::new(swc_core::ecma::ast::Prop::KeyValue(
                        KeyValueProp {
                            key: PropName::Str(e.as_str().into()),
                            value: quote!(
                                "{ used: $v, canMangle: $c, mangledName: $m }" as Box<Expr>,
                                v: Expr = used,
                                c: Expr = can_mangle_expr,
                                m: Expr = mangled_name
                            ),
                        },
                    )))
                })
                .collect()
        } else {
            vec![]
        };

        let data = Expr::Object(ObjectLit {
            props,
            span: DUMMY_SP,
        });

        Ok(CodeGeneration::hoisted_stmt(
            rcstr!("__webpack_exports_info__"),
            quote!(
                "var $name = $data;" as Stmt,
                name = exports_ident(),
                data: Expr = data
            ),
        ))
    }
}

impl From<ExportsInfoBinding> for CodeGen {
    fn from(val: ExportsInfoBinding) -> Self {
        CodeGen::ExportsInfoBinding(val)
    }
}

/// Handles rewriting `__webpack_exports_info__` references into the injected binding created by
/// ExportsInfoBinding.
///
/// There can be many references, and they appear at any nesting in the file. But all references
/// refer to the same mutable object.
#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct ExportsInfoRef {
    ast_path: AstPath,
}

impl ExportsInfoRef {
    pub fn new(ast_path: AstPath) -> Self {
        ExportsInfoRef { ast_path }
    }

    pub async fn code_generation(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let visitor = create_visitor!(self.ast_path, visit_mut_expr, |expr: &mut Expr| {
            *expr = Expr::Ident(exports_ident());
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}

impl From<ExportsInfoRef> for CodeGen {
    fn from(val: ExportsInfoRef) -> Self {
        CodeGen::ExportsInfoRef(val)
    }
}

fn exports_ident() -> Ident {
    Ident::new(
        magic_identifier::mangle("__webpack_exports_info__").into(),
        DUMMY_SP,
        Default::default(),
    )
}
