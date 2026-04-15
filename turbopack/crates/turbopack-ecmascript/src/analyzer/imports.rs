use std::{borrow::Cow, collections::BTreeMap, fmt::Display, sync::Arc};

use anyhow::{Context, Result};
use once_cell::sync::Lazy;
use rustc_hash::{FxHashMap, FxHashSet};
use smallvec::SmallVec;
use swc_core::{
    atoms::Wtf8Atom,
    common::{BytePos, Span, Spanned, SyntaxContext, comments::Comments, source_map::SmallPos},
    ecma::{
        ast::*,
        atoms::{Atom, atom},
        utils::{IsDirective, find_pat_ids},
        visit::{Visit, VisitWith},
    },
};
use turbo_frozenmap::FrozenMap;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc};
use turbopack_core::{issue::IssueSource, loader::WebpackLoaderItem, source::Source};

use super::{JsValue, ModuleValue, top_level_await::has_top_level_await};
use crate::{
    SpecifiedModuleType,
    analyzer::{ConstantValue, ObjectPart, graph::VarGraph},
    magic_identifier,
    references::{
        esm::{EsmAssetReference, EsmExport, Liveness},
        util::{SpecifiedChunkingType, parse_chunking_type_annotation},
    },
    tree_shake::{PartId, find_turbopack_part_id_in_asserts},
};

#[turbo_tasks::value]
#[derive(Default, Debug, Clone, Hash)]
pub struct ImportAnnotations {
    // TODO store this in more structured way
    #[turbo_tasks(trace_ignore)]
    #[bincode(with_serde)]
    map: BTreeMap<Wtf8Atom, Wtf8Atom>,
    /// Parsed turbopack loader configuration from import attributes.
    /// e.g. `import "file" with { turbopackLoader: "raw-loader" }`
    #[turbo_tasks(trace_ignore)]
    #[bincode(with_serde)]
    turbopack_loader: Option<WebpackLoaderItem>,
    turbopack_rename_as: Option<RcStr>,
    turbopack_module_type: Option<RcStr>,
    chunking_type: Option<SpecifiedChunkingType>,
}

/// Enables a specified transition for the annotated import
static ANNOTATION_TRANSITION: Lazy<Wtf8Atom> =
    Lazy::new(|| crate::annotations::ANNOTATION_TRANSITION.into());

/// Changes the type of the resolved module (only "json" is supported currently)
static ATTRIBUTE_MODULE_TYPE: Lazy<Wtf8Atom> = Lazy::new(|| atom!("type").into());

impl ImportAnnotations {
    pub fn parse(with: Option<&ObjectLit>) -> Option<ImportAnnotations> {
        let with = with?;

        let mut map = BTreeMap::new();
        let mut turbopack_loader_name: Option<RcStr> = None;
        let mut turbopack_loader_options: serde_json::Map<String, serde_json::Value> =
            serde_json::Map::new();
        let mut turbopack_rename_as: Option<RcStr> = None;
        let mut turbopack_module_type: Option<RcStr> = None;
        let mut chunking_type: Option<SpecifiedChunkingType> = None;

        for prop in &with.props {
            let Some(kv) = prop.as_prop().and_then(|p| p.as_key_value()) else {
                continue;
            };

            let key_str = match &kv.key {
                PropName::Ident(ident) => Cow::Borrowed(ident.sym.as_str()),
                PropName::Str(str) => str.value.to_string_lossy(),
                _ => continue,
            };

            // All turbopack* keys are extracted as string values (per TC39 import attributes spec)
            match &*key_str {
                "turbopackLoader" => {
                    if let Some(Lit::Str(s)) = kv.value.as_lit() {
                        turbopack_loader_name =
                            Some(RcStr::from(s.value.to_string_lossy().into_owned()));
                    }
                }
                "turbopackLoaderOptions" => {
                    if let Some(Lit::Str(s)) = kv.value.as_lit() {
                        let json_str = s.value.to_string_lossy();
                        if let Ok(serde_json::Value::Object(map)) = serde_json::from_str(&json_str)
                        {
                            turbopack_loader_options = map;
                        }
                    }
                }
                "turbopackAs" => {
                    if let Some(Lit::Str(s)) = kv.value.as_lit() {
                        turbopack_rename_as =
                            Some(RcStr::from(s.value.to_string_lossy().into_owned()));
                    }
                }
                "turbopackModuleType" => {
                    if let Some(Lit::Str(s)) = kv.value.as_lit() {
                        turbopack_module_type =
                            Some(RcStr::from(s.value.to_string_lossy().into_owned()));
                    }
                }
                "turbopack-chunking-type" => {
                    if let Some(Lit::Str(s)) = kv.value.as_lit() {
                        chunking_type = parse_chunking_type_annotation(
                            kv.value.span(),
                            &s.value.to_string_lossy(),
                        );
                    }
                }
                _ => {
                    // For all other keys, only accept string values (per spec)
                    if let Some(Lit::Str(str)) = kv.value.as_lit() {
                        let key: Wtf8Atom = match &kv.key {
                            PropName::Ident(ident) => ident.sym.clone().into(),
                            PropName::Str(s) => s.value.clone(),
                            _ => continue,
                        };
                        map.insert(key, str.value.clone());
                    }
                }
            }
        }

        let turbopack_loader = turbopack_loader_name.map(|name| WebpackLoaderItem {
            loader: name,
            options: turbopack_loader_options,
        });

        if !map.is_empty()
            || turbopack_loader.is_some()
            || turbopack_rename_as.is_some()
            || turbopack_module_type.is_some()
            || chunking_type.is_some()
        {
            Some(ImportAnnotations {
                map,
                turbopack_loader,
                turbopack_rename_as,
                turbopack_module_type,
                chunking_type,
            })
        } else {
            None
        }
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

            map.insert(
                key.as_atom().into_owned().into(),
                value.as_atom().into_owned().into(),
            );
        }

