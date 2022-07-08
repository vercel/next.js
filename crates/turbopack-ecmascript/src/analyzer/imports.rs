use swc_atoms::JsWord;
use swc_common::collections::AHashMap;
use swc_ecmascript::{
    ast::*,
    visit::{Visit, VisitWith},
};

use super::JsValue;

/// The storage for all kinds of imports.
///
/// Note that wHen it's initialized by calling `analyze`, it only contains ESM
/// import/exports.
#[derive(Default, Debug)]
pub(crate) struct ImportMap {
    /// Map from module name to (module path, exported symbol)
    imports: AHashMap<Id, (JsWord, JsWord)>,

    namespace_imports: AHashMap<Id, JsWord>,
}

impl ImportMap {
    pub fn get_import(&self, id: &Id) -> Option<JsValue> {
        if let Some((i_src, i_sym)) = self.imports.get(id) {
            return Some(JsValue::member(
                box JsValue::Module(i_src.clone()),
                box i_sym.clone().into(),
            ));
        }
        if let Some(i_src) = self.namespace_imports.get(id) {
            return Some(JsValue::Module(i_src.clone()));
        }
        None
    }

    /// Analyze ES import
    pub(super) fn analyze(m: &Program) -> Self {
        let mut data = ImportMap::default();

        m.visit_with(&mut Analyzer { data: &mut data });

        data
    }
}

struct Analyzer<'a> {
    data: &'a mut ImportMap,
}

impl Visit for Analyzer<'_> {
    fn visit_import_decl(&mut self, import: &ImportDecl) {
        for s in &import.specifiers {
            let (local, orig_sym) = match s {
                ImportSpecifier::Named(ImportNamedSpecifier {
                    local, imported, ..
                }) => match imported {
                    Some(imported) => (local.to_id(), orig_name(imported)),
                    _ => (local.to_id(), local.sym.clone()),
                },
                ImportSpecifier::Default(s) => (s.local.to_id(), "default".into()),
                ImportSpecifier::Namespace(s) => {
                    self.data
                        .namespace_imports
                        .insert(s.local.to_id(), import.src.value.clone());
                    continue;
                }
            };

            self.data
                .imports
                .insert(local, (import.src.value.clone(), orig_sym));
        }
    }
}

fn orig_name(n: &ModuleExportName) -> JsWord {
    match n {
        ModuleExportName::Ident(v) => v.sym.clone(),
        ModuleExportName::Str(v) => v.value.clone(),
    }
}
