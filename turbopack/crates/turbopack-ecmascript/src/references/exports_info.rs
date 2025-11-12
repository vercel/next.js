use anyhow::Result;
use serde::{Deserialize, Serialize};
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
    references::AstPath,
};

/// Responsible for initializing the `ExportsInfoBinding` object binding, so that it may be
/// referenced in the the file.
///
/// There can be many references, and they appear at any nesting in the file. But we must only
/// initialize the binding a single time.
///
/// This singleton behavior must be enforced by the caller!
#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
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

        let props = if let EcmascriptExports::EsmExports(exports) = &*exports.await? {
            exports
                .await?
                .exports
                .keys()
                .map(|e| {
                    let used: Expr = export_usage_info.is_export_used(e).into();
                    PropOrSpread::Prop(Box::new(swc_core::ecma::ast::Prop::KeyValue(
                        KeyValueProp {
                            key: PropName::Str(e.as_str().into()),
                            value: quote!("{ used: $v }" as Box<Expr>, v: Expr = used),
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
                "const $name = $data;" as Stmt,
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
#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
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