        if !map.is_empty() {
            Some(ImportAnnotations {
                map,
                turbopack_loader: None,
                turbopack_rename_as: None,
                turbopack_module_type: None,
                chunking_type: None,
            })
        } else {
            None
        }
    }

    /// Returns the content on the transition annotation
    pub fn transition(&self) -> Option<Cow<'_, str>> {
        self.get(&ANNOTATION_TRANSITION)
            .map(|v| v.to_string_lossy())
    }

    /// Returns the content on the chunking-type annotation
    pub fn chunking_type(&self) -> Option<SpecifiedChunkingType> {
        self.chunking_type
    }

    /// Returns the content on the type attribute
    pub fn module_type(&self) -> Option<&Wtf8Atom> {
        self.get(&ATTRIBUTE_MODULE_TYPE)
    }

    /// Returns the turbopackLoader item, if present
    pub fn turbopack_loader(&self) -> Option<&WebpackLoaderItem> {
        self.turbopack_loader.as_ref()
    }

    /// Returns the turbopackAs rename configuration, if present
    pub fn turbopack_rename_as(&self) -> Option<&RcStr> {
        self.turbopack_rename_as.as_ref()
    }

    /// Returns the turbopackModuleType override, if present
    pub fn turbopack_module_type(&self) -> Option<&RcStr> {
        self.turbopack_module_type.as_ref()
    }

    /// Returns true if a turbopack loader is configured
    pub fn has_turbopack_loader(&self) -> bool {
        self.turbopack_loader.is_some()
    }

    pub fn get(&self, key: &Wtf8Atom) -> Option<&Wtf8Atom> {
        self.map.get(key)
    }
}

impl Display for ImportAnnotations {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut it = self.map.iter();
        if let Some((k, v)) = it.next() {
            write!(f, "{{ {}: {}", k.to_string_lossy(), v.to_string_lossy())?
        } else {
            return f.write_str("{}");
        };
        for (k, v) in it {
            write!(f, ", {}: {}", k.to_string_lossy(), v.to_string_lossy())?
        }
        f.write_str(" }")
    }
}

/// A version of [crate::references::esm::export::EsmExport] with usize instead of the module
/// reference Vc, and missing the liveness fields.
#[derive(Debug)]
pub enum Export {
    /// A local binding that is exported (export { a } or export const a = 1)
    ///
    /// Fields: (local_name, is_fake_esm)
    LocalBinding(RcStr, bool),
    /// An imported binding that is exported (export { a as b } from "...")
    ///
    /// Fields: (module_reference, name, is_fake_esm)
    ImportedBinding(usize, RcStr, bool),
    /// An imported namespace that is exported (export * from "...")
    ImportedNamespace(usize),
    /// An error occurred while resolving the export
    Error,
}

/// The storage for all kinds of imports.
///
/// Note that when it's initialized by calling `analyze`, it only contains ESM
/// import/exports.
#[derive(Default, Debug)]
pub(crate) struct ImportMap {
    /// Map from identifier to (index in references, exported symbol)
    imports: FxIndexMap<Id, (usize, Atom)>,

