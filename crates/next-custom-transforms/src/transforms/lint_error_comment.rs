use swc_core::{
    common::{
        comments::{Comment, Comments},
        errors::HANDLER,
    },
    ecma::{utils::swc_common::Span, visit::Visit},
};

struct LintErrorComment<C>
where
    C: Comments,
{
    comments: C,
}

pub fn lint_error_comment<C>(comments: C) -> impl Visit
where
    C: Comments,
{
    LintErrorComment { comments }
}

impl<C> LintErrorComment<C>
where
    C: Comments,
{
    fn lint(&self, comment: &Comment, is_leading: bool) {
        // TODO: Check content of comment and report error if it's an error comment
    }
}

fn report(span: Span, msg: &str) {
    HANDLER.with(|handler| {
        handler.struct_span_err(span, msg).emit();
    })
}

impl<C> Visit for LintErrorComment<C>
where
    C: Comments,
{
    fn visit_span(&mut self, s: &Span) {
        self.comments.with_leading(s.lo, |comments| {
            for c in comments {
                self.lint(c, true);
            }
        });

        self.comments.with_trailing(s.hi, |comments| {
            for c in comments {
                self.lint(c, false);
            }
        });
    }
}
