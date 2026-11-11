use std::mem::take;

use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    atoms::Atom,
    base::SwcComments,
    common::{
        BytePos, DUMMY_SP, Span, Spanned,
        comments::{Comment, CommentKind, Comments},
        util::take::Take,
    },
    ecma::{
        ast::{
            ArrayPat, ArrowExpr, AssignPat, AssignPatProp, BindingIdent, BlockStmt, ClassDecl,
            Decl, EmptyStmt, Expr, FnDecl, FunctionBody, Ident, KeyValuePatProp, Lit, ObjectPat,
            ObjectPatProp, Pat, RestPat, Stmt, Str, SwitchCase, VarDecl, VarDeclKind,
            VarDeclarator,
        },
        visit::{
            AstParentKind, VisitMut, VisitMutWith,
            fields::{BlockStmtField, FunctionBodyField, SwitchCaseField},
        },
    },
    quote,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, Vc, debug::ValueDebugFormat};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    ast_path_trie::{AstPathId, AstPathTrie},
    code_gen::{AstModifier, CodeGen, CodeGeneration},
    utils::AstPathRange,
};

#[derive(PartialEq, Eq, ValueDebugFormat, NonLocalValue, Debug, Hash, Encode, Decode)]
pub struct RemovalCodeGen {
    comment_replacement: RcStr,
    range: AstPathRange,
}

struct UnreachableModifier {
    comment_replacement: Atom,
    comments: SwcComments,
}

impl AstModifier for UnreachableModifier {
    fn visit_mut_expr(&self, node: &mut Expr) {
        // We use an AST node instead of a comment here because we need to replace it with a valid
        // JS expression anyway.
        let span = node.span();

        *node = Expr::Lit(Lit::Str(Str {
            span,
            value: self.comment_replacement.clone().into(),
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
                text: self.comment_replacement.clone(),
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
            // Codegen maps the closing brace at hi - 1. Keep it inside the
            // reserved comment range even for the first synthetic span.
            span: span.with_hi(span.hi + BytePos(1)),
            stmts: replacement,
            ..Default::default()
        });
    }
}

struct UnreachableRangeModifier {
    comment_replacement: Atom,
    comments: SwcComments,
    start_index: usize,
}

impl AstModifier for UnreachableRangeModifier {
    fn visit_mut_block_stmt(&self, block: &mut BlockStmt) {
        self.replace(&mut block.stmts, self.start_index);
    }