    /// Map from identifier to index in references
    namespace_imports: FxIndexMap<Id, usize>,

    /// Map from exported name to the export
    exports: BTreeMap<RcStr, Export>,

    /// List of namespace re-exports
    reexport_namespaces: Vec<usize>,

    /// Ordered list of imported symbols
    references: FxIndexSet<ImportMapReference>,

    /// True, when the module has an import declaration. imports.is_empty() is not sufficient
    /// because of side-effect only imports without imported bindings.
    has_imports: bool,

    /// True, when the module has an export declaration. exports.is_empty() is not sufficient
    /// because of `export {}`
    has_exports: bool,

    /// True if the module is an ESM module due to top-level await.
    has_top_level_await: bool,

    /// True if the module has "use strict"
    pub(crate) strict: bool,

    /// Locations of [webpack-style "magic comments"][magic] that override import behaviors.
    ///
    /// Most commonly, these are `/* webpackIgnore: true */` comments. See [ImportAttributes] for
    /// full details.
    ///
    /// [magic]: https://webpack.js.org/api/module-methods/#magic-comments
    attributes: FxHashMap<BytePos, ImportAttributes>,

    /// The module specifiers of star imports that are accessed dynamically and should be imported
    /// as a whole.
    full_star_imports: FxHashSet<Wtf8Atom>,

    /// Map from exported name to local binding id (includes the syntax context).
    pub(crate) exports_ids: FxHashMap<RcStr, Id>,
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
    /// Should resolution errors be suppressed? If so, resolution errors will be completely
    /// ignored (no error or warning emitted at build time).
    ///
    /// This is set by using a `turbopackOptional` comment.
    ///
    /// Example:
    /// ```js
    /// const a = import(/* turbopackOptional: true */ "a");
    /// ```
    pub optional: bool,
    /// Which exports are used from a dynamic import. When set, enables tree-shaking for the
    /// dynamically imported module by only including the specified exports.
    ///
    /// This is set by using either a `webpackExports` or `turbopackExports` comment.
    /// `None` means no directive was found (all exports assumed used).
    /// `Some([])` means empty list (only side effects).
    /// `Some([name, ...])` means specific named exports are used.
    ///
    /// Example:
    /// ```js
    /// const { a } = await import(/* webpackExports: ["a"] */ "module");
    /// const { b } = await import(/* turbopackExports: "b" */ "module");
    /// ```
    pub export_names: Option<SmallVec<[RcStr; 1]>>,
    /// Whether to use a specific chunking type for this import.
    //
    /// This is set by using a or `turbopackChunkingType` comment.
    ///
    /// Example:
    /// ```js
    /// const a = require(/* turbopackChunkingType: parallel */ "a");
    /// ```
    pub chunking_type: Option<SpecifiedChunkingType>,
}

