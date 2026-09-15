use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::{DUMMY_SP, SyntaxContext, source_map::PURE_SP},
    ecma::{
        ast::{
            ComputedPropName, Decl, Expr, Ident, KeyValuePatProp, KeyValueProp, Lit, MemberExpr,
            MemberProp, ObjectPat, ObjectPatProp, Pat, Prop, PropName, SimpleAssignTarget, Stmt,
            Str, VarDecl, VarDeclKind, VarDeclarator,
        },
        visit::{
            AstParentKind,
            fields::{CalleeField, PropField, TaggedTplField},
        },
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, Vc, trace::TraceRawVcs};
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    ScopeHoistingContext,
    code_gen::{AstModifier, CodeGen, CodeGeneration, CodeGenerationHoistedStmt},
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
    propagates_this: bool,
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
            propagates_this: false,
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
        let propagates_this = is_this_receiver_position(enclosing);
        EsmBinding {
            reference,
            export,
            local: None,
            ast_path,
            propagates_this,
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
        let mut captures = vec![];
        let imported_module = self.reference.get_referenced_asset().await?;
        self.generate(
            chunking_context,
            scope_hoisting_context,
            &imported_module,
            &mut visitors,
            &mut captures,
        )
        .await?;

        Ok(CodeGeneration::new(
            visitors,
            value_binding_stmts(captures, supports_destructuring(chunking_context).await?),
            vec![],
            vec![],
            vec![],
        ))
    }

    /// Rewrites this one use site, appending to the shared buffers of the enclosing group.
    async fn generate(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
        imported_module: &ReferencedAsset,
        visitors: &mut Vec<(Vec<AstParentKind>, Box<dyn AstModifier>)>,
        captures: &mut Vec<ValueBindingCapture>,
    ) -> Result<()> {
        let export = self.export.clone();

        enum ImportedIdent {
            Module(ReferencedAssetIdent, Option<Ident>),
            None,
            Unresolvable,
        }

        let imported_ident = match imported_module {
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
                    let value_binding = if !propagates_this(self.propagates_this, &imported_ident)
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
                        captures.push(ValueBindingCapture {
                            namespace_ident: namespace_ident.as_str().into(),
                            ctxt: *ctxt,
                            export: export.clone(),
                            binding: binding_ident.clone(),
                        });
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
                    let in_call = match &imported_ident {
                        ImportedIdent::Module(imported_ident, _) => {
                            !propagates_this(self.propagates_this, imported_ident)
                        }
                        _ => !self.propagates_this,
                    } && is_this_receiver_position(&ast_path);

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

        Ok(())
    }
}

/// All uses of the bindings imported by one [`EsmAssetReference`].
///
/// Grouping the uses of an import lets the value bindings they capture share a single hoisted
/// declaration, the same way a module's exports share one `__turbopack_esm__` call, instead of
/// emitting one declaration per use.
#[derive(Hash, Clone, Debug, PartialEq, Eq, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub struct EsmBindings {
    reference: ResolvedVc<EsmAssetReference>,
    bindings: Vec<EsmBinding>,
}

