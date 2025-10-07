use std::mem::take;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    atoms::{Atom, atom},
    base::SwcComments,
    common::{
        DUMMY_SP, Span, Spanned,
        comments::{Comment, CommentKind, Comments},
        util::take::Take,
    },
    ecma::{
        ast::{
            ArrayPat, ArrowExpr, AssignPat, AssignPatProp, BindingIdent, BlockStmt, ClassDecl,
            Decl, EmptyStmt, Expr, FnDecl, Ident, KeyValuePatProp, Lit, ObjectPat, ObjectPatProp,
            Pat, RestPat, Stmt, Str, SwitchCase, VarDecl, VarDeclKind, VarDeclarator,
        },
        visit::{
            AstParentKind, VisitMut, VisitMutWith,
            fields::{BlockStmtField, SwitchCaseField},
        },
    },
    quote,
};
use turbo_tasks::{NonLocalValue, Vc, debug::ValueDebugFormat, trace::TraceRawVcs};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    code_gen::{AstModifier, CodeGen, CodeGeneration},
    utils::AstPathRange,
};

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]

pub struct Unreachable {
    range: AstPathRange,
}

fn unreachable_atom() -> Atom {
    atom!("TURBOPACK unreachable")
}
struct UnreachableModifier {
    comments: SwcComments,
}

impl AstModifier for UnreachableModifier {
    fn visit_mut_expr(&self, node: &mut Expr) {
        // We use an AST node instead of a comment here because we need to replace it with a valid
        // JS expression anyway.
        let span = node.span();

        *node = Expr::Lit(Lit::Str(Str {
            span,
            value: unreachable_atom(),
            raw: None,
        }));
    }

    fn visit_mut_stmt(&self, stmt: &mut Stmt) {
        let mut replacement = Vec::new();

        let span = Span::dummy_with_cmt();

        self.comments.add_leading(
            span.lo,
            Comment {
                kind: CommentKind::Line,
                span: DUMMY_SP,
                text: unreachable_atom(),
            },
        );

        stmt.visit_mut_with(&mut ExtractDeclarations {
            stmts: &mut replacement,
            in_nested_block_scope: false,
        });

        if replacement.is_empty() {
            *stmt = Stmt::Empty(EmptyStmt { span });
            return;
        }

        *stmt = Stmt::Block(BlockStmt {
            span,
            stmts: replacement,
            ..Default::default()
        });
    }
}

struct UnreachableRangeModifier {
    comments: SwcComments,
    start_index: usize,
}

impl AstModifier for UnreachableRangeModifier {
    fn visit_mut_block_stmt(&self, block: &mut BlockStmt) {
        self.replace(&mut block.stmts, self.start_index);
    }

    fn visit_mut_switch_case(&self, case: &mut SwitchCase) {
        self.replace(&mut case.cons, self.start_index);
    }
}

impl UnreachableRangeModifier {
    fn replace(&self, stmts: &mut Vec<Stmt>, start_index: usize) {
        if stmts.len() > start_index + 1 {
            let span = Span::dummy_with_cmt();

            self.comments.add_leading(
                span.lo,
                Comment {
                    kind: CommentKind::Line,
                    span: DUMMY_SP,
                    text: unreachable_atom(),
                },
            );

            let unreachable_stmt = Stmt::Empty(EmptyStmt { span });

            let unreachable = stmts
                .splice(start_index + 1.., [unreachable_stmt])
                .collect::<Vec<_>>();
            for mut stmt in unreachable {
                stmt.visit_mut_with(&mut ExtractDeclarations {
                    stmts,
                    in_nested_block_scope: false,
                });
            }
        }
    }
}

impl Unreachable {
    pub fn new(range: AstPathRange) -> Self {
        Unreachable { range }
    }

    pub async fn code_generation(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let comments = SwcComments::default();

        let visitors = match &self.range {
            AstPathRange::Exact(path) => vec![(
                path.clone(),
                Box::new(UnreachableModifier {
                    comments: comments.clone(),
                }) as Box<dyn AstModifier>,
            )],
            AstPathRange::StartAfter(path) => {
                let mut parent = &path[..];
                while !parent.is_empty()
                    && !matches!(parent.last().unwrap(), AstParentKind::Stmt(_))
                {
                    parent = &parent[0..parent.len() - 1];
                }
                if !parent.is_empty() {
                    parent = &parent[0..parent.len() - 1];

                    let (parent, [last]) = parent.split_at(parent.len() - 1) else {
                        unreachable!();
                    };
                    if let &AstParentKind::BlockStmt(BlockStmtField::Stmts(start_index)) = last {
                        vec![(
                            parent.to_vec(),
                            Box::new(UnreachableRangeModifier {
                                comments: comments.clone(),
                                start_index,
                            }) as Box<dyn AstModifier>,
                        )]
                    } else if let &AstParentKind::SwitchCase(SwitchCaseField::Cons(start_index)) =
                        last
                    {
                        vec![(
                            parent.to_vec(),
                            Box::new(UnreachableRangeModifier {
                                comments: comments.clone(),
                                start_index,
                            }) as Box<dyn AstModifier>,
                        )]
                    } else {
                        Vec::new()
                    }
                } else {
                    Vec::new()
                }
            }
        };

        Ok(CodeGeneration::visitors_with_comments(visitors, comments))
    }
}

