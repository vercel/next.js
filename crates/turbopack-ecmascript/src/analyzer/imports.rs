use std::{collections::BTreeMap, fmt::Display};

use indexmap::{IndexMap, IndexSet};
use once_cell::sync::Lazy;
use swc_core::{
    common::{source_map::Pos, Span},
    ecma::{
        ast::*,
        atoms::{js_word, JsWord},
        visit::{Visit, VisitWith},
    },
};
use turbo_tasks::{RcStr, Vc};
use turbopack_core::{issue::IssueSource, source::Source};

use super::{top_level_await::has_top_level_await, JsValue, ModuleValue};
use crate::tree_shake::{find_turbopack_part_id_in_asserts, PartId};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Default, Debug, Clone, Hash, PartialOrd, Ord)]
pub struct ImportAnnotations {
    // TODO store this in more structured way
    #[turbo_tasks(trace_ignore)]
    map: BTreeMap<JsWord, JsWord>,
}

/// Enables a specified transition for the annotated import
static ANNOTATION_TRANSITION: Lazy<JsWord> =
    Lazy::new(|| crate::annotations::ANNOTATION_TRANSITION.into());

/// Changes the chunking type for the annotated import
static ANNOTATION_CHUNKING_TYPE: Lazy<JsWord> =
    Lazy::new(|| crate::annotations::ANNOTATION_CHUNKING_TYPE.into());

/// Changes the type of the resolved module (only "json" is supported currently)
static ATTRIBUTE_MODULE_TYPE: Lazy<JsWord> = Lazy::new(|| "type".into());

impl ImportAnnotations {
    pub fn parse(with: Option<&ObjectLit>) -> ImportAnnotations {
        let Some(with) = with else {
            return ImportAnnotations::default();
        };

        let mut map = BTreeMap::new();

        // The `with` clause is way more restrictive than `ObjectLit`, it only allows
        // string -> value and value can only be a string.
        // We just ignore everything else here till the SWC ast is more restrictive.
        for (key, value) in with.props.iter().filter_map(|prop| {
            let kv = prop.as_prop()?.as_key_value()?;

            let Lit::Str(str) = kv.value.as_lit()? else {
                return None;
            };

            Some((&kv.key, str))
        }) {
            let key = match key {
                PropName::Ident(ident) => ident.sym.as_str(),
                PropName::Str(str) => str.value.as_str(),
                // the rest are invalid, ignore for now till SWC ast is correct
                _ => continue,
            };

            map.insert(key.into(), value.value.as_str().into());
        }

        ImportAnnotations { map }
    }

    /// Returns the content on the transition annotation
    pub fn transition(&self) -> Option<&str> {
        self.get(&ANNOTATION_TRANSITION)
    }

    /// Returns the content on the chunking-type annotation
    pub fn chunking_type(&self) -> Option<&str> {
        self.get(&ANNOTATION_CHUNKING_TYPE)
    }

    /// Returns the content on the type attribute
    pub fn module_type(&self) -> Option<&str> {
        self.get(&ATTRIBUTE_MODULE_TYPE)
    }

    pub fn get(&self, key: &JsWord) -> Option<&str> {
        self.map.get(key).map(|w| w.as_str())
    }
}

impl Display for ImportAnnotations {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut it = self.map.iter();
        if let Some((k, v)) = it.next() {
            write!(f, "{{ {k}: {v}")?
        } else {
            return f.write_str("{}");
        };
        for (k, v) in it {
            write!(f, ", {k}: {v}")?
        }
        f.write_str(" }")
    }
}

#[derive(Debug)]
pub(crate) enum Reexport {
    Star,
    Namespace { exported: JsWord },
    Named { imported: JsWord, exported: JsWord },
}

/// The storage for all kinds of imports.
///
/// Note that when it's initialized by calling `analyze`, it only contains ESM
/// import/exports.
#[derive(Default, Debug)]
pub(crate) struct ImportMap {
    /// Map from identifier to (index in references, exported symbol)
    imports: IndexMap<Id, (usize, JsWord)>,

    /// Map from identifier to index in references
    namespace_imports: IndexMap<Id, usize>,

    /// List of (index in references, imported symbol, exported symbol)
    reexports: Vec<(usize, Reexport)>,

    /// Ordered list of imported symbols
    references: IndexSet<ImportMapReference>,

    /// True, when the module has exports
    has_exports: bool,

