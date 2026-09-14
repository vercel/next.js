use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{Expr, Ident, KeyValueProp, Prop, PropName, SimpleAssignTarget},
        visit::fields::{CalleeField, PropField, TaggedTplField},
    },
    quote,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, Vc, trace::TraceRawVcs};
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    ScopeHoistingContext,
    code_gen::{CodeGen, CodeGeneration, CodeGenerationHoistedStmt},
    create_visitor, magic_identifier,
    references::{
        AstPath,
        esm::{
            EsmAssetReference,
            base::{ReferencedAsset, ReferencedAssetIdent},
        },
    },
};

#[derive(Hash, Clone, Debug, PartialEq, Eq, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub struct EsmBinding {
    reference: ResolvedVc<EsmAssetReference>,
    export: Option<RcStr>,
    local: Option<RcStr>,
    ast_path: AstPath,
    keep_this: bool,
}

impl EsmBinding {
    pub fn new(
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        local: Option<RcStr>,
        ast_path: AstPath,
    ) -> Self {
        EsmBinding {
            reference,
            export,
            local,
            ast_path,
            keep_this: false,
        }
    }

    /// Rewrites a namespace member access such as `import * as ns from "m"; ns.f`.
    ///
    /// Keeps the namespace as the `this` receiver, but only where the member access is actually
    /// invoked as a method. Every other use is an ordinary binding and can be captured in a local
    /// value, so it is built as one.
    ///
    /// TODO: Track whether the imported export can observe `this` (for example, whether it is a
    /// function that references `this`). Such exports could use a local value binding even in call
    /// position instead of preserving the namespace as the receiver.
    pub fn new_namespace_member(
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        ast_path: AstPath,
    ) -> Self {
        // The path ends at the namespace object inside the member expression
        // (`.., <enclosing>, Expr(Member), MemberExpr(Obj)`). Drop those two trailing entries so
        // the enclosing position is the last element.
        let enclosing = ast_path
            .0
            .len()
            .checked_sub(2)
            .map_or(&[][..], |end| &ast_path.0[..end]);
        let keep_this = is_this_receiver_position(enclosing);
        EsmBinding {
            reference,
            export,
            local: None,
            ast_path,
            keep_this,
        }
    }

    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
    ) -> Result<CodeGeneration> {
        if chunking_context
            .unused_references()
            .contains_key(&ResolvedVc::upcast(self.reference))
            .await?
        {
            return Ok(CodeGeneration::empty());
        }

        let mut visitors = vec![];
        let mut hoisted_stmts = vec![];

        let export = self.export.clone();
        let imported_module = self.reference.get_referenced_asset().await?;

        enum ImportedIdent {
            Module(ReferencedAssetIdent, Option<Ident>),
            None,
            Unresolvable,
        }

        let imported_ident = match &imported_module {
            ReferencedAsset::None => ImportedIdent::None,
            imported_module => match imported_module
                .get_ident(chunking_context, export, scope_hoisting_context)
                .await?
            {
                Some(imported_ident) => {
                    // Capturing an import is only safe when it does not need the namespace as a
                    // call receiver. Source-level assignments to ESM imports are illegal, but SWC
                    // still parses them; retain namespace access for those assignment targets so
                    // assigning to the non-writable export continues to throw.
                    let value_binding = if !self.keep_this
                        && let ReferencedAssetIdent::Module {
                            namespace_ident,
                            ctxt,
                            export: Some(export),
                            can_value_bind: true,
                            ..
                        } = &imported_ident
                        && !is_assignment_target(&self.ast_path)
                    {
                        // A source alias is unique in an ordinary module. Under scope hoisting the
                        // capture needs a globally unique name because bindings from multiple
                        // source modules share one output scope.
                        let binding_name = self
                            .local
                            .clone()
                            .filter(|_| ctxt.is_none())
                            .unwrap_or_else(|| {
                                let imported_name = self.export.as_deref().unwrap_or(export);
                                magic_identifier::mangle(&format!(
                                    "imported binding {imported_name} {}",
                                    encode_hex(hash_xxh3_hash64((
                                        /* namespace */ namespace_ident,
                                        /* export */ export,
                                    )))
                                ))
                                .into()
                            });
                        let binding_ident = Ident::new(
                            binding_name.as_str().into(),
                            DUMMY_SP,
                            // This is a synthetic local in the consuming module, not an export of
                            // the module whose syntax context the namespace accessor carries.
                            Default::default(),
                        );
                        let value = imported_ident
                            .as_expr_individual(DUMMY_SP)
                            .map_either(Expr::from, Expr::from)
                            .into_inner();
                        hoisted_stmts.push(CodeGenerationHoistedStmt::new(
                            format!("value binding {} {:?}", binding_ident.sym, ctxt).into(),
                            quote!(
                                "var $binding = $value;" as Stmt,
                                binding = binding_ident.clone(),
                                value: Expr = value,
                            ),
                        ));
                        Some(binding_ident)
                    } else {
                        None
                    };
                    ImportedIdent::Module(imported_ident, value_binding)
                }
                None => ImportedIdent::Unresolvable,
            },
        };

        let mut ast_path = self.ast_path.0.clone();
        loop {
            match ast_path.last() {
                // Shorthand properties get special treatment because we need to rewrite them to
                // normal key-value pairs.
                Some(swc_core::ecma::visit::AstParentKind::Prop(PropField::Shorthand)) => {
                    ast_path.pop();
                    visitors.push(create_visitor!(
                        exact,
                        ast_path,
                        visit_mut_prop,
                        |prop: &mut Prop| {
                            if let Prop::Shorthand(ident) = prop {
                                match &imported_ident {
                                    ImportedIdent::Module(imported_ident, value_binding) => {
                                        *prop = Prop::KeyValue(KeyValueProp {
                                            key: PropName::Ident(ident.clone().into()),
                                            value: Box::new(value_binding.as_ref().map_or_else(
                                                || imported_ident.as_expr(ident.span, false),
                                                |binding| Expr::Ident(binding.clone()),
                                            )),
                                        });
                                    }
                                    ImportedIdent::None => {
                                        *prop = Prop::KeyValue(KeyValueProp {
                                            key: PropName::Ident(ident.clone().into()),
                                            value: Expr::undefined(ident.span),
                                        });
                                    }
                                    ImportedIdent::Unresolvable => {
                                        // Do nothing, the reference will insert a throw
                                    }
                                }
                            }
                        }
                    ));
                    break;
                }
                // Any other expression can be replaced with the import accessor.
                Some(swc_core::ecma::visit::AstParentKind::Expr(_)) => {
                    ast_path.pop();
                    // `ast_path` no longer has the trailing `Expr`, so it already describes the
                    // enclosing position that `is_this_receiver_position` inspects.
                    let in_call = !self.keep_this && is_this_receiver_position(&ast_path);

                    visitors.push(create_visitor!(
                        exact,
                        ast_path,
                        visit_mut_expr,
                        |expr: &mut Expr| {
                            use swc_core::common::Spanned;
                            match &imported_ident {
                                ImportedIdent::Module(imported_ident, value_binding) => {
                                    *expr = value_binding.as_ref().map_or_else(
                                        || imported_ident.as_expr(expr.span(), in_call),
                                        |binding| Expr::Ident(binding.clone()),
                                    );
                                }
                                ImportedIdent::None => {
                                    *expr = *Expr::undefined(expr.span());
                                }
                                ImportedIdent::Unresolvable => {
                                    // Do nothing, the reference will insert a throw
                                }
                            }
                        }
                    ));
                    break;
                }
                // We need to handle LHS because of code like
                // (function (RouteKind1){})(RouteKind || RouteKind = {})
                Some(swc_core::ecma::visit::AstParentKind::SimpleAssignTarget(_)) => {
                    ast_path.pop();

                    visitors.push(create_visitor!(
                        exact,
                        ast_path,
                        visit_mut_simple_assign_target,
                        |l: &mut SimpleAssignTarget| {
                            use swc_core::common::Spanned;
                            match &imported_ident {
                                ImportedIdent::Module(imported_ident, _) => {
                                    *l = imported_ident
                                        .as_expr_individual(l.span())
                                        .map_either(
                                            |i| SimpleAssignTarget::Ident(i.into()),
                                            SimpleAssignTarget::Member,
                                        )
                                        .into_inner();
                                }
                                ImportedIdent::None => {
                                    // Do nothing, cannot assign to `undefined`
                                }
                                ImportedIdent::Unresolvable => {
                                    // Do nothing, the reference will insert a throw
                                }
                            }
                        }
                    ));
                    break;
                }
                Some(_) => {
                    ast_path.pop();
                }
                None => break,
            }
        }

        Ok(CodeGeneration::new(
            visitors,
            hoisted_stmts,
            vec![],
            vec![],
            vec![],
        ))
    }
}

