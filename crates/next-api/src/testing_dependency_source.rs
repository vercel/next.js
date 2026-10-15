//! Parse dependency syntax without changing source or using an evaluator.
//! Resolution belongs to the actual originating compiler module and its context.
use std::collections::BTreeSet;

use swc_core::{
    common::{FileName, SourceMap},
    ecma::{
        ast::*,
        parser::{Syntax, TsSyntax, parse_file_as_program},
        visit::{Visit, VisitWith},
    },
};

#[derive(Default)]
pub(crate) struct LiteralDependencies {
    pub requests: BTreeSet<(String, bool)>,
    pub complete: bool,
}

pub(crate) fn literal_dependencies(source: &str, filename: &str) -> LiteralDependencies {
    let cm = SourceMap::default();
    let file = cm.new_source_file(FileName::Custom(filename.into()).into(), source.to_owned());
    let mut errors = Vec::new();
    let program = parse_file_as_program(
        &file,
        Syntax::Typescript(TsSyntax {
            tsx: ![".ts", ".mts", ".cts"]
                .iter()
                .any(|suffix| filename.ends_with(suffix)),
            decorators: true,
            ..Default::default()
        }),
        EsVersion::EsNext,
        None,
        &mut errors,
    );
    let Ok(program) = program else {
        return LiteralDependencies::default();
    };
    let mut result = LiteralDependencies {
        complete: errors.is_empty(),
        ..Default::default()
    };
    program.visit_with(&mut result);
    result
}

impl Visit for LiteralDependencies {
    fn visit_import_decl(&mut self, node: &ImportDecl) {
        if node.type_only || (!node.specifiers.is_empty() && node.specifiers.iter().all(|specifier| matches!(specifier, ImportSpecifier::Named(named) if named.is_type_only))) { return }
        if node.with.is_some() {
            self.complete = false;
            return;
        }
        self.requests
            .insert((node.src.value.to_string_lossy().into_owned(), false));
    }
    fn visit_named_export(&mut self, node: &NamedExport) {
        if node.type_only || (!node.specifiers.is_empty() && node.specifiers.iter().all(|specifier| matches!(specifier, ExportSpecifier::Named(named) if named.is_type_only))) {
            return;
        }
        if let Some(source) = &node.src {
            if node.with.is_some() {
                self.complete = false;
                return;
            }
            self.requests
                .insert((source.value.to_string_lossy().into_owned(), false));
        }
    }
    fn visit_export_all(&mut self, node: &ExportAll) {
        if node.type_only {
            return;
        }
        if node.with.is_some() {
            self.complete = false;
            return;
        }
        self.requests
            .insert((node.src.value.to_string_lossy().into_owned(), false));
    }
    fn visit_ident(&mut self, node: &Ident) {
        if node.sym == "require" {
            self.complete = false;
        }
    }
    fn visit_member_expr(&mut self, node: &MemberExpr) {
        if matches!(&node.obj, object if matches!(&**object, Expr::MetaProp(meta) if meta.kind == MetaPropKind::ImportMeta))
            && matches!(&node.prop, MemberProp::Ident(property) if property.sym == "glob" || property.sym == "globEager")
        {
            self.complete = false;
        }
        node.visit_children_with(self);
    }
    fn visit_call_expr(&mut self, node: &CallExpr) {
        if matches!(node.callee, Callee::Import(_)) {
            if node.args.len() == 1 && node.args[0].spread.is_none() {
                if let Expr::Lit(Lit::Str(source)) = &*node.args[0].expr {
                    self.requests
                        .insert((source.value.to_string_lossy().into_owned(), true));
                    return;
                }
            }
            self.complete = false;
        }
        if matches!(&node.callee, Callee::Expr(callee) if matches!(&**callee, Expr::Ident(name) if name.sym == "require"))
        {
            // CommonJS shadowing/conditional resolution needs its own real
            // origin proof. Existing references remain useful but incomplete.
            self.complete = false;
        }
        node.visit_children_with(self);
    }
}

#[cfg(test)]
mod tests {
    use crate::testing_dependency_source::literal_dependencies;

    #[test]
    fn retains_literal_imports_before_dead_code_removal() {
        let result = literal_dependencies(
            "import {x} from './a.mjs';export {x} from './b.mjs';export * from \
             './c.mjs';if(false) import('./dead.mjs');",
            "test.mjs",
        );
        assert!(result.complete);
        assert_eq!(result.requests.len(), 4);
        assert!(result.requests.contains(&("./dead.mjs".into(), true)));
    }
    #[test]
    fn ignores_comments_strings_and_type_only_edges() {
        let result = literal_dependencies(
            "// import './comment.mjs'\nconst s=\"import('./string.mjs')\";import type {X} from \
             './type';export type {Y} from './type2';export {type Z} from './type3';",
            "test.ts",
        );
        assert!(result.complete);
        assert!(result.requests.is_empty());
    }
    #[test]
    fn unknown_requests_attributes_require_and_parse_failures_are_incomplete() {
        for source in [
            "import(name)",
            "import('./a',{with:{type:'json'}})",
            "import data from './a.json' with {type:'json'}",
            "require('./a')",
            "const r=require;r('./a')",
            "import.meta.glob('./*.mjs')",
            "const =",
        ] {
            assert!(
                !literal_dependencies(source, "test.mjs").complete,
                "{source}"
            );
        }
    }
}