impl ImportAttributes {
    pub const fn empty() -> Self {
        ImportAttributes {
            ignore: false,
            optional: false,
            export_names: None,
            chunking_type: None,
        }
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
    Symbol(Atom),
    Exports,
    Part(u32),
    PartEvaluation(u32),
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ImportMapReference {
    pub module_path: Wtf8Atom,
    pub imported_symbol: ImportedSymbol,
    pub annotations: Option<Arc<ImportAnnotations>>,
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

    pub fn reexports_reference_idxs(&self) -> impl Iterator<Item = usize> {
        self.exports
            .values()
            .filter_map(|value| match value {
                Export::ImportedBinding(i, ..) | Export::ImportedNamespace(i) => Some(*i),
                Export::LocalBinding(..) | Export::Error => None,
            })
            .chain(self.reexport_namespaces.iter().copied())
    }

    pub fn as_esm_exports(
        &self,
        import_references: &[ResolvedVc<EsmAssetReference>],
        var_graph: &VarGraph,
    ) -> Result<FrozenMap<RcStr, EsmExport>> {
        Ok(FrozenMap::from(
            self.exports
                .iter()
                .map(|(name, value)| {
                    let value = match value {
                        Export::LocalBinding(local, is_fake_esm) => EsmExport::LocalBinding(
                            local.clone(),
                            if *is_fake_esm {
                                // it is likely that these are not always actually mutable.
                                Liveness::Mutable
                            } else {
                                var_graph.get_export_ident_liveness(
                                    self.exports_ids.get(name).cloned().with_context(|| {
                                        format!("Exported binding {name} not found in exports_ids")
                                    })?,
                                )
                            },
                        ),
                        Export::ImportedBinding(i, name, is_fake_esm) => {
                            EsmExport::ImportedBinding(
                                ResolvedVc::upcast(import_references[*i]),
                                name.clone(),
                                *is_fake_esm,
                            )
                        }
                        Export::ImportedNamespace(i) => {
                            EsmExport::ImportedNamespace(ResolvedVc::upcast(import_references[*i]))
                        }
                        Export::Error => EsmExport::Error,
                    };
                    Ok((name.clone(), value))
                })
                .collect::<Result<Vec<_>>>()?,
        ))
    }

    pub fn reexport_namespaces(&self) -> impl ExactSizeIterator<Item = usize> {
        self.reexport_namespaces.iter().copied()
    }

    /// Analyze ES import
    pub(super) fn analyze(
        m: &Program,
        source: Option<ResolvedVc<Box<dyn Source>>>,
        comments: Option<&dyn Comments>,
    ) -> Self {
        let mut data = ImportMap::default();
        let mut analyzer = Analyzer {
            data: &mut data,
            source,
            comments,
            namespace_imports_to_specifier: FxIndexMap::default(),
        };

        // A prepass to detect imports to be able to rewrite import+export pairs to true reexports
        if let Program::Module(m) = m {
            for stmt in &m.body {
                match stmt {
                    ModuleItem::ModuleDecl(ModuleDecl::Import(import)) => {
                        if import.type_only {
                            continue;
                        }
                        analyzer.data.has_imports = true;
                        let annotations = ImportAnnotations::parse(import.with.as_deref());
                        let internal_symbol = parse_with(import.with.as_deref());
                        if internal_symbol.is_none() {
                            analyzer.ensure_reference(
                                import.span,
                                import.src.value.clone(),
                                ImportedSymbol::ModuleEvaluation,
                                annotations.clone(),
                            );
                        }

                        for s in &import.specifiers {
                            if s.is_type_only() {
                                continue;
                            }
                            let symbol = internal_symbol
                                .clone()
                                .unwrap_or_else(|| get_import_symbol_from_import(s));
                            let i = analyzer.ensure_reference(
                                import.span,
                                import.src.value.clone(),
                                symbol,
                                annotations.clone(),
                            );

                            let (local, orig_sym) = match s {
                                ImportSpecifier::Namespace(s) => {
                                    analyzer
                                        .namespace_imports_to_specifier
                                        .insert(s.local.to_id(), import.src.value.clone());
                                    analyzer.data.namespace_imports.insert(s.local.to_id(), i);
                                    continue;
                                }
                                ImportSpecifier::Default(s) => (s.local.to_id(), atom!("default")),
                                ImportSpecifier::Named(s) => match &s.imported {
                                    Some(imported) => {
                                        (s.local.to_id(), imported.atom().into_owned())
                                    }
                                    _ => (s.local.to_id(), s.local.sym.clone()),
                                },
                            };
                            analyzer.data.imports.insert(local, (i, orig_sym));
                        }
                        if import.specifiers.is_empty()
                            && let Some(internal_symbol) = internal_symbol
                        {
                            analyzer.ensure_reference(
                                import.span,
                                import.src.value.clone(),
                                internal_symbol,
                                annotations,
                            );
                        }
                    }
                    // We need to call ensure_reference in this loop to ensure that the reference
                    // order of all hoisted imports (be it import or reexport) is correct.
                    ModuleItem::ModuleDecl(ModuleDecl::ExportAll(export)) => {
                        if export.type_only {
                            continue;
                        }
                        let annotations = ImportAnnotations::parse(export.with.as_deref());
                        analyzer.ensure_reference(
                            export.span,
                            export.src.value.clone(),
                            ImportedSymbol::ModuleEvaluation,
                            annotations.clone(),
                        );
                    }
                    ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(export)) => {
                        if export.type_only {
                            continue;
                        }
                        if let Some(ref src) = export.src {
                            let annotations = ImportAnnotations::parse(export.with.as_deref());
                            let internal_symbol = parse_with(export.with.as_deref());
                            if internal_symbol.is_none() || export.specifiers.is_empty() {
                                analyzer.ensure_reference(
                                    export.span,
                                    src.value.clone(),
                                    ImportedSymbol::ModuleEvaluation,
                                    annotations.clone(),
                                );
                            }
                        }
                    }
                    _ => (),
                }
            }
        }

        m.visit_with(&mut analyzer);

        data
    }

    pub(crate) fn should_import_all(&self, esm_reference_index: usize) -> bool {
        let r = &self.references[esm_reference_index];

        self.full_star_imports.contains(&r.module_path)
    }
}

struct Analyzer<'a> {
    data: &'a mut ImportMap,
    source: Option<ResolvedVc<Box<dyn Source>>>,
    comments: Option<&'a dyn Comments>,
    /// Map from local identifier of namespace imports to module path, used temporarily during
    /// analysis to detect dynamic accesses to namespace imports.
    namespace_imports_to_specifier: FxIndexMap<Id, Wtf8Atom>,
}