    /// True if the module is an ESM module due to top-level await.
    has_top_level_await: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(crate) enum ImportedSymbol {
    ModuleEvaluation,
    Symbol(JsWord),
    Exports,
    Part(u32),
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(crate) struct ImportMapReference {
    pub module_path: JsWord,
    pub imported_symbol: ImportedSymbol,
    pub annotations: ImportAnnotations,
    pub issue_source: Option<Vc<IssueSource>>,
}

impl ImportMap {
    pub fn is_esm(&self) -> bool {
        self.has_exports
            || self.has_top_level_await
            || !self.imports.is_empty()
            || !self.namespace_imports.is_empty()
    }

    pub fn get_import(&self, id: &Id) -> Option<JsValue> {
        if let Some((i, i_sym)) = self.imports.get(id) {
            let r = &self.references[*i];
            return Some(JsValue::member(
                Box::new(JsValue::Module(ModuleValue {
                    module: r.module_path.clone(),
                    annotations: r.annotations.clone(),
                })),
                Box::new(i_sym.clone().into()),
            ));
        }
        if let Some(i) = self.namespace_imports.get(id) {
            let r = &self.references[*i];
            return Some(JsValue::Module(ModuleValue {
                module: r.module_path.clone(),
                annotations: r.annotations.clone(),
            }));
        }
        None
    }

    // TODO this could return &str instead of String to avoid cloning
    pub fn get_binding(&self, id: &Id) -> Option<(usize, Option<RcStr>)> {
        if let Some((i, i_sym)) = self.imports.get(id) {
            return Some((*i, Some(i_sym.as_str().into())));
        }
        if let Some(i) = self.namespace_imports.get(id) {
            return Some((*i, None));
        }
        None
    }

    pub fn references(&self) -> impl Iterator<Item = &ImportMapReference> {
        self.references.iter()
    }

    pub fn reexports(&self) -> impl Iterator<Item = (usize, &Reexport)> {
        self.reexports.iter().map(|(i, r)| (*i, r))
    }

    /// Analyze ES import
    pub(super) fn analyze(m: &Program, source: Option<Vc<Box<dyn Source>>>) -> Self {
        let mut data = ImportMap::default();

        m.visit_with(&mut Analyzer {
            data: &mut data,
            source,
        });

        data
    }
}

struct Analyzer<'a> {
    data: &'a mut ImportMap,
    source: Option<Vc<Box<dyn Source>>>,
}

impl<'a> Analyzer<'a> {
    fn ensure_reference(
        &mut self,
        span: Span,
        module_path: JsWord,
        imported_symbol: ImportedSymbol,
        annotations: ImportAnnotations,
    ) -> Option<usize> {
        let issue_source = self
            .source
            .map(|s| IssueSource::from_swc_offsets(s, span.lo.to_usize(), span.hi.to_usize()));

        let r = ImportMapReference {
            module_path,
            imported_symbol,
            issue_source,
            annotations,
        };
        if let Some(i) = self.data.references.get_index_of(&r) {
            Some(i)
        } else {
            let i = self.data.references.len();
            self.data.references.insert(r);
            Some(i)
        }
    }
}

fn to_word(name: &ModuleExportName) -> JsWord {
    match name {
        ModuleExportName::Ident(ident) => ident.sym.clone(),
        ModuleExportName::Str(str) => str.value.clone(),
    }
}

impl Visit for Analyzer<'_> {
    fn visit_import_decl(&mut self, import: &ImportDecl) {
        let annotations = ImportAnnotations::parse(import.with.as_deref());

        let internal_symbol = parse_with(import.with.as_deref());

        if internal_symbol.is_none() {
            self.ensure_reference(
                import.span,
                import.src.value.clone(),
                ImportedSymbol::ModuleEvaluation,
                annotations.clone(),
            );
        }

        for s in &import.specifiers {
            let symbol = internal_symbol
                .clone()
                .unwrap_or_else(|| get_import_symbol_from_import(s));
            let i = self.ensure_reference(
                import.span,
                import.src.value.clone(),
                symbol,
                annotations.clone(),
            );
            let i = match i {
                Some(v) => v,
                None => continue,
            };

            let (local, orig_sym) = match s {
                ImportSpecifier::Named(ImportNamedSpecifier {
                    local, imported, ..
                }) => match imported {
                    Some(imported) => (local.to_id(), orig_name(imported)),
                    _ => (local.to_id(), local.sym.clone()),
                },
                ImportSpecifier::Default(s) => (s.local.to_id(), "default".into()),
                ImportSpecifier::Namespace(s) => {
                    self.data.namespace_imports.insert(s.local.to_id(), i);
                    continue;
                }
            };

            self.data.imports.insert(local, (i, orig_sym));
        }

        if import.specifiers.is_empty() {
            if let Some(internal_symbol) = internal_symbol {
                self.ensure_reference(
                    import.span,
                    import.src.value.clone(),
                    internal_symbol,
                    annotations,
                );
            }
        }
    }