impl EsmBindings {
    pub fn new(reference: ResolvedVc<EsmAssetReference>, bindings: Vec<EsmBinding>) -> Self {
        debug_assert!(
            bindings
                .iter()
                .all(|binding| binding.reference == reference),
            "every binding in a group must belong to the group's reference"
        );
        EsmBindings {
            reference,
            bindings,
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
        let mut captures = vec![];
        // Resolved once for the whole group rather than once per use site.
        let imported_module = self.reference.get_referenced_asset().await?;

        for binding in &self.bindings {
            binding
                .generate(
                    chunking_context,
                    scope_hoisting_context,
                    &imported_module,
                    &mut visitors,
                    &mut captures,
                )
                .await?;
        }

        Ok(CodeGeneration::new(
            visitors,
            value_binding_stmts(captures, supports_destructuring(chunking_context).await?),
            vec![],
            vec![],
            vec![],
        ))
    }
}

impl From<EsmBindings> for CodeGen {
    fn from(val: EsmBindings) -> Self {
        CodeGen::EsmBindings(val)
    }
}

/// Hoist-key prefix for the declarations that capture imported bindings. All declarations reading
/// one namespace share a key so they can be merged into a single declaration.
pub const VALUE_BINDINGS_KEY_PREFIX: &str = "value bindings ";

/// The bindings captured from one namespace, as `(export name, local binding)` pairs.
type NamespaceBindings = Vec<(RcStr, Ident)>;

/// A named export captured into a local value binding by one or more use sites.
struct ValueBindingCapture {
    namespace_ident: RcStr,
    ctxt: Option<SyntaxContext>,
    export: RcStr,
    binding: Ident,
}

async fn supports_destructuring(chunking_context: Vc<Box<dyn ChunkingContext>>) -> Result<bool> {
    Ok(*chunking_context
        .environment()
        .runtime_versions()
        .supports_destructuring()
        .await?)
}

/// Builds the hoisted declarations for the value bindings captured from one import.
///
/// All captures that read the same namespace share a single declaration, so an import whose
/// bindings are each used once costs one declaration rather than one per binding.
fn value_binding_stmts(
    captures: Vec<ValueBindingCapture>,
    supports_destructuring: bool,
) -> Vec<CodeGenerationHoistedStmt> {
    let mut buckets: FxIndexMap<(RcStr, Option<SyntaxContext>), NamespaceBindings> =
        FxIndexMap::default();
    for capture in captures {
        let members = buckets
            .entry((capture.namespace_ident, capture.ctxt))
            .or_default();
        // Several use sites of one binding capture it under the same name; declare it once.
        if !members
            .iter()
            .any(|(_, binding)| binding.sym == capture.binding.sym)
        {
            members.push((capture.export, capture.binding));
        }
    }

    buckets
        .into_iter()
        .map(|((namespace_ident, ctxt), members)| {
            let namespace = Ident::new(
                namespace_ident.as_str().into(),
                DUMMY_SP,
                ctxt.unwrap_or_default(),
            );
            // A single binding is smaller and faster read directly; destructuring only pays off
            // once several bindings share the declaration.
            let decl = if supports_destructuring && members.len() > 1 {
                // Keys are written as strings because mangled export names are not always valid
                // identifiers.
                VarDecl {
                    span: DUMMY_SP,
                    kind: VarDeclKind::Var,
                    declare: false,
                    ctxt: Default::default(),
                    decls: vec![VarDeclarator {
                        span: DUMMY_SP,
                        name: Pat::Object(ObjectPat {
                            span: DUMMY_SP,
                            optional: false,
                            type_ann: None,
                            props: members
                                .into_iter()
                                .map(|(export, binding)| {
                                    ObjectPatProp::KeyValue(KeyValuePatProp {
                                        key: PropName::Str(Str {
                                            span: DUMMY_SP,
                                            value: export.as_str().into(),
                                            raw: None,
                                        }),
                                        value: Box::new(Pat::Ident(binding.into())),
                                    })
                                })
                                .collect(),
                        }),
                        init: Some(Box::new(Expr::Ident(namespace))),
                        definite: false,
                    }],
                }
            } else {
                VarDecl {
                    span: DUMMY_SP,
                    kind: VarDeclKind::Var,
                    declare: false,
                    ctxt: Default::default(),
                    decls: members
                        .into_iter()
                        .map(|(export, binding)| VarDeclarator {
                            span: DUMMY_SP,
                            name: Pat::Ident(binding.into()),
                            init: Some(Box::new(Expr::Member(MemberExpr {
                                // Marked pure so the declaration can be dropped when the binding
                                // is unused.
                                span: PURE_SP,
                                obj: Box::new(Expr::Ident(namespace.clone())),
                                prop: MemberProp::Computed(ComputedPropName {
                                    span: DUMMY_SP,
                                    expr: Box::new(Expr::Lit(Lit::Str(Str {
                                        span: DUMMY_SP,
                                        value: export.as_str().into(),
                                        raw: None,
                                    }))),
                                }),
                            }))),
                            definite: false,
                        })
                        .collect(),
                }
            };

            // Every declaration reading this namespace shares one key so they merge into a
            // single statement, including those from sibling groups: one source import can be
            // split into a separate reference per named export. The key deliberately does not
            // depend on the members, so the merge is by namespace rather than by group.
            CodeGenerationHoistedStmt::new(
                format!("{VALUE_BINDINGS_KEY_PREFIX}{namespace_ident} {ctxt:?}").into(),
                Stmt::Decl(Decl::Var(Box::new(decl))),
            )
        })
        .collect()
}

/// Whether a member call has to keep the namespace as the `this` receiver.
///
/// Only calls need a receiver at all, and only a callee that could observe `this` cares which one
/// it gets.
fn propagates_this(is_member_call: bool, imported_ident: &ReferencedAssetIdent) -> bool {
    is_member_call
        && match imported_ident {
            ReferencedAssetIdent::Module {
                maybe_uses_this, ..
            } => *maybe_uses_this,
            ReferencedAssetIdent::LocalBinding { .. } => true,
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
/// member expression itself already removed. Both the `propagates_this` decision made when the
/// binding is created and the `in_call` decision made during code generation go through this
/// function so the two can never disagree.
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