fn is_assignment_target(ast_path: &AstPath) -> bool {
    ast_path.iter().any(|parent| {
        matches!(
            parent,
            swc_core::ecma::visit::AstParentKind::SimpleAssignTarget(_)
        )
    })
}

/// Whether `parents` describes a position where the member expression is invoked with its object
/// as the `this` receiver, i.e. `ns.f()` or ``ns.f`...` ``.
///
/// `parents` must be the path of the enclosing node, with any trailing entries that describe the
/// member expression itself already removed. Both the `keep_this` decision made when the binding is
/// created and the `in_call` decision made during code generation go through this function so the
/// two can never disagree.
fn is_this_receiver_position(parents: &[swc_core::ecma::visit::AstParentKind]) -> bool {
    use swc_core::ecma::visit::AstParentKind;

    matches!(
        parents.last(),
        // `ns.f()` calls `f` with `ns` as the receiver.
        Some(AstParentKind::Callee(CalleeField::Expr))
            // ``ns.tag`...` `` also calls `tag` with `ns` as the receiver. `NewExpr::Callee` is
            // deliberately absent: `new ns.C()` does not pass `ns` as `this`.
            | Some(AstParentKind::TaggedTpl(TaggedTplField::Tag))
    )
}

impl From<EsmBinding> for CodeGen {
    fn from(val: EsmBinding) -> Self {
        CodeGen::EsmBinding(val)
    }
}
