use std::{collections::BTreeMap, fmt::Display};

use once_cell::sync::Lazy;
use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::{
    common::{comments::Comments, source_map::SmallPos, BytePos, Span, Spanned},
    ecma::{
        ast::*,
        atoms::{js_word, JsWord},
        visit::{Visit, VisitWith},
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc};
use turbopack_core::{issue::IssueSource, source::Source};

use super::{top_level_await::has_top_level_await, JsValue, ModuleValue};
use crate::{
    analyzer::{ConstantValue, ObjectPart},
    tree_shake::{find_turbopack_part_id_in_asserts, PartId},
    SpecifiedModuleType,
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Default, Debug, Clone, Hash)]
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

    pub fn parse_dynamic(with: &JsValue) -> Option<ImportAnnotations> {
        let mut map = BTreeMap::new();

        let JsValue::Object { parts, .. } = with else {
            return None;
        };

        for part in parts.iter() {
            let ObjectPart::KeyValue(key, value) = part else {
                continue;
            };
            let (
                JsValue::Constant(ConstantValue::Str(key)),
                JsValue::Constant(ConstantValue::Str(value)),
            ) = (key, value)
            else {
                continue;
            };

            map.insert(key.as_str().into(), value.as_str().into());
        }

        Some(ImportAnnotations { map })
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
    imports: FxIndexMap<Id, (usize, JsWord)>,

    /// Map from identifier to index in references
    namespace_imports: FxIndexMap<Id, usize>,

    /// List of (index in references, imported symbol, exported symbol)
    reexports: Vec<(usize, Reexport)>,

    /// Ordered list of imported symbols
    references: FxIndexSet<ImportMapReference>,

    /// True, when the module has imports
    has_imports: bool,

    /// True, when the module has exports
    has_exports: bool,

    /// True if the module is an ESM module due to top-level await.
    has_top_level_await: bool,

    /// Locations of [webpack-style "magic comments"][magic] that override import behaviors.
    ///
    /// Most commonly, these are `/* webpackIgnore: true */` comments. See [ImportAttributes] for
    /// full details.
    ///
    /// [magic]: https://webpack.js.org/api/module-methods/#magic-comments
    attributes: FxHashMap<BytePos, ImportAttributes>,

    /// The module specifiers of star imports that are accessed dynamically and should be imported
    /// as a whole.
    full_star_imports: FxHashSet<JsWord>,
}

/// Represents a collection of [webpack-style "magic comments"][magic] that override import
/// behaviors.
///
/// [magic]: https://webpack.js.org/api/module-methods/#magic-comments
#[derive(Debug)]
pub struct ImportAttributes {
    /// Should we ignore this import expression when bundling? If so, the import expression will be
    /// left as-is in Turbopack's output.
    ///
    /// This is set by using either a `webpackIgnore` or `turbopackIgnore` comment.
    ///
    /// Example:
    /// ```js
    /// const a = import(/* webpackIgnore: true */ "a");
    /// const b = import(/* turbopackIgnore: true */ "b");
    /// ```
    pub ignore: bool,
}

impl ImportAttributes {
    pub const fn empty() -> Self {
        ImportAttributes { ignore: false }
    }

    pub fn empty_ref() -> &'static Self {
        // use `Self::empty` here as `Default::default` isn't const
        static DEFAULT_VALUE: ImportAttributes = ImportAttributes::empty();
        &DEFAULT_VALUE
    }
}

impl Default for ImportAttributes {
    fn default() -> Self {
        ImportAttributes::empty()
    }
}

