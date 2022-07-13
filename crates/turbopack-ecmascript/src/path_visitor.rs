use std::{borrow::Cow, collections::HashMap};

use swc_common::pass::AstKindPath;
use swc_ecma_visit::{AstParentKind, VisitMut, VisitMutAstPath, VisitMutWith, VisitMutWithPath};
use swc_ecmascript::ast::*;

use crate::code_gen::VisitorFactory;

pub type AstPath = Vec<AstParentKind>;

pub struct ApplyVisitors<'a> {
    /// `VisitMut` should be shallow. In other words, it should not visit
    /// children of the node.
    visitors: HashMap<AstParentKind, Vec<(&'a AstPath, &'a dyn VisitorFactory)>>,

    index: usize,
}

impl<'a> ApplyVisitors<'a> {
    pub fn new(visitors: Vec<(&'a AstPath, &'a dyn VisitorFactory)>) -> Self {
        let mut map = HashMap::<AstParentKind, Vec<(&'a AstPath, &'a dyn VisitorFactory)>>::new();
        for (path, visitor) in visitors {
            if let Some(span) = path.first() {
                map.entry(*span).or_default().push((path, visitor));
            }
        }
        Self {
            visitors: map,
            index: 0,
        }
    }

    fn visit_if_required<N>(&mut self, n: &mut N, ast_path: &mut AstKindPath<AstParentKind>)
    where
        N: for<'aa> VisitMutWith<dyn VisitMut + Send + Sync + 'aa>
            + for<'aa> VisitMutWithPath<ApplyVisitors<'aa>>,
    {
        let mut index = self.index;
        let mut current_visitors_map = Cow::Borrowed(&self.visitors);
        while index < ast_path.len() {
            let current = index == ast_path.len() - 1;
            let kind = ast_path[index];
            if let Some(visitors) = current_visitors_map.get(&kind) {
                let mut visitors_map = HashMap::<_, Vec<_>>::with_capacity(visitors.len());

                index += 1;

                for (path, visitor) in visitors.iter() {
                    if index == path.len() {
                        if current {
                            n.visit_mut_with(&mut visitor.create());
                        }
                    } else {
                        debug_assert!(index < path.len());

                        let span = path[index];
                        visitors_map
                            .entry(span)
                            .or_default()
                            .push((*path, *visitor));
                    }
                }

                if visitors_map.is_empty() {
                    // Skip visiting this sub tree
                    return;
                }

                if current {
                    n.visit_mut_children_with_path(
                        &mut ApplyVisitors {
                            visitors: visitors_map,
                            index,
                        },
                        ast_path,
                    );
                    return;
                } else {
                    current_visitors_map = Cow::Owned(visitors_map);
                }
            } else {
                // Skip visiting this sub tree
                return;
            }
        }
        // Ast path is unchanged, just keep visiting
        n.visit_mut_children_with_path(self, ast_path);
    }
}

macro_rules! method {
    ($name:ident,$T:ty) => {
        fn $name(&mut self, n: &mut $T, ast_path: &mut AstKindPath<AstParentKind>) {
            self.visit_if_required(n, ast_path);
        }
    };
}

