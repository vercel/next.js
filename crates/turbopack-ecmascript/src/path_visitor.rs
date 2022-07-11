use std::collections::HashMap;

use swc_common::{Span, Spanned};
use swc_ecma_visit::VisitMut;
use swc_ecmascript::{
    ast::*,
    visit::{VisitMutWith},
};
pub type AstPath = Vec<Span>;

pub type BoxedVisitor = Box<dyn VisitMut + Send + Sync>;
pub type VisitorFn = Box<dyn Send + Sync + Fn() -> BoxedVisitor>;

pub struct ApplyVisitors<'a> {
    /// `VisitMut` should be shallow. In other words, it should not visit
    /// children of the node.
    visitors: HashMap<Span, Vec<(&'a AstPath, &'a VisitorFn)>>,

    index: usize,
}

impl<'a> ApplyVisitors<'a> {
    pub fn new(visitors: Vec<(&'a AstPath, &'a VisitorFn)>) -> Self {
        let mut map = HashMap::<Span, Vec<(&'a AstPath, &'a VisitorFn)>>::new();
        for (path, visitor) in visitors {
            if let Some(span) = path.first() {
                map.entry(*span).or_default().push((path, visitor));
            }
        }
        Self {
            visitors: map,
            index: 1,
        }
    }

    fn visit_if_required<N>(&mut self, n: &mut N)
    where
        N: Spanned
            + VisitMutWith<Box<dyn VisitMut + Send + Sync>>
            + for<'aa> VisitMutWith<ApplyVisitors<'aa>>,
    {
        let span = n.span();

        if let Some(visitors) = self.visitors.get(&span) {
            let mut visitors_map = HashMap::<_, Vec<_>>::with_capacity(visitors.len());
            for (path, visitor) in visitors.iter() {
                if self.index == path.len() {
                    n.visit_mut_with(&mut visitor());
                } else {
                    debug_assert!(self.index < path.len());

                    let span = path[self.index];
                    visitors_map
                        .entry(span)
                        .or_default()
                        .push((*path, *visitor));
                }
            }
            if !visitors_map.is_empty() {
                // Instead of resetting, we create a new instance of this struct
                n.visit_mut_children_with(&mut ApplyVisitors {
                    visitors: visitors_map,
                    index: self.index + 1,
                });
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
    // TODO: we need a macro to apply that for all methods
    method!(visit_mut_prop, Prop);
    method!(visit_mut_expr, Expr);
    method!(visit_mut_pat, Pat);
    method!(visit_mut_stmt, Stmt);
    method!(visit_mut_module_decl, ModuleDecl);
}

#[cfg(test)]
mod tests {
    use std::{sync::Arc};

    use swc_common::{errors::HANDLER, BytePos, FileName, Mark, SourceFile, Span, SourceMap};
    use swc_ecma_codegen::{Emitter, text_writer::JsWriter};
    use swc_ecma_transforms_base::resolver;
    use swc_ecma_visit::VisitMut;
    use swc_ecmascript::{ast::*, parser::parse_file_as_module, visit::VisitMutWith};

    use super::{ApplyVisitors, VisitorFn};

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
        fn visit_mut_str(&mut self, s: &mut Str) {
            s.value = s.value.replace(self.from, self.to).into();
            s.raw = None;
        }
    }

    fn replacer(from: &'static str, to: &'static str) -> VisitorFn {
        box || {
            box StrReplacer { from, to }
        }
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

        emitter.emit_module(&m).unwrap();

        String::from_utf8(bytes).unwrap()
    }

    #[test]
    fn path_visitor() {
        testing::run_test(false, |cm, _handler| {
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
                let bar_span_vec = vec![stmt_span, expr_span, seq_span, bar_span];
                let bar_replacer = replacer("bar", "bar-success");

                let mut m = m.clone();
                m.visit_mut_with(&mut ApplyVisitors::new(vec![(
                    &bar_span_vec,
                    &bar_replacer,
                )]));

                let s = to_js(&m, &cm);
                assert_eq!(
                    s, r#"("foo","bar-success",["baz"]);"#
                );
            }

            {
                let wrong_span_vec = vec![baz_span];
                let bar_replacer = replacer("bar", "bar-success");

                let mut m = m.clone();
                m.visit_mut_with(&mut ApplyVisitors::new(vec![(
                    &wrong_span_vec,
                    &bar_replacer,
                )]));

                let s = to_js(&m, &cm);
                assert!(
                    !s.contains("bar-success")
                );
            }

            Ok(())
        })
        .unwrap();
    }
}