impl Analyzer<'_> {
    fn ensure_reference(
        &mut self,
        span: Span,
        module_path: Wtf8Atom,
        imported_symbol: ImportedSymbol,
        annotations: Option<ImportAnnotations>,
    ) -> usize {
        let issue_source = self
            .source
            .map(|s| IssueSource::from_swc_offsets(s, span.lo.to_u32(), span.hi.to_u32()));

        let r = ImportMapReference {
            module_path,
            imported_symbol,
            issue_source,
            annotations: annotations.map(Arc::new),
        };
        if let Some(i) = self.data.references.get_index_of(&r) {
            i
        } else {
            let i = self.data.references.len();
            self.data.references.insert(r);
            i
        }
    }
}

impl Visit for Analyzer<'_> {
    fn visit_export_all(&mut self, export: &ExportAll) {
        if export.type_only {
            return;
        }

        let annotations = ImportAnnotations::parse(export.with.as_deref());

        let symbol = parse_with(export.with.as_deref());
        let i = self.ensure_reference(
            export.span,
            export.src.value.clone(),
            symbol.unwrap_or(ImportedSymbol::Exports),
            annotations,
        );
        self.data.reexport_namespaces.push(i);
        self.data.has_exports = true;
    }

    fn visit_named_export(&mut self, export: &NamedExport) {
        if export.type_only {
            return;
        }

        self.data.has_exports = true;

        if let Some(ref src) = export.src {
            let annotations = ImportAnnotations::parse(export.with.as_deref());
            let internal_symbol = parse_with(export.with.as_deref());

            for spec in export.specifiers.iter() {
                let symbol = internal_symbol
                    .clone()
                    .unwrap_or_else(|| get_import_symbol_from_export(spec));

                let i = self.ensure_reference(
                    export.span,
                    src.value.clone(),
                    symbol,
                    annotations.clone(),
                );

                match spec {
                    ExportSpecifier::Namespace(n) => {
                        self.data.exports.insert(
                            RcStr::from(n.name.atom().as_str()),
                            Export::ImportedNamespace(i),
                        );
                    }
                    ExportSpecifier::Default(d) => {
                        self.data.exports.insert(
                            RcStr::from(d.exported.sym.as_str()),
                            Export::ImportedBinding(i, rcstr!("default"), false),
                        );
                    }
                    ExportSpecifier::Named(n) => {
                        self.data.exports.insert(
                            RcStr::from(n.exported.as_ref().unwrap_or(&n.orig).atom().as_str()),
                            Export::ImportedBinding(i, RcStr::from(n.orig.atom().as_str()), false),
                        );
                    }
                }
            }
        } else {
            for spec in export.specifiers.iter() {
                match spec {
                    ExportSpecifier::Namespace(_) => {
                        unreachable!(
                            "ExportNamespaceSpecifier will not happen in combination with src == \
                             None"
                        );
                    }
                    ExportSpecifier::Default(_) => {
                        unreachable!(
                            "ExportDefaultSpecifier will not happen in combination with src == \
                             None"
                        );
                    }
                    ExportSpecifier::Named(ExportNamedSpecifier {
                        orig,
                        exported,
                        is_type_only,
                        ..
                    }) => {
                        if *is_type_only {
                            continue;
                        }

                        // We create mutable exports for fake ESMs generated by module splitting
                        let is_fake_esm = export
                            .with
                            .as_deref()
                            .map(find_turbopack_part_id_in_asserts)
                            .is_some();
                        let export = {
                            let imported_binding = if let ModuleExportName::Ident(ident) = orig {
                                self.data.get_binding(&ident.to_id())
                            } else {
                                None
                            };
                            if let Some((index, export)) = imported_binding {
                                // This is a export of an imported binding. Rewrite to a true
                                // reexport.
                                if let Some(export) = export {
                                    Export::ImportedBinding(index, export, is_fake_esm)
                                } else {
                                    Export::ImportedNamespace(index)
                                }
                            } else {
                                Export::LocalBinding(RcStr::from(orig.atom().as_str()), is_fake_esm)
                            }
                        };
                        self.data.exports.insert(
                            RcStr::from(exported.as_ref().unwrap_or(orig).atom().as_str()),
                            export,
                        );
                    }
                }
            }
            export.visit_children_with(self);
        }
    }

    fn visit_export_decl(&mut self, n: &ExportDecl) {
        n.visit_children_with(self);
        self.data.has_exports = true;

        match &n.decl {
            Decl::Class(n) => {
                let name = RcStr::from(n.ident.sym.as_str());
                self.data
                    .exports
                    .insert(name.clone(), Export::LocalBinding(name.clone(), false));
                self.data.exports_ids.insert(name, n.ident.to_id());
            }
            Decl::Fn(n) => {
                let name = RcStr::from(n.ident.sym.as_str());
                self.data
                    .exports
                    .insert(name.clone(), Export::LocalBinding(name.clone(), false));
                self.data.exports_ids.insert(name, n.ident.to_id());
            }
            Decl::Var(..) => {
                let ids: Vec<Id> = find_pat_ids(&n.decl);
                for id in ids {
                    let name = RcStr::from(id.0.as_str());
                    self.data
                        .exports
                        .insert(name.clone(), Export::LocalBinding(name.clone(), false));
                    self.data.exports_ids.insert(name, id);
                }
            }
            Decl::Using(_) => {
                // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export#:~:text=You%20cannot%20use%20export%20on%20a%20using%20or%20await%20using%20declaration
                unreachable!("using declarations can not be exported");
            }
            Decl::TsInterface(_) | Decl::TsTypeAlias(_) | Decl::TsEnum(_) | Decl::TsModule(_) => {
                // ignore typescript for code generation
            }
        }
    }

    fn visit_export_default_decl(&mut self, n: &ExportDefaultDecl) {
        n.visit_children_with(self);
        self.data.has_exports = true;

        let id = match &n.decl {
            DefaultDecl::Class(ClassExpr { ident, .. }) | DefaultDecl::Fn(FnExpr { ident, .. }) => {
                // Mirror what `EsmModuleItem::code_generation` does, these are live bindings if the
                // class/function has an identifier.
                ident.as_ref().map_or_else(
                    || {
                        (
                            magic_identifier::mangle("default export").into(),
                            SyntaxContext::empty(),
                        )
                    },
                    |ident| ident.to_id(),
                )
            }
            DefaultDecl::TsInterfaceDecl(_) => {
                // not matching, might happen due to eventual consistency
                (
                    magic_identifier::mangle("default export").into(),
                    SyntaxContext::empty(),
                )
            }
        };

        self.data.exports.insert(
            rcstr!("default"),
            Export::LocalBinding(RcStr::from(id.0.as_str()), false),
        );
        self.data.exports_ids.insert(rcstr!("default"), id);
    }

    fn visit_export_default_expr(&mut self, n: &ExportDefaultExpr) {
        n.visit_children_with(self);
        self.data.has_exports = true;

        self.data.exports.insert(
            rcstr!("default"),
            Export::LocalBinding(magic_identifier::mangle("default export").into(), false),
        );
        self.data.exports_ids.insert(
            rcstr!("default"),
            (
                // `EsmModuleItem::code_generation` inserts this variable.
                magic_identifier::mangle("default export").into(),
                SyntaxContext::empty(),
            ),
        );
    }

    fn visit_export_named_specifier(&mut self, n: &ExportNamedSpecifier) {
        if let ModuleExportName::Ident(local) = &n.orig {
            let exported = n.exported.as_ref().unwrap_or(&n.orig);
            self.data
                .exports_ids
                .insert(exported.atom().as_str().into(), local.to_id());
        }
    }

    fn visit_export_default_specifier(&mut self, n: &ExportDefaultSpecifier) {
        self.data
            .exports_ids
            .insert(rcstr!("default"), n.exported.to_id());
    }

    fn visit_program(&mut self, m: &Program) {
        self.data.has_top_level_await = has_top_level_await(m).is_some();
        self.data.strict = match m {
            Program::Module(module) => module
                .body
                .iter()
                .take_while(|s| s.directive_continue())
                .any(IsDirective::is_use_strict),
            Program::Script(script) => script
                .body
                .iter()
                .take_while(|s| s.directive_continue())
                .any(IsDirective::is_use_strict),
        };

        m.visit_children_with(self);
    }

    /// check if import or require contains magic comments
    ///
    /// We are checking for the following cases:
    /// - import(/* webpackIgnore: true */ "a")
    /// - require(/* webpackIgnore: true */ "a")
    /// - import(/* turbopackOptional: true */ "a")
    /// - require(/* turbopackOptional: true */ "a")
    ///
    /// We can do this by checking if any of the comment spans are between the
    /// callee and the first argument.
    //
    // potentially support more webpack magic comments in the future:
    // https://webpack.js.org/api/module-methods/#magic-comments
    fn visit_call_expr(&mut self, n: &CallExpr) {
        if let Some(comments) = self.comments {
            let callee_span = match &n.callee {
                Callee::Import(Import { span, .. }) => Some(*span),
                Callee::Expr(e) => Some(e.span()),
                _ => None,
            };

            if let Some(callee_span) = callee_span
                && let Some(attributes) = parse_directives(comments, n.args.first())
            {
                self.data.attributes.insert(callee_span.lo, attributes);
            }
        }

        n.visit_children_with(self);
    }

    fn visit_new_expr(&mut self, n: &NewExpr) {
        if let Some(comments) = self.comments {
            let callee_span = match &*n.callee {
                Expr::Ident(Ident { sym, .. }) if sym == "Worker" => Some(n.span),
                _ => None,
            };

            if let Some(callee_span) = callee_span
                && let Some(attributes) = parse_directives(comments, n.args.iter().flatten().next())
            {
                self.data.attributes.insert(callee_span.lo, attributes);
            }
        }

        n.visit_children_with(self);
    }

    fn visit_member_expr(&mut self, node: &MemberExpr) {
        if let MemberProp::Ident(..) | MemberProp::PrivateName(..) = &node.prop
            && node.obj.is_ident()
        {
            // Skip if obj is a Expr::Ident, so that it doesn't get added to full_star_imports below
            // in visit_expr.
            return;
        }
        node.visit_children_with(self);
    }

    fn visit_pat(&mut self, pat: &Pat) {
        if let Pat::Ident(i) = pat
            && let Some(module_path) = self.namespace_imports_to_specifier.get(&i.to_id())
        {
            self.data.full_star_imports.insert(module_path.clone());
        }

        pat.visit_children_with(self);
    }

    fn visit_simple_assign_target(&mut self, node: &SimpleAssignTarget) {
        if let SimpleAssignTarget::Ident(i) = node
            && let Some(module_path) = self.namespace_imports_to_specifier.get(&i.to_id())
        {
            self.data.full_star_imports.insert(module_path.clone());
        }

        node.visit_children_with(self);
    }

    fn visit_expr(&mut self, node: &Expr) {
        if let Expr::Ident(i) = node
            && let Some(module_path) = self.namespace_imports_to_specifier.get(&i.to_id())
        {
            self.data.full_star_imports.insert(module_path.clone());
        }

        node.visit_children_with(self);
    }
}

