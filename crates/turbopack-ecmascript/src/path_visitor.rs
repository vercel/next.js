use std::collections::HashMap;

use swc_common::{Span, Spanned};
use swc_ecmascript::{
    ast::*,
    visit::{noop_visit_type, AstKindPath, Visit, VisitMutAstPath, VisitMutWithPath, VisitWith},
};

pub type AstPath = Vec<Span>;

pub type BoxedVisitor = Box<dyn VisitMutAstPath + Send + Sync>;
pub type VisitorFn = Box<dyn Send + Sync + Fn() -> BoxedVisitor>;

pub struct ApplyVisitors<'a> {
    /// `VisitMut` should be shallow. In other words, it should not visit
    /// children of the node.
    visitors: HashMap<Span, Vec<(&'a AstPath, &'a VisitorFn)>>,

    index: usize,
}

impl<'a> ApplyVisitors<'a> {
    pub fn new(visitors: HashMap<Span, Vec<(&'a AstPath, &'a VisitorFn)>>) -> Self {
        Self { visitors, index: 0 }
    }

    fn visit_if_required<N>(&mut self, n: &mut N, ast_path: &mut AstKindPath)
    where
        N: Spanned
            + VisitMutWithPath<Box<dyn VisitMutAstPath + Send + Sync>>
            + for<'aa> VisitMutWithPath<ApplyVisitors<'aa>>,
    {
        let span = n.span();

        if let Some(children) = self.visitors.get(&span) {
            for child in children.iter() {
                if self.index == child.0.len() - 1 {
                    if child.0.last() == Some(&span) {
                        n.visit_mut_with_path(&mut child.1(), ast_path);
                    }
                } else {
                    debug_assert!(self.index < child.0.len());

                    let mut children_map = HashMap::<_, Vec<_>>::with_capacity(child.0.len());
                    for span in child.0.iter().copied() {
                        children_map
                            .entry(span)
                            .or_default()
                            .push((child.0, child.1));
                    }

                    // Instead of resetting, we create a new instance of this struct
                    n.visit_mut_children_with_path(
                        &mut ApplyVisitors {
                            visitors: children_map,
                            index: self.index + 1,
                        },
                        ast_path,
                    );
                }
            }
        }
    }
}

macro_rules! method {
    ($name:ident,$T:ty) => {
        fn $name(&mut self, n: &mut $T, ast_path: &mut AstKindPath) {
            self.visit_if_required(n, ast_path);
        }
    };
}

impl VisitMutAstPath for ApplyVisitors<'_> {
    method!(visit_mut_prop, Prop);
    method!(visit_mut_expr, Expr);
    method!(visit_mut_pat, Pat);
    method!(visit_mut_stmt, Stmt);
    method!(visit_mut_module_decl, ModuleDecl);
}

pub struct VisitorCreator<V>
where
    V: CreateVisitorFn,
{
    spans: Vec<Span>,
    creator: V,
    visitors: Vec<(Vec<Span>, VisitorFn)>,
}

pub trait CreateVisitorFn {
    fn create_visitor_fn(&mut self, ast_path: &[Span]) -> Option<VisitorFn>;
}

macro_rules! visit_rule {
    ($name:ident,$T:ty) => {
        fn $name(&mut self, n: &$T) {
            self.check(n);
        }
    };
}

impl<V> VisitorCreator<V>
where
    V: CreateVisitorFn,
{
    pub fn new(creator: V) -> Self {
        Self {
            spans: Vec::new(),
            creator,
            visitors: Vec::new(),
        }
    }

    fn check<N>(&mut self, n: &N)
    where
        N: VisitWith<Self> + Spanned,
    {
        let span = n.span();

        self.spans.push(span);
        let v = self.creator.create_visitor_fn(&self.spans);
        if let Some(v) = v {
            self.visitors.push((self.spans.clone(), v));
        }

        n.visit_children_with(self);

        self.spans.pop();
    }
}

