use std::collections::HashMap;

use swc_common::{Span, Spanned};
use swc_ecmascript::{
    ast::*,
    visit::{noop_visit_mut_type, VisitMut, VisitMutWith},
};

pub type AstPath = Vec<Span>;

pub type BoxedVisitor = Box<dyn VisitMut + Send + Sync>;
pub type VisitorFn = Box<dyn Send + Sync + Fn() -> BoxedVisitor>;

pub struct ApplyVisitors<'a> {
    /// `VisitMut` should be shallow. In other words, it should not visit
    /// children of the node.
    pub visitors: HashMap<Span, Vec<(&'a AstPath, &'a VisitorFn)>>,

    index: usize,
}

impl<'a> ApplyVisitors<'a> {
    fn visit_if_required<N>(&mut self, n: &mut N)
    where
        N: Spanned
            + VisitMutWith<Box<dyn VisitMut + Send + Sync>>
            + for<'aa> VisitMutWith<ApplyVisitors<'aa>>,
    {
        let span = n.span();

        if let Some(children) = self.visitors.get(&span) {
            for child in children.iter() {
                if self.index == child.0.len() {
                    n.visit_mut_with(&mut child.1());
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
                    n.visit_mut_with(&mut ApplyVisitors {
                        visitors: children_map,
                        index: self.index + 1,
                    });
                }
            }
        }
    }
}

macro_rules! method {
    ($name:ident,$T:ty) => {
        fn $name(&mut self, n: &mut $T) {
            self.visit_if_required(n);
        }
    };
}

impl VisitMut for ApplyVisitors<'_> {
    noop_visit_mut_type!();

    method!(visit_mut_prop, Prop);
    method!(visit_mut_expr, Expr);
    method!(visit_mut_pat, Pat);
    method!(visit_mut_stmt, Stmt);
    method!(visit_mut_module_decl, ModuleDecl);
}

#[cfg(test)]
mod tests {
    use swc_common::{errors::HANDLER, BytePos, FileName, Mark, SourceFile, SourceMap, Span};
    use swc_ecma_transforms_base::resolver;
    use swc_ecmascript::{
        ast::*,
        parser::parse_file_as_module,
        visit::{noop_visit_mut_type, VisitMut, VisitMutWith},
    };

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

    impl VisitMut for StrReplacer<'_> {
        noop_visit_mut_type!();

        fn visit_mut_str(&mut self, s: &mut Str) {
            s.value = s.value.replace(self.from, self.to).into();
        }
    }

    fn replacer(from: &'static str, to: &'static str) -> super::VisitorFn {
        box || box StrReplacer { from, to }
    }

    #[test]
    fn case_1() {
        testing::run_test(false, |cm, handler| {
            let fm = cm.new_source_file(FileName::Anon, "('foo', 'bar', ['baz'])".into());

            let m = parse(&fm);

            let expr_span = span_of(&fm, "('foo', 'bar', ['baz'])");
            let arr_span = span_of(&fm, "['baz']");
            let baz_span = span_of(&fm, "'baz'");

            Ok(())
        })
        .unwrap();
    }
}