/// Parse magic comment directives from the leading comments of a call argument.
/// Returns (ignore, optional) directives if any are found.
fn parse_directives(
    comments: &dyn Comments,
    value: Option<&ExprOrSpread>,
) -> Option<ImportAttributes> {
    let value = value?;
    let leading_comments = comments.get_leading(value.span_lo())?;

    let mut ignore = None;
    let mut optional = None;
    let mut export_names = None;
    let mut chunking_type = None;

    // Process all comments, last one wins for each directive type
    for comment in leading_comments.iter() {
        if let Some((directive, val)) = comment.text.trim().split_once(':') {
            let val = val.trim();
            match directive.trim() {
                "webpackIgnore" | "turbopackIgnore" => match val {
                    "true" => ignore = Some(true),
                    "false" => ignore = Some(false),
                    _ => {}
                },
                "turbopackOptional" => match val {
                    "true" => optional = Some(true),
                    "false" => optional = Some(false),
                    _ => {}
                },
                "webpackExports" | "turbopackExports" => {
                    export_names = Some(parse_export_names(val));
                }
                "turbopackChunkingType" => {
                    chunking_type = parse_chunking_type_annotation(value.span(), val);
                }
                _ => {} // ignore anything else
            }
        }
    }

    // Return Some only if at least one directive was found
    if ignore.is_some() || optional.is_some() || export_names.is_some() || chunking_type.is_some() {
        Some(ImportAttributes {
            ignore: ignore.unwrap_or(false),
            optional: optional.unwrap_or(false),
            export_names,
            chunking_type,
        })
    } else {
        None
    }
}