impl<V> Visit for VisitorCreator<V>
where
    V: CreateVisitorFn,
{
    noop_visit_type!();

    visit_rule!(visit_prop, Prop);
    visit_rule!(visit_expr, Expr);
    visit_rule!(visit_pat, Pat);
    visit_rule!(visit_stmt, Stmt);
    visit_rule!(visit_module_decl, ModuleDecl);
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use swc_common::{errors::HANDLER, BytePos, FileName, Mark, SourceFile, Span};
    use swc_ecma_transforms_base::resolver;
    use swc_ecmascript::{
        ast::*,
        parser::parse_file_as_module,
        visit::{AstKindPath, VisitMutAstPath, VisitMutWith, VisitMutWithPath},
    };

    use super::{ApplyVisitors, CreateVisitorFn, VisitorFn};
    use crate::path_visitor::VisitorCreator;

    fn parse(fm: &SourceFile) -> Module {
        let mut m = parse_file_as_module(
            &fm,
            Default::default(),
            EsVersion::latest(),
            None,
            &mut vec![],
        )
        .map_err(|err| HANDLER.with(|handler| err.into_diagnostic(&handler).emit()))
        .unwrap();

        let unresolved_mark = Mark::new();
        let top_level_mark = Mark::new();
        m.visit_mut_with(&mut resolver(unresolved_mark, top_level_mark, false));

        m
    }

    fn span_of(fm: &SourceFile, text: &str) -> Span {
        let idx = BytePos(fm.src.find(text).expect("span_of: text not found") as _);
        let lo = fm.start_pos + idx;

        Span::new(lo, lo + BytePos(text.len() as _), Default::default())
    }

    struct StrReplacer<'a> {
        from: &'a str,
        to: &'a str,
    }

    impl VisitMutAstPath for StrReplacer<'_> {
        fn visit_mut_str(&mut self, s: &mut Str, ast_path: &mut AstKindPath) {
            s.value = s.value.replace(self.from, self.to).into();
            s.raw = None;
        }
    }

    fn replacer(from: &'static str, to: &'static str) -> VisitorFn {
        box || {
            eprintln!("Creating replacer");
            box StrReplacer { from, to }
        }
    }

    #[test]
    fn path_visitor() {
        testing::run_test(false, |cm, handler| {
            let fm = cm.new_source_file(FileName::Anon, "('foo', 'bar', ['baz']);".into());

            let m = parse(&fm);

            let bar_span = span_of(&fm, "'bar'");

            let stmt_span = span_of(&fm, "('foo', 'bar', ['baz']);");
            let expr_span = span_of(&fm, "('foo', 'bar', ['baz'])");
            let seq_span = span_of(&fm, "'foo', 'bar', ['baz']");
            let arr_span = span_of(&fm, "['baz']");
            let baz_span = span_of(&fm, "'baz'");

            dbg!(bar_span);
            dbg!(expr_span);
            dbg!(arr_span);
            dbg!(baz_span);

            {
                let mut map = HashMap::<_, Vec<_>>::default();

                let bar_span_vec = vec![stmt_span, expr_span, seq_span, bar_span];
                let bar_replacer = replacer("bar", "bar-success");
                {
                    let e = map.entry(stmt_span).or_default();

                    e.push((&bar_span_vec, &bar_replacer));
                }

                let mut m = m.clone();
                m.visit_mut_with_path(&mut ApplyVisitors::new(map), &mut Default::default());

                let s = format!("{:?}", m);
                assert!(s.contains("bar-success"), "Should be replaced: {:#?}", m);
            }

            {
                let mut map = HashMap::<_, Vec<_>>::default();

                let wrong_span_vec = vec![baz_span];
                let bar_replacer = replacer("bar", "bar-success");
                {
                    let e = map.entry(stmt_span).or_default();

                    e.push((&wrong_span_vec, &bar_replacer));
                }

                let mut m = m.clone();
                m.visit_mut_with_path(&mut ApplyVisitors::new(map), &mut Default::default());

                let s = format!("{:?}", m);
                assert!(
                    !s.contains("bar-success"),
                    "Should not be replaced: {:#?}",
                    m
                );
            }

            Ok(())
        })
        .unwrap();
    }

    struct TestVisitorCreator {
        created: Vec<Vec<Span>>,
    }

    impl CreateVisitorFn for TestVisitorCreator {
        fn create_visitor_fn(&mut self, spans: &[Span]) -> Option<VisitorFn> {
            if spans.len() == 1 {
                eprintln!("Creating visitor");

                self.created.push(spans.to_vec());
                Some(replacer("", ""))
            } else {
                None
            }
        }
    }

    #[test]
    fn visit_with_path() {
        testing::run_test(false, |cm, handler| {
            let fm = cm.new_source_file(FileName::Anon, "('foo', 'bar', ['baz']);".into());

            let m = parse(&fm);
            let creator = TestVisitorCreator { created: vec![] };

            let bar_span = span_of(&fm, "'bar'");

            let stmt_span = span_of(&fm, "('foo', 'bar', ['baz']);");
            let expr_span = span_of(&fm, "('foo', 'bar', ['baz'])");
            let seq_span = span_of(&fm, "'foo', 'bar', ['baz']");
            let arr_span = span_of(&fm, "['baz']");
            let baz_span = span_of(&fm, "'baz'");

            dbg!(bar_span);
            dbg!(expr_span);
            dbg!(arr_span);
            dbg!(baz_span);

            let mut v = VisitorCreator::new(creator);

            Ok(())
        })
        .unwrap();
    }
}