impl From<Unreachable> for CodeGen {
    fn from(val: Unreachable) -> Self {
        CodeGen::Unreachable(val)
    }
}

struct ExtractDeclarations<'a> {
    stmts: &'a mut Vec<Stmt>,
    in_nested_block_scope: bool,
}

impl VisitMut for ExtractDeclarations<'_> {
    fn visit_mut_var_decl(&mut self, decl: &mut VarDecl) {
        let VarDecl {
            span,
            kind,
            declare,
            decls,
            ctxt,
        } = decl;
        if self.in_nested_block_scope && !matches!(kind, VarDeclKind::Var) {
            return;
        }
        let mut idents = Vec::new();
        for decl in take(decls) {
            collect_idents(&decl.name, &mut idents);
        }
        let decls = idents
            .into_iter()
            .map(|ident| VarDeclarator {
                span: ident.span,
                name: Pat::Ident(BindingIdent {
                    id: ident,
                    type_ann: None,
                }),
                init: if matches!(kind, VarDeclKind::Const) {
                    Some(quote!("undefined" as Box<Expr>))
                } else {
                    None
                },
                definite: false,
            })
            .collect();
        self.stmts.push(Stmt::Decl(Decl::Var(Box::new(VarDecl {
            span: *span,
            kind: *kind,
            declare: *declare,
            ctxt: *ctxt,
            decls,
        }))));
    }

    fn visit_mut_fn_decl(&mut self, decl: &mut FnDecl) {
        let FnDecl {
            declare,
            ident,
            function,
        } = decl;
        self.stmts.push(Stmt::Decl(Decl::Fn(FnDecl {
            declare: *declare,
            ident: ident.take(),
            function: function.take(),
        })));
    }

    fn visit_mut_constructor(&mut self, _: &mut swc_core::ecma::ast::Constructor) {
        // Do not walk into constructors
    }

    fn visit_mut_function(&mut self, _: &mut swc_core::ecma::ast::Function) {
        // Do not walk into functions
    }

    fn visit_mut_getter_prop(&mut self, _: &mut swc_core::ecma::ast::GetterProp) {
        // Do not walk into getter properties
    }

    fn visit_mut_setter_prop(&mut self, _: &mut swc_core::ecma::ast::SetterProp) {
        // Do not walk into setter properties
    }

    fn visit_mut_arrow_expr(&mut self, _: &mut ArrowExpr) {
        // Do not walk into arrow expressions
    }

    fn visit_mut_class_decl(&mut self, decl: &mut ClassDecl) {
        let ClassDecl { declare, ident, .. } = decl;
        self.stmts.push(Stmt::Decl(Decl::Var(Box::new(VarDecl {
            span: ident.span,
            declare: *declare,
            decls: vec![VarDeclarator {
                span: ident.span,
                name: Pat::Ident(BindingIdent {
                    type_ann: None,
                    id: ident.clone(),
                }),
                init: None,
                definite: false,
            }],
            kind: VarDeclKind::Let,
            ..Default::default()
        }))));
    }

    fn visit_mut_block_stmt(&mut self, n: &mut BlockStmt) {
        let old = self.in_nested_block_scope;
        self.in_nested_block_scope = true;
        n.visit_mut_children_with(self);
        self.in_nested_block_scope = old;
    }
}

fn collect_idents(pat: &Pat, idents: &mut Vec<Ident>) {
    match pat {
        Pat::Ident(ident) => {
            idents.push(ident.id.clone());
        }
        Pat::Array(ArrayPat { elems, .. }) => {
            for elem in elems.iter() {
                if let Some(elem) = elem.as_ref() {
                    collect_idents(elem, idents);
                }
            }
        }
        Pat::Rest(RestPat { arg, .. }) => {
            collect_idents(arg, idents);
        }
        Pat::Object(ObjectPat { props, .. }) => {
            for prop in props.iter() {
                match prop {
                    ObjectPatProp::KeyValue(KeyValuePatProp { value, .. }) => {
                        collect_idents(value, idents);
                    }
                    ObjectPatProp::Assign(AssignPatProp { key, .. }) => {
                        idents.push(key.id.clone());
                    }
                    ObjectPatProp::Rest(RestPat { arg, .. }) => {
                        collect_idents(arg, idents);
                    }
                }
            }
        }
        Pat::Assign(AssignPat { left, .. }) => {
            collect_idents(left, idents);
        }
        Pat::Invalid(_) | Pat::Expr(_) => {
            // ignore
        }
    }
}
