use anyhow::Result;
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{
            ComputedPropName, Expr, Ident, KeyValueProp, Lit, MemberExpr, MemberProp, Prop,
            PropName, Str,
        },
        visit::fields::{ExprField, PropField},
    },
};
use turbopack_core::chunk::ChunkingContextVc;

use super::EsmAssetReferenceVc;
use crate::{
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
    references::AstPathVc,
};

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct EsmBinding {
    pub reference: EsmAssetReferenceVc,
    pub export: Option<String>,
    pub ast_path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl EsmBindingVc {
    #[turbo_tasks::function]
    pub fn new(
        reference: EsmAssetReferenceVc,
        export: Option<String>,
        ast_path: AstPathVc,
    ) -> Self {
        EsmBinding {
            reference,
            export,
            ast_path,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmBinding {
    #[turbo_tasks::function]
    async fn code_generation(
        self_vc: EsmBindingVc,
        _context: ChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let this = self_vc.await?;
        let mut visitors = Vec::new();
        let imported_module = this.reference.get_referenced_asset();

        fn make_expr(imported_module: &str, export: Option<&str>) -> Expr {
            if let Some(export) = export {
                Expr::Member(MemberExpr {
                    span: DUMMY_SP,
                    obj: box Expr::Ident(Ident::new(imported_module.into(), DUMMY_SP)),
                    prop: MemberProp::Computed(ComputedPropName {
                        span: DUMMY_SP,
                        expr: box Expr::Lit(Lit::Str(Str {
                            span: DUMMY_SP,
                            value: export.into(),
                            raw: None,
                        })),
                    }),
                })
            } else {
                Expr::Ident(Ident::new(imported_module.into(), DUMMY_SP))
            }
        }

        let mut ast_path = this.ast_path.await?.clone_value();
        let imported_module = imported_module.await?.get_ident().await?;

        loop {
            match ast_path.last() {
                Some(swc_core::ecma::visit::AstParentKind::Expr(ExprField::Ident)) => {
                    ast_path.pop();
                    visitors.push(
                        create_visitor!(exact ast_path, visit_mut_expr(expr: &mut Expr) {
                            if let Some(ident) = imported_module.as_deref() {
                              *expr = make_expr(ident, this.export.as_deref());
                            }
                            // If there's no identifier for the imported module,
                            // resolution failed and will insert code that throws
                            // before this expression is reached. Leave behind the original identifier.
                        }),
                    );
                    break;
                }
                Some(swc_core::ecma::visit::AstParentKind::Prop(PropField::Shorthand)) => {
                    ast_path.pop();
                    visitors.push(
                        create_visitor!(ast_path, visit_mut_prop(prop: &mut Prop) {
                            if let Prop::Shorthand(ident) = prop {
                              // TODO: Merge with the above condition when https://rust-lang.github.io/rfcs/2497-if-let-chains.html lands.
                              if let Some(imported_ident) = imported_module.as_deref() {
                                *prop = Prop::KeyValue(KeyValueProp { key: PropName::Ident(ident.clone()), value: box make_expr(imported_ident, this.export.as_deref())});
                              }
                            }
                        }),
                    );
                    break;
                }
                Some(_) => {
                    ast_path.pop();
                }
                None => break,
            }
        }

        Ok(CodeGeneration { visitors }.into())
    }
}
