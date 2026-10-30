use anyhow::Result;
use async_trait::async_trait;
use rustc_hash::FxHashSet;
use swc_core::{
    common::{DUMMY_SP, SyntaxContext},
    ecma::{
        ast::*,
        visit::{VisitMut, VisitMutWith},
    },
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::{EcmascriptTransformStage, get_ecma_transform_rule};
use crate::util::OptionEnvMap;

pub async fn get_missing_public_env_rule(
    define_env: Vc<OptionEnvMap>,
    mdx_rs: bool,
) -> Result<ModuleRule> {
    Ok(get_ecma_transform_rule(
        missing_public_env_plugin(define_env).to_resolved().await?,
        mdx_rs,
        EcmascriptTransformStage::Preprocess,
    ))
}

#[turbo_tasks::function]
fn missing_public_env_plugin(define_env: ResolvedVc<OptionEnvMap>) -> Vc<TransformPlugin> {
    Vc::cell(Box::new(MissingPublicEnv { define_env }) as Box<dyn CustomTransformer + Send + Sync>)
}

#[derive(Debug)]
struct MissingPublicEnv {
    define_env: ResolvedVc<OptionEnvMap>,
}

#[async_trait]
impl CustomTransformer for MissingPublicEnv {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        // Split builds retain their existing ability to supply public values later.
        if self
            .define_env
            .get(&rcstr!("__NEXT_INLINE_MISSING_PUBLIC_ENV"))
            .await?
            .as_ref()
            .and_then(|v| v.as_ref())
            .is_some_and(|v| v == "false")
        {
            return Ok(());
        }
        // An explicit replacement of the object itself also takes precedence.
        if self.define_env.get(&rcstr!("process")).await?.is_some()
            || self.define_env.get(&rcstr!("process.env")).await?.is_some()
        {
            return Ok(());
        }
        let unresolved_ctxt = SyntaxContext::empty().apply_mark(ctx.unresolved_mark);
        let mut visitor = PublicEnvReads {
            unresolved_ctxt,
            names: FxHashSet::default(),
            missing: None,
        };
        program.visit_mut_with(&mut visitor);
        let mut missing = FxHashSet::default();
        for name in visitor.names {
            // Keyed access: a transform depends only on the names it actually reads,
            // not every public variable (or its value) in the project.
            if self.define_env.get(&name).await?.is_none()
                && self
                    .define_env
                    .get(&RcStr::from(format!("typeof {name}")))
                    .await?
                    .is_none()
            {
                missing.insert(name);
            }
        }
        program.visit_mut_with(&mut PublicEnvReads {
            unresolved_ctxt,
            names: FxHashSet::default(),
            missing: Some(missing),
        });
        Ok(())
    }
}

fn property(prop: &MemberProp) -> Option<&str> {
    match prop {
        MemberProp::Ident(ident) => Some(&ident.sym),
        MemberProp::Computed(computed) => match &*computed.expr {
            Expr::Lit(Lit::Str(value)) => value.value.as_str(),
            _ => None,
        },
        _ => None,
    }
}

fn public_env_name(expr: &Expr, unresolved_ctxt: SyntaxContext) -> Option<RcStr> {
    let Expr::Member(member) = expr else {
        return None;
    };
    let Expr::Member(env) = &*member.obj else {
        return None;
    };
    let Expr::Ident(process) = &*env.obj else {
        return None;
    };
    if process.sym != "process"
        || process.ctxt != unresolved_ctxt
        || property(&env.prop) != Some("env")
    {
        return None;
    }
    let name = property(&member.prop)?;
    name.starts_with("NEXT_PUBLIC_")
        .then(|| format!("process.env.{name}").into())
}

struct PublicEnvReads {
    unresolved_ctxt: SyntaxContext,
    names: FxHashSet<RcStr>,
    // None collects read names; Some rewrites only names without explicit defines.
    missing: Option<FxHashSet<RcStr>>,
}

