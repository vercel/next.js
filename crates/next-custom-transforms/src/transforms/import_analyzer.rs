use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::{
    atoms::{atom, Atom},
    ecma::{
        ast::{
            Expr, Id, ImportDecl, ImportNamedSpecifier, ImportSpecifier, MemberExpr, MemberProp,
            Module, ModuleExportName,
        },
        visit::{noop_visit_type, Visit, VisitWith},
    },
};

#[derive(Debug, Default)]
pub(crate) struct ImportMap {
    /// Map from module name to (module path, exported symbol)
    imports: FxHashMap<Id, (Atom, Atom)>,

    namespace_imports: FxHashMap<Id, Atom>,

    imported_modules: FxHashSet<Atom>,
}

#[allow(unused)]
impl ImportMap {
    pub fn is_module_imported(&mut self, module: &Atom) -> bool {
        self.imported_modules.contains(module)
    }

    /// Returns true if `e` is an import of `orig_name` from `module`.
    pub fn is_import(&self, e: &Expr, module: &str, orig_name: &str) -> bool {
        match e {
            Expr::Ident(i) => {
                if let Some((i_src, i_sym)) = self.imports.get(&i.to_id()) {
                    i_src == module && i_sym == orig_name
                } else {
                    false
                }
            }

            Expr::Member(MemberExpr {
                obj: box Expr::Ident(obj),
                prop: MemberProp::Ident(prop),
                ..
            }) => {
                if let Some(obj_src) = self.namespace_imports.get(&obj.to_id()) {
                    obj_src == module && prop.sym == *orig_name
                } else {
                    false
                }
            }

            _ => false,
        }
    }

    pub fn analyze(m: &Module) -> Self {
        let mut data = ImportMap::default();

        m.visit_with(&mut Analyzer { data: &mut data });

        data
    }
}

struct Analyzer<'a> {
    data: &'a mut ImportMap,
}

impl Visit for Analyzer<'_> {
    noop_visit_type!();

    fn visit_import_decl(&mut self, import: &ImportDecl) {
        self.data.imported_modules.insert(import.src.value.clone());

        for s in &import.specifiers {
            let (local, orig_sym) = match s {
                ImportSpecifier::Named(ImportNamedSpecifier {
                    local, imported, ..
                }) => match imported {
                    Some(imported) => (local.to_id(), orig_name(imported)),
                    _ => (local.to_id(), local.sym.clone()),
                },
                ImportSpecifier::Default(s) => (s.local.to_id(), atom!("default")),
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

fn orig_name(n: &ModuleExportName) -> Atom {
    match n {
        ModuleExportName::Ident(v) => v.sym.clone(),
        ModuleExportName::Str(v) => v.value.clone(),
    }
}