/// Parse export names from a `webpackExports` or `turbopackExports` comment value.
///
/// Supports two formats:
/// - Single string: `"name"` → `["name"]`
/// - JSON array: `["name1", "name2"]` → `["name1", "name2"]`
fn parse_export_names(val: &str) -> SmallVec<[RcStr; 1]> {
    let val = val.trim();

    // Try parsing as JSON array of strings
    if let Ok(names) = serde_json::from_str::<Vec<String>>(val) {
        return names.into_iter().map(|s| s.into()).collect();
    }

    // Try parsing as a single JSON string
    if let Ok(name) = serde_json::from_str::<String>(val) {
        return SmallVec::from_buf([name.into()]);
    }

    // Bare identifier (no quotes)
    if !val.is_empty() {
        return SmallVec::from_buf([val.into()]);
    }

    SmallVec::new()
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
            Some(imported) => imported.atom().into_owned(),
            _ => local.sym.clone(),
        }),
        ImportSpecifier::Default(..) => ImportedSymbol::Symbol(atom!("default")),
        ImportSpecifier::Namespace(..) => ImportedSymbol::Exports,
    }
}

fn get_import_symbol_from_export(specifier: &ExportSpecifier) -> ImportedSymbol {
    match specifier {
        ExportSpecifier::Named(ExportNamedSpecifier { orig, .. }) => {
            ImportedSymbol::Symbol(orig.atom().into_owned())
        }
        ExportSpecifier::Default(..) => ImportedSymbol::Symbol(atom!("default")),
        ExportSpecifier::Namespace(..) => ImportedSymbol::Exports,
    }
}

