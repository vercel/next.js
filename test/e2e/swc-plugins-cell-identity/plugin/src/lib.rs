#![allow(clippy::not_unsafe_ptr_arg_deref)]

use serde::Deserialize;
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::*,
        visit::{VisitMut, VisitMutWith, visit_mut_pass},
    },
    plugin::{plugin_transform, proxies::TransformPluginProgramMetadata},
};

// Simulate "different" plugins via feature flags
#[cfg(feature = "a")]
const PLUGIN: &str = "a";
#[cfg(feature = "b")]
const PLUGIN: &str = "b";
#[cfg(feature = "c")]
const PLUGIN: &str = "c";

#[derive(Deserialize)]
struct Config {
    plugin: String,
    value: String,
}

struct ConfigCheckVisitor {
    marker: String,
    replacement: String,
}

impl VisitMut for ConfigCheckVisitor {
    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        expr.visit_mut_children_with(self);

        if let Expr::Ident(ident) = expr {
            if ident.sym.as_str() == self.marker {
                *expr = Expr::Lit(Lit::Str(Str {
                    span: DUMMY_SP,
                    value: self.replacement.clone().into(),
                    raw: None,
                }));
            }
        }
    }
}

#[plugin_transform]
pub fn process_transform(program: Program, metadata: TransformPluginProgramMetadata) -> Program {
    let config: Config = serde_json::from_str(
        &metadata
            .get_transform_plugin_config()
            .expect("failed to get plugin config"),
    )
    .expect("invalid plugin config");

    if config.plugin != PLUGIN {
        panic!(
            "plugin {PLUGIN} was executed with the config of plugin {}",
            config.plugin
        );
    }

    program.apply(visit_mut_pass(&mut ConfigCheckVisitor {
        marker: format!("PLUGIN_{}", PLUGIN.to_uppercase()),
        replacement: format!("{PLUGIN}:{}", config.value),
    }))
}