impl Default for &ImportAttributes {
    fn default() -> Self {
        ImportAttributes::empty_ref()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) enum ImportedSymbol {
    ModuleEvaluation,
    Symbol(JsWord),
    Exports,
    Part(u32),
    PartEvaluation(u32),
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ImportMapReference {
    pub module_path: JsWord,
    pub imported_symbol: ImportedSymbol,
    pub annotations: ImportAnnotations,
    pub issue_source: Option<IssueSource>,
}

impl ImportMap {
    pub fn is_esm(&self, specified_type: SpecifiedModuleType) -> bool {
        if self.has_exports {
            return true;
        }

        match specified_type {
            SpecifiedModuleType::Automatic => {
                self.has_exports || self.has_imports || self.has_top_level_await
            }
            SpecifiedModuleType::CommonJs => false,
            SpecifiedModuleType::EcmaScript => true,
        }
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

    pub fn get_attributes(&self, span: Span) -> &ImportAttributes {
        self.attributes.get(&span.lo).unwrap_or_default()
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

    pub fn references(&self) -> impl ExactSizeIterator<Item = &ImportMapReference> {
        self.references.iter()
    }

    pub fn reexports(&self) -> impl ExactSizeIterator<Item = (usize, &Reexport)> {
        self.reexports.iter().map(|(i, r)| (*i, r))
    }

    /// Analyze ES import
    pub(super) fn analyze(
        m: &Program,
        source: Option<ResolvedVc<Box<dyn Source>>>,
        comments: Option<&dyn Comments>,
    ) -> Self {
        let mut data = ImportMap::default();

        // We have to analyze imports first to determine if a star import is dynamic.
        // We can't do this in the visitor because import may (and likely) comes before usages, and
        // a method invoked after visitor will not work because we need to preserve the import
        // order.

        if let Program::Module(m) = m {
            let mut candidates = FxIndexMap::default();

            // Imports are hoisted to the top of the module.
            // So we have to collect all imports first.
            m.body.iter().for_each(|stmt| {
                if let ModuleItem::ModuleDecl(ModuleDecl::Import(import)) = stmt {
                    for s in &import.specifiers {
                        if let ImportSpecifier::Namespace(s) = s {
                            candidates.insert(s.local.to_id(), import.src.value.clone());
                        }
                    }
                }
            });

            let mut analyzer = StarImportAnalyzer {
                candidates,
                full_star_imports: &mut data.full_star_imports,
            };
            m.visit_with(&mut analyzer);
        }

        let mut analyzer = Analyzer {
            data: &mut data,
            source,
            comments,
        };
        m.visit_with(&mut analyzer);

        data
    }

    pub(crate) fn should_import_all(&self, esm_reference_index: usize) -> bool {
        let r = &self.references[esm_reference_index];

        self.full_star_imports.contains(&r.module_path)
    }
}

struct StarImportAnalyzer<'a> {
    /// The local identifiers of the star imports
    candidates: FxIndexMap<Id, JsWord>,
    full_star_imports: &'a mut FxHashSet<JsWord>,
}

impl Visit for StarImportAnalyzer<'_> {
    fn visit_expr(&mut self, node: &Expr) {
        if let Expr::Ident(i) = node {
            if let Some(module_path) = self.candidates.get(&i.to_id()) {
                self.full_star_imports.insert(module_path.clone());
                return;
            }
        }

        node.visit_children_with(self);
    }

    fn visit_import_decl(&mut self, _: &ImportDecl) {}

    fn visit_member_expr(&mut self, node: &MemberExpr) {
        match &node.prop {
            MemberProp::Ident(..) | MemberProp::PrivateName(..) => {
                if node.obj.is_ident() {
                    return;
                }
                // We can skip `visit_expr(obj)` because it's not a dynamic access
                node.obj.visit_children_with(self);
            }
            MemberProp::Computed(..) => {
                node.obj.visit_with(self);
                node.prop.visit_with(self);
            }
        }
    }

    fn visit_pat(&mut self, pat: &Pat) {
        if let Pat::Ident(i) = pat {
            if let Some(module_path) = self.candidates.get(&i.to_id()) {
                self.full_star_imports.insert(module_path.clone());
                return;
            }
        }

        pat.visit_children_with(self);
    }

    fn visit_simple_assign_target(&mut self, node: &SimpleAssignTarget) {
        if let SimpleAssignTarget::Ident(i) = node {
            if let Some(module_path) = self.candidates.get(&i.to_id()) {
                self.full_star_imports.insert(module_path.clone());
                return;
            }
        }

        node.visit_children_with(self);
    }
}

struct Analyzer<'a> {
    data: &'a mut ImportMap,
    source: Option<ResolvedVc<Box<dyn Source>>>,
    comments: Option<&'a dyn Comments>,
}

impl Analyzer<'_> {
    fn ensure_reference(
        &mut self,
        span: Span,
        module_path: JsWord,
        imported_symbol: ImportedSymbol,
        annotations: ImportAnnotations,
    ) -> Option<usize> {
        let issue_source = self
            .source
            .map(|s| IssueSource::from_swc_offsets(s, span.lo.to_u32(), span.hi.to_u32()));

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
        self.data.has_imports = true;

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

    fn visit_export_decl(&mut self, n: &ExportDecl) {
        self.data.has_exports = true;

        if self.comments.is_some() {
            // only visit children if we potentially need to mark import / requires
            n.visit_children_with(self);
        }
    }
    fn visit_export_default_decl(&mut self, n: &ExportDefaultDecl) {
        self.data.has_exports = true;

        if self.comments.is_some() {
            // only visit children if we potentially need to mark import / requires
            n.visit_children_with(self);
        }
    }
    fn visit_export_default_expr(&mut self, n: &ExportDefaultExpr) {
        self.data.has_exports = true;

        if self.comments.is_some() {
            // only visit children if we potentially need to mark import / requires
            n.visit_children_with(self);
        }
    }

    fn visit_program(&mut self, m: &Program) {
        self.data.has_top_level_await = has_top_level_await(m).is_some();

        m.visit_children_with(self);
    }

    fn visit_stmt(&mut self, n: &Stmt) {
        if self.comments.is_some() {
            // only visit children if we potentially need to mark import / requires
            n.visit_children_with(self);
        }
    }

    /// check if import or require contains an ignore comment
    ///
    /// We are checking for the following cases:
    /// - import(/* webpackIgnore: true */ "a")
    /// - require(/* webpackIgnore: true */ "a")
    ///
    /// We can do this by checking if any of the comment spans are between the
    /// callee and the first argument.
    //
    // potentially support more webpack magic comments in the future:
    // https://webpack.js.org/api/module-methods/#magic-comments
    fn visit_call_expr(&mut self, n: &CallExpr) {
        // we could actually unwrap thanks to the optimisation above but it can't hurt to be safe...
        if let Some(comments) = self.comments {
            let callee_span = match &n.callee {
                Callee::Import(Import { span, .. }) => Some(span),
                Callee::Expr(box Expr::Ident(Ident { span, sym, .. })) if sym == "require" => {
                    Some(span)
                }
                _ => None,
            };

            // we are interested here in the last comment with a valid directive
            let ignore_directive = parse_ignore_directive(comments, n.args.first());

            if let Some((callee_span, ignore_directive)) = callee_span.zip(ignore_directive) {
                self.data.attributes.insert(
                    callee_span.lo,
                    ImportAttributes {
                        ignore: ignore_directive,
                    },
                );
            };
        }

        n.visit_children_with(self);
    }

    fn visit_new_expr(&mut self, n: &NewExpr) {
        // we could actually unwrap thanks to the optimisation above but it can't hurt to be safe...
        if let Some(comments) = self.comments {
            let callee_span = match &n.callee {
                box Expr::Ident(Ident { sym, .. }) if sym == "Worker" => Some(n.span),
                _ => None,
            };

            let ignore_directive = parse_ignore_directive(comments, n.args.iter().flatten().next());

            if let Some((callee_span, ignore_directive)) = callee_span.zip(ignore_directive) {
                self.data.attributes.insert(
                    callee_span.lo,
                    ImportAttributes {
                        ignore: ignore_directive,
                    },
                );
            };
        }

        n.visit_children_with(self);
    }
}

fn parse_ignore_directive(comments: &dyn Comments, value: Option<&ExprOrSpread>) -> Option<bool> {
    // we are interested here in the last comment with a valid directive
    value
        .map(|arg| arg.span_lo())
        .and_then(|comment_pos| comments.get_leading(comment_pos))
        .iter()
        .flatten()
        .rev()
        .filter_map(|comment| {
            let (directive, value) = comment.text.trim().split_once(':')?;
            // support whitespace between the colon
            match (directive.trim(), value.trim()) {
                ("webpackIgnore" | "turbopackIgnore", "true") => Some(true),
                ("webpackIgnore" | "turbopackIgnore", "false") => Some(false),
                _ => None, // ignore anything else
            }
        })
        .next()
}

pub(crate) fn orig_name(n: &ModuleExportName) -> JsWord {
    match n {
        ModuleExportName::Ident(v) => v.sym.clone(),
        ModuleExportName::Str(v) => v.value.clone(),
    }
}

fn parse_with(with: Option<&ObjectLit>) -> Option<ImportedSymbol> {
    find_turbopack_part_id_in_asserts(with?).map(|v| match v {
        PartId::Internal(index, true) => ImportedSymbol::PartEvaluation(index),
        PartId::Internal(index, false) => ImportedSymbol::Part(index),
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
