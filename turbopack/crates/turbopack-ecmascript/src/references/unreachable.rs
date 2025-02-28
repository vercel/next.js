use std::mem::take;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::{util::take::Take, Spanned},
    ecma::{
        ast::{
            ArrayPat, ArrowExpr, AssignPat, AssignPatProp, BindingIdent, BlockStmt, ClassDecl,
            Decl, FnDecl, Ident, KeyValuePatProp, ObjectPat, ObjectPatProp, Pat, RestPat, Stmt,
            VarDecl, VarDeclKind, VarDeclarator,
        },
        visit::{
            fields::{BlockStmtField, SwitchCaseField},
            AstParentKind, VisitMut, VisitMutWith,
        },
    },
    quote,
};
use turbo_tasks::{debug::ValueDebugFormat, trace::TraceRawVcs, NonLocalValue, Vc};
use turbopack_core::{chunk::ChunkingContext, module_graph::ModuleGraph};

use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
    utils::AstPathRange,
};

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]

pub struct Unreachable {
    range: AstPathRange,
}

impl Unreachable {
    pub fn new(range: AstPathRange) -> Self {
        Unreachable { range }
    }

    pub async fn code_generation(
        &self,
        _module_graph: Vc<ModuleGraph>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let visitors = match &self.range {
            AstPathRange::Exact(path) => {
                [
                    // Unreachable might be used on Stmt or Expr
                    create_visitor!(exact path, visit_mut_expr(expr: &mut Expr) {
                        *expr = quote!("(\"TURBOPACK unreachable\", undefined)" as Expr);
                    }),
                    create_visitor!(exact path, visit_mut_stmt(stmt: &mut Stmt) {
                        // TODO(WEB-553) walk ast to find all `var` declarations and keep them
                        // since they hoist out of the scope
                        let mut replacement = Vec::new();
                        replacement.push(quote!("\"TURBOPACK unreachable\";" as Stmt));
                        stmt.visit_mut_with(&mut ExtractDeclarations {
                            stmts: &mut replacement,
                            in_nested_block_scope: false,
                        });
                        *stmt = Stmt::Block(BlockStmt {
                            span: stmt.span(),
                            stmts: replacement,
                            ..Default::default()
                        });
                    }),
                ]
                .into()
            }
            AstPathRange::StartAfter(path) => {
                let mut parent = &path[..];
                while !parent.is_empty()
                    && !matches!(parent.last().unwrap(), AstParentKind::Stmt(_))
                {
                    parent = &parent[0..parent.len() - 1];
                }
                if !parent.is_empty() {
                    parent = &parent[0..parent.len() - 1];
                    fn replace(stmts: &mut Vec<Stmt>, start_index: usize) {
                        if stmts.len() > start_index + 1 {
                            let unreachable = stmts
                                .splice(
                                    start_index + 1..,
                                    [quote!("\"TURBOPACK unreachable\";" as Stmt)].into_iter(),
                                )
                                .collect::<Vec<_>>();
                            for mut stmt in unreachable {
                                stmt.visit_mut_with(&mut ExtractDeclarations {
                                    stmts,
                                    in_nested_block_scope: false,
                                });
                            }
                        }
                    }
                    let (parent, [last]) = parent.split_at(parent.len() - 1) else {
                        unreachable!();
                    };
                    if let &AstParentKind::BlockStmt(BlockStmtField::Stmts(start_index)) = last {
                        [
                            create_visitor!(exact parent, visit_mut_block_stmt(block: &mut BlockStmt) {
                                replace(&mut block.stmts, start_index);
                            }),
                        ]
                        .into()
                    } else if let &AstParentKind::SwitchCase(SwitchCaseField::Cons(start_index)) =
                        last
                    {
                        [
                            create_visitor!(exact parent, visit_mut_switch_case(case: &mut SwitchCase) {
                                replace(&mut case.cons, start_index);
                            }),
                        ]
                        .into()
                    } else {
                        Vec::new()
                    }
                } else {
                    Vec::new()
                }
            }
        };

        Ok(CodeGeneration::visitors(visitors))
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