    fn visit_export_all(&mut self, export: &ExportAll) {
        self.data.has_exports = true;

        let annotations = ImportAnnotations::parse(export.with.as_deref());

        self.ensure_reference(
            export.span,
            export.src.value.clone(),
            ImportedSymbol::ModuleEvaluation,
            annotations.clone(),
        );
        let symbol = parse_with(export.with.as_deref());

        let i = self.ensure_reference(
            export.span,
            export.src.value.clone(),
            symbol.unwrap_or(ImportedSymbol::Exports),
            annotations,
        );
        if let Some(i) = i {
            self.data.reexports.push((i, Reexport::Star));
        }
    }

    fn visit_named_export(&mut self, export: &NamedExport) {
        self.data.has_exports = true;

        let Some(ref src) = export.src else {
            return;
        };

        let annotations = ImportAnnotations::parse(export.with.as_deref());

        let internal_symbol = parse_with(export.with.as_deref());

        if internal_symbol.is_none() || export.specifiers.is_empty() {
            self.ensure_reference(
                export.span,
                src.value.clone(),
                ImportedSymbol::ModuleEvaluation,
                annotations.clone(),
            );
        }

        for spec in export.specifiers.iter() {
            let symbol = internal_symbol
                .clone()
                .unwrap_or_else(|| get_import_symbol_from_export(spec));

            let i =
                self.ensure_reference(export.span, src.value.clone(), symbol, annotations.clone());
            let i = match i {
                Some(v) => v,
                None => continue,
            };

            match spec {
                ExportSpecifier::Namespace(n) => {
                    self.data.reexports.push((
                        i,
                        Reexport::Namespace {
                            exported: to_word(&n.name),
                        },
                    ));
                }
                ExportSpecifier::Default(d) => {
                    self.data.reexports.push((
                        i,
                        Reexport::Named {
                            imported: js_word!("default"),
                            exported: d.exported.sym.clone(),
                        },
                    ));
                }
                ExportSpecifier::Named(n) => {
                    self.data.reexports.push((
                        i,
                        Reexport::Named {
                            imported: to_word(&n.orig),
                            exported: to_word(n.exported.as_ref().unwrap_or(&n.orig)),
                        },
                    ));
                }
            }
        }
    }

    fn visit_export_decl(&mut self, _: &ExportDecl) {
        self.data.has_exports = true;
    }
    fn visit_export_default_decl(&mut self, _: &ExportDefaultDecl) {
        self.data.has_exports = true;
    }
    fn visit_export_default_expr(&mut self, _: &ExportDefaultExpr) {
        self.data.has_exports = true;
    }
    fn visit_stmt(&mut self, _: &Stmt) {
        // don't visit children
    }

    fn visit_program(&mut self, m: &Program) {
        self.data.has_top_level_await = has_top_level_await(m).is_some();

        m.visit_children_with(self);
    }
}

pub(crate) fn orig_name(n: &ModuleExportName) -> JsWord {
    match n {
        ModuleExportName::Ident(v) => v.sym.clone(),
        ModuleExportName::Str(v) => v.value.clone(),
    }
}

fn parse_with(with: Option<&ObjectLit>) -> Option<ImportedSymbol> {
    find_turbopack_part_id_in_asserts(with?).map(|v| match v {
        PartId::Internal(index) => ImportedSymbol::Part(index),
        PartId::ModuleEvaluation => ImportedSymbol::ModuleEvaluation,
        PartId::Export(e) => ImportedSymbol::Symbol(e.as_str().into()),
        PartId::Exports => ImportedSymbol::Exports,
    })
}

fn get_import_symbol_from_import(specifier: &ImportSpecifier) -> ImportedSymbol {
    match specifier {
        ImportSpecifier::Named(ImportNamedSpecifier {
            local, imported, ..
        }) => ImportedSymbol::Symbol(match imported {
            Some(imported) => orig_name(imported),
            _ => local.sym.clone(),
        }),
        ImportSpecifier::Default(..) => ImportedSymbol::Symbol(js_word!("default")),
        ImportSpecifier::Namespace(..) => ImportedSymbol::Exports,
    }
}

fn get_import_symbol_from_export(specifier: &ExportSpecifier) -> ImportedSymbol {
    match specifier {
        ExportSpecifier::Named(ExportNamedSpecifier { orig, .. }) => {
            ImportedSymbol::Symbol(orig_name(orig))
        }
        ExportSpecifier::Default(..) => ImportedSymbol::Symbol(js_word!("default")),
        ExportSpecifier::Namespace(..) => ImportedSymbol::Exports,
    }
}
