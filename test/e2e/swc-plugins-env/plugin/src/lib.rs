#![allow(clippy::not_unsafe_ptr_arg_deref)]

use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::*,
        visit::{VisitMut, VisitMutWith, visit_mut_pass},
    },
    plugin::{
        metadata::TransformPluginMetadataContextKind, plugin_transform,
        proxies::TransformPluginProgramMetadata,
    },
};

struct EnvCheckVisitor {
    env_name: String,
}

impl VisitMut for EnvCheckVisitor {
    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        expr.visit_mut_children_with(self);

        // Replace any identifier `ENV_CHECK` with a string literal of the actual env value
        if let Expr::Ident(ident) = expr {
            if ident.sym.as_str() == "ENV_CHECK" {
                *expr = Expr::Lit(Lit::Str(Str {
                    span: DUMMY_SP,
                    value: self.env_name.clone().into(),
                    raw: None,
                }));
            }
        }
    }
}

#[plugin_transform]
pub fn process_transform(program: Program, metadata: TransformPluginProgramMetadata) -> Program {
    let env_name = metadata
        .get_context(&TransformPluginMetadataContextKind::Env)
        .expect("failed to get env");

    program.apply(visit_mut_pass(&mut EnvCheckVisitor { env_name }))
}