    fn visit_mut_function_body(&self, body: &mut FunctionBody) {
        self.replace(&mut body.stmts, self.start_index);
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
                    text: self.comment_replacement.clone(),
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

/// Removes the code at the given path and replaces it with a comment.
impl RemovalCodeGen {
    pub fn new(comment_replacement: RcStr, range: AstPathRange) -> Self {
        RemovalCodeGen {
            comment_replacement,
            range,
        }
    }

    pub async fn code_generation(
        &self,
        trie: &AstPathTrie,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let comments = SwcComments::default();

        let comment_replacement = Atom::from(self.comment_replacement.as_str());

        let visitors = match &self.range {
            AstPathRange::Exact(path) => vec![(
                *path,
                Box::new(UnreachableModifier {
                    comment_replacement: comment_replacement.clone(),
                    comments: comments.clone(),
                }) as Box<dyn AstModifier>,
            )],
            AstPathRange::StartAfter(path) => {
                // Walk up to the enclosing statement, then past the element naming the slot
                // it occupies, leaving the node that owns the statement list plus the index
                // to start removing from. Every ancestor of an interned path is itself a
                // node, so this only walks the trie.
                let Some(stmt) = trie.find_last(*path, |k| matches!(k, AstParentKind::Stmt(_)))
                else {
                    return Ok(CodeGeneration::visitors_with_comments(vec![], comments));
                };
                // `slot` names which statement of its parent this is, e.g. `Stmts(3)`.
                let Some(slot) = trie.get_parent(stmt) else {
                    return Ok(CodeGeneration::visitors_with_comments(vec![], comments));
                };
                let start_index = match trie.get(slot) {
                    Some(AstParentKind::BlockStmt(BlockStmtField::Stmts(i)))
                    | Some(AstParentKind::FunctionBody(FunctionBodyField::Stmts(i)))
                    | Some(AstParentKind::SwitchCase(SwitchCaseField::Cons(i))) => i,
                    // Not a statement list we know how to truncate.
                    _ => {
                        return Ok(CodeGeneration::visitors_with_comments(vec![], comments));
                    }
                };
                let owner = trie.get_parent(slot).unwrap_or(AstPathId::ROOT);
                vec![(
                    owner,
                    Box::new(UnreachableRangeModifier {
                        comment_replacement: comment_replacement.clone(),
                        comments: comments.clone(),
                        start_index,
                    }) as Box<dyn AstModifier>,
                )]
            }
        };

        Ok(CodeGeneration::visitors_with_comments(visitors, comments))
    }
}

impl From<RemovalCodeGen> for CodeGen {
    fn from(val: RemovalCodeGen) -> Self {
        CodeGen::RemovalCodeGen(val)
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

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use swc_core::{
        atoms::Atom,
        base::SwcComments,
        common::{
            FileName, GLOBALS, Globals, SourceMap, Span, source_map::DefaultSourceMapGenConfig,
        },
        ecma::{
            ast::{BlockStmt, Stmt},
            codegen::{Emitter, text_writer::JsWriter},
            parser::{Parser, StringInput, Syntax},
        },
    };

    use super::UnreachableModifier;
    use crate::code_gen::AstModifier;

    #[test]
    fn hoisted_unreachable_block_has_no_synthetic_source_coordinates() {
        GLOBALS.set(&Globals::new(), || {
            let source_map: Arc<SourceMap> = Default::default();
            let source = source_map.new_source_file(
                FileName::Custom("unreachable.js".into()).into(),
                "var event = makeEvent();\n",
            );
            let mut parser = Parser::new(
                Syntax::Es(Default::default()),
                StringInput::from(&*source),
                None,
            );
            let mut script = parser.parse_script().expect("valid input");
            let mut removed = Stmt::Block(BlockStmt {
                span: Span::new(source.start_pos, source.end_pos),
                stmts: std::mem::take(&mut script.body),
                ..Default::default()
            });
            let comments = SwcComments::default();
            UnreachableModifier {
                comment_replacement: Atom::from("TURBOPACK unreachable"),
                comments: comments.clone(),
            }
            .visit_mut_stmt(&mut removed);
            script.body.push(removed);

            let mut output = Vec::new();
            let mut mappings = Vec::new();
            {
                let mut emitter = Emitter {
                    cfg: Default::default(),
                    cm: source_map.clone(),
                    comments: Some(&comments),
                    wr: JsWriter::new(source_map.clone(), "\n", &mut output, Some(&mut mappings)),
                };
                emitter
                    .emit_script(&script)
                    .expect("emit removed statement");
            }
            let output = String::from_utf8(output).expect("JavaScript text");
            assert!(output.contains("TURBOPACK unreachable"));
            assert!(output.contains("var event;"));
            assert!(!output.contains("makeEvent()"));
            assert!(mappings.iter().any(|(position, _)| {
                source.start_pos <= *position && *position < source.end_pos
            }));
            for (position, generated) in &mappings {
                assert!(
                    position.is_dummy()
                        || position.is_reserved_for_comments()
                        || (source.start_pos <= *position && *position <= source.end_pos),
                    "synthetic mapping leaked at {generated:?}: {position:?}"
                );
            }
            let map = source_map.build_source_map(&mappings, None, DefaultSourceMapGenConfig);
            for token in map.tokens() {
                if token.has_source() {
                    assert_eq!(token.get_src_line(), 0);
                    assert!(token.get_src_col() <= 23);
                }
            }
        });
    }
}
