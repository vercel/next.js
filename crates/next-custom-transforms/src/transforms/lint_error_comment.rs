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

// declare a const of comment prefix
const COMMENT_PREFIX: &str = "Next.js Dynamic Async API Codemod:";

impl<C> LintErrorComment<C>
where
    C: Comments,
{
    fn lint(&self, comment: &Comment, is_leading: bool) {
        let trimmed_text = comment.text.trim();
        // if comment contains @next/codemod comment "Next.js Dynamic Async API Codemod:",
        // report an error from the linter to fail the build
        if trimmed_text.contains(COMMENT_PREFIX) {
            let span = if is_leading {
                comment
                    .span
                    .with_lo(comment.span.lo() - swc_core::common::BytePos(1))
            } else {
                comment
                    .span
                    .with_hi(comment.span.hi() + swc_core::common::BytePos(1))
            };
            let action = trimmed_text.replace(COMMENT_PREFIX, "");
            let err_message = format!(
                "You have unresolved @next/codemod comment needs to be removed, please address \
                 and remove it to proceed build.\nAction: \"{}\"",
                action
            );
            report(span, &err_message);
        }
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