impl VisitMutAstPath for ApplyVisitors<'_> {
    // TODO: we need a macro to apply that for all methods
    method!(visit_mut_prop, Prop);
    method!(visit_mut_expr, Expr);
    method!(visit_mut_pat, Pat);
    method!(visit_mut_stmt, Stmt);
    method!(visit_mut_module_decl, ModuleDecl);
    method!(visit_mut_module_item, ModuleItem);
    method!(visit_mut_call_expr, CallExpr);
    method!(visit_mut_lit, Lit);
    method!(visit_mut_str, Str);
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use swc_common::{errors::HANDLER, FileName, Mark, SourceFile, SourceMap};
    use swc_ecma_codegen::{text_writer::JsWriter, Emitter};
    use swc_ecma_transforms_base::resolver;
    use swc_ecma_visit::{fields::*, AstParentKind, VisitMut, VisitMutWithPath};
    use swc_ecmascript::{ast::*, parser::parse_file_as_module, visit::VisitMutWith};

    use super::{ApplyVisitors, VisitorFactory};

    fn parse(fm: &SourceFile) -> Module {
        let mut m = parse_file_as_module(
            fm,
            Default::default(),
            EsVersion::latest(),
            None,
            &mut vec![],
        )
        .map_err(|err| HANDLER.with(|handler| err.into_diagnostic(handler).emit()))
        .unwrap();

        let unresolved_mark = Mark::new();
        let top_level_mark = Mark::new();
        m.visit_mut_with(&mut resolver(unresolved_mark, top_level_mark, false));

        m
    }

    struct StrReplacer<'a> {
        from: &'a str,
        to: &'a str,
    }

    impl VisitorFactory for Box<StrReplacer<'_>> {
        fn create<'a>(&'a self) -> Box<dyn VisitMut + Send + Sync + 'a> {
            box &**self
        }
    }

    impl VisitMut for &'_ StrReplacer<'_> {
        fn visit_mut_str(&mut self, s: &mut Str) {
            s.value = s.value.replace(self.from, self.to).into();
            s.raw = None;
        }
    }

    fn replacer(from: &'static str, to: &'static str) -> impl VisitorFactory {
        box StrReplacer { from, to }
    }

    fn to_js(m: &Module, cm: &Arc<SourceMap>) -> String {
        let mut bytes = Vec::new();
        let mut emitter = Emitter {
            cfg: swc_ecma_codegen::Config {
                minify: true,
                ..Default::default()
            },
            cm: cm.clone(),
            comments: None,
            wr: JsWriter::new(cm.clone(), "\n", &mut bytes, None),
        };

        emitter.emit_module(m).unwrap();

        String::from_utf8(bytes).unwrap()
    }

    #[test]
    fn path_visitor() {
        testing::run_test(false, |cm, _handler| {
            let fm = cm.new_source_file(FileName::Anon, "('foo', 'bar', ['baz']);".into());

            let m = parse(&fm);

            let module_kind = AstParentKind::Module(ModuleField::Body(0));
            let module_item_kind = AstParentKind::ModuleItem(ModuleItemField::Stmt);
            let stmt_kind = AstParentKind::Stmt(StmtField::Expr);
            let expr_kind = AstParentKind::Expr(ExprField::Seq);
            let seq_kind = AstParentKind::SeqExpr(SeqExprField::Exprs(1));
            let expr2_kind = AstParentKind::Expr(ExprField::Lit);
            let lit_kind = AstParentKind::Lit(LitField::Str);

            {
                let path = vec![
                    module_kind,
                    module_item_kind,
                    stmt_kind,
                    expr_kind,
                    seq_kind,
                    expr2_kind,
                    lit_kind,
                ];
                let bar_replacer = replacer("bar", "bar-success");

                let mut m = m.clone();
                m.visit_mut_with_path(
                    &mut ApplyVisitors::new(vec![(&path, &bar_replacer)]),
                    &mut Default::default(),
                );

                let s = to_js(&m, &cm);
                assert_eq!(s, r#"("foo","bar-success",["baz"]);"#);
            }

            {
                let wrong_path = vec![
                    module_kind,
                    module_item_kind,
                    stmt_kind,
                    // expr_kind,
                    seq_kind,
                    expr2_kind,
                    lit_kind,
                ];
                let bar_replacer = replacer("bar", "bar-success");

                let mut m = m.clone();
                m.visit_mut_with_path(
                    &mut ApplyVisitors::new(vec![(&wrong_path, &bar_replacer)]),
                    &mut Default::default(),
                );

                let s = to_js(&m, &cm);
                assert!(!s.contains("bar-success"));
            }

            drop(m);

            Ok(())
        })
        .unwrap();
    }
}