impl VisitMut for PublicEnvReads {
    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        if let Some(name) = public_env_name(expr, self.unresolved_ctxt) {
            if let Some(missing) = &self.missing {
                if missing.contains(&name) {
                    *expr = Expr::Unary(UnaryExpr {
                        span: DUMMY_SP,
                        op: UnaryOp::Void,
                        arg: Box::new(Expr::Lit(Lit::Num(Number {
                            span: DUMMY_SP,
                            value: 0.0,
                            raw: None,
                        }))),
                    });
                    return;
                }
            } else {
                self.names.insert(name);
            }
        }
        match expr {
            Expr::Assign(assign) => {
                // Do not rewrite assignment patterns/targets. The RHS is a read.
                assign.right.visit_mut_with(self);
            }
            Expr::Update(_) | Expr::OptChain(_) => {}
            Expr::Unary(unary) if unary.op == UnaryOp::Delete => {}
            _ => expr.visit_mut_children_with(self),
        }
    }

    fn visit_mut_for_in_stmt(&mut self, stmt: &mut ForInStmt) {
        stmt.right.visit_mut_with(self);
        stmt.body.visit_mut_with(self);
    }

    fn visit_mut_for_of_stmt(&mut self, stmt: &mut ForOfStmt) {
        stmt.right.visit_mut_with(self);
        stmt.body.visit_mut_with(self);
    }
}

#[cfg(test)]
mod tests {
    use swc_core::{
        common::{FileName, GLOBALS, Mark, SourceMap},
        ecma::{
            parser::{Syntax, parse_file_as_program},
            transforms::base::resolver,
        },
    };

    use super::*;

    fn with_program(source: &str, test: impl FnOnce(Program, SyntaxContext)) {
        GLOBALS.set(&Default::default(), || {
            let cm = SourceMap::default();
            let fm =
                cm.new_source_file(FileName::Custom("env.js".into()).into(), source.to_owned());
            let mut errors = Vec::new();
            let mut program =
                parse_file_as_program(&fm, Syntax::default(), EsVersion::EsNext, None, &mut errors)
                    .unwrap();
            assert!(errors.is_empty());
            let unresolved = Mark::new();
            program.visit_mut_with(&mut resolver(unresolved, Mark::new(), false));
            test(program, SyntaxContext::empty().apply_mark(unresolved));
        });
    }

    #[test]
    fn matches_only_direct_global_reads() {
        with_program(
            r#"
            process.env.NEXT_PUBLIC_DOT;
            process.env['NEXT_PUBLIC_BRACKET'];
            typeof process.env.NEXT_PUBLIC_TYPE;
            process.env[key];
            const env = process.env; env.NEXT_PUBLIC_ALIAS;
            const { NEXT_PUBLIC_DESTRUCTURED } = process.env;
            function local(process) { return process.env.NEXT_PUBLIC_LOCAL }
            process.env.NEXT_PUBLIC_WRITE = 'value';
            process.env.NEXT_PUBLIC_UPDATE++;
            delete process.env.NEXT_PUBLIC_DELETE;
            process.env?.NEXT_PUBLIC_OPTIONAL;
            for (process.env.NEXT_PUBLIC_LOOP in {}) {}
        "#,
            |mut program, unresolved_ctxt| {
                let mut visitor = PublicEnvReads {
                    unresolved_ctxt,
                    names: FxHashSet::default(),
                    missing: None,
                };
                program.visit_mut_with(&mut visitor);
                let expected: FxHashSet<RcStr> = [
                    "process.env.NEXT_PUBLIC_DOT",
                    "process.env.NEXT_PUBLIC_BRACKET",
                    "process.env.NEXT_PUBLIC_TYPE",
                ]
                .into_iter()
                .map(RcStr::from)
                .collect();
                assert_eq!(visitor.names, expected);
            },
        );
    }

    #[test]
    fn rewrites_missing_but_not_explicit_defines() {
        with_program(
            "process.env.NEXT_PUBLIC_MISSING; process.env.NEXT_PUBLIC_DEFINED;",
            |mut program, unresolved_ctxt| {
                program.visit_mut_with(&mut PublicEnvReads {
                    unresolved_ctxt,
                    names: FxHashSet::default(),
                    missing: Some(
                        [RcStr::from("process.env.NEXT_PUBLIC_MISSING")]
                            .into_iter()
                            .collect(),
                    ),
                });
                let body = match &program {
                    Program::Script(script) => &script.body,
                    Program::Module(_) => panic!("expected script"),
                };
                let Stmt::Expr(first) = &body[0] else {
                    panic!("expected expression")
                };
                assert!(matches!(
                    &*first.expr,
                    Expr::Unary(UnaryExpr {
                        op: UnaryOp::Void,
                        ..
                    })
                ));
                let Stmt::Expr(second) = &body[1] else {
                    panic!("expected expression")
                };
                assert_eq!(
                    public_env_name(&second.expr, unresolved_ctxt).as_deref(),
                    Some("process.env.NEXT_PUBLIC_DEFINED")
                );
            },
        );
    }
}