#[cfg(test)]
mod tests {
    use swc_core::{atoms::Atom, common::DUMMY_SP, ecma::ast::*};

    use super::*;

    /// Helper to create a string literal expression
    fn str_lit(s: &str) -> Box<Expr> {
        Box::new(Expr::Lit(Lit::Str(Str {
            span: DUMMY_SP,
            value: Atom::from(s).into(),
            raw: None,
        })))
    }

    /// Helper to create an ident property name
    fn ident_key(s: &str) -> PropName {
        PropName::Ident(IdentName {
            span: DUMMY_SP,
            sym: Atom::from(s),
        })
    }

    /// Helper to create a key-value property
    fn kv_prop(key: PropName, value: Box<Expr>) -> PropOrSpread {
        PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp { key, value })))
    }

    #[test]
    fn test_parse_turbopack_loader_annotation() {
        // Simulate: with { turbopackLoader: "raw-loader" }
        let with = ObjectLit {
            span: DUMMY_SP,
            props: vec![kv_prop(ident_key("turbopackLoader"), str_lit("raw-loader"))],
        };

        let annotations = ImportAnnotations::parse(Some(&with)).unwrap();
        assert!(annotations.has_turbopack_loader());

        let loader = annotations.turbopack_loader().unwrap();
        assert_eq!(loader.loader.as_str(), "raw-loader");
        assert!(loader.options.is_empty());
    }

    #[test]
    fn test_parse_turbopack_loader_with_options() {
        // Simulate: with { turbopackLoader: "my-loader", turbopackLoaderOptions: '{"flag":true}' }
        let with = ObjectLit {
            span: DUMMY_SP,
            props: vec![
                kv_prop(ident_key("turbopackLoader"), str_lit("my-loader")),
                kv_prop(
                    ident_key("turbopackLoaderOptions"),
                    str_lit(r#"{"flag":true}"#),
                ),
            ],
        };

        let annotations = ImportAnnotations::parse(Some(&with)).unwrap();
        assert!(annotations.has_turbopack_loader());

        let loader = annotations.turbopack_loader().unwrap();
        assert_eq!(loader.loader.as_str(), "my-loader");
        assert_eq!(loader.options["flag"], serde_json::Value::Bool(true));
    }

    #[test]
    fn test_parse_without_turbopack_loader() {
        // Simulate: with { type: "json" }
        let with = ObjectLit {
            span: DUMMY_SP,
            props: vec![kv_prop(ident_key("type"), str_lit("json"))],
        };

        let annotations = ImportAnnotations::parse(Some(&with)).unwrap();
        assert!(!annotations.has_turbopack_loader());
        assert!(annotations.module_type().is_some());
    }

    #[test]
    fn test_parse_empty_with() {
        let annotations = ImportAnnotations::parse(None);
        assert!(annotations.is_none());
    }
}
