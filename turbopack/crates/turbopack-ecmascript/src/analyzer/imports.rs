use std::{
    borrow::Cow,
    collections::{BTreeMap, hash_map::Entry},
    fmt::Display,
    sync::{Arc, LazyLock},
};

use anyhow::{Context, Result};
use auto_hash_map::AutoSet;
use bincode::{Decode, Encode};
use rustc_hash::{FxHashMap, FxHashSet};
use smallvec::SmallVec;
use swc_core::{
    atoms::Wtf8Atom,
    common::{BytePos, GLOBALS, Mark, Span, Spanned, SyntaxContext, comments::Comments},
    ecma::{
        ast::*,
        atoms::{Atom, atom},
        utils::{IsDirective, find_pat_ids},
        visit::{Visit, VisitWith},
    },
};
use turbo_frozenmap::FrozenMap;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, FxIndexSet, NonLocalValue, ResolvedVc};
use turbopack_core::{
    loader::WebpackLoaderItem,
    resolve::{ExportUsage, ImportUsage},
};

use super::{JsValue, ModuleValue, top_level_await::has_top_level_await};
use crate::{
    SpecifiedModuleType,
    analyzer::{
        Bump, ConstantString, ConstantValue, ObjectPart,
        cjs_ast::{is_global, is_module_dot_exports},
        graph::{AssignmentScope, AssignmentScopes, EvalContext},
        is_unresolved, is_unresolved_id,
    },
    magic_identifier::{MAGIC_IDENTIFIER_DEFAULT_EXPORT, MAGIC_IDENTIFIER_DEFAULT_EXPORT_ATOM},
    module_fragments::{PartId, find_turbopack_part_id_in_asserts},
    references::{
        cross_module_constants::is_import_name_eligible_for_exports,
        esm::{EsmAssetReference, EsmExport, Liveness, export::LocalBinding},
        util::{SpecifiedChunkingType, parse_chunking_type_annotation},
    },
    utils::{extract_name_from_member_prop, extract_names_from_object_pat, unparen},
};

#[turbo_tasks::value]
#[derive(Default, Debug, Clone, Hash)]
pub struct ImportAnnotations {
    // TODO store this in more structured way
    #[turbo_tasks(unsafe_ignore)]
    #[bincode(with_serde)]
    map: BTreeMap<Wtf8Atom, Wtf8Atom>,

    /// Parsed turbopack loader configuration from import attributes.
    /// e.g. `import "file" with { turbopackLoader: "raw-loader" }`
    #[bincode(with_serde)]
    turbopack_loader: Option<WebpackLoaderItem>,
    turbopack_rename_as: Option<RcStr>,
    turbopack_module_type: Option<RcStr>,
    chunking_type: Option<SpecifiedChunkingType>,

    turbopack_constants: Option<bool>,
}

/// Enables a specified transition for the annotated import
static ANNOTATION_TRANSITION: LazyLock<Wtf8Atom> =
    LazyLock::new(|| crate::annotations::ANNOTATION_TRANSITION.into());

/// Changes how export usage is propagated to the referenced module
static ANNOTATION_EXPORT_USAGE: LazyLock<Wtf8Atom> =
    LazyLock::new(|| crate::annotations::ANNOTATION_EXPORT_USAGE.into());

/// Changes the type of the resolved module (only "json" is supported currently)
static ATTRIBUTE_MODULE_TYPE: LazyLock<Wtf8Atom> = LazyLock::new(|| atom!("type").into());

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
        let mut turbopack_constants: Option<bool> = None;
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
                "turbopackConstants" => {
                    if let Some(Lit::Str(s)) = kv.value.as_lit() {
                        turbopack_constants = Some(s.value.to_string_lossy() == "true");
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
            || turbopack_constants.is_some()
        {
            Some(ImportAnnotations {
                map,
                turbopack_loader,
                turbopack_rename_as,
                turbopack_module_type,
                chunking_type,
                turbopack_constants,
            })
        } else {
            None
        }
    }

    pub fn parse_dynamic(with: &JsValue<'_>) -> Option<ImportAnnotations> {
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
                turbopack_constants: None,
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

    /// Whether this import forwards the importing module's export usage
    pub fn export_usage_passthrough(&self) -> bool {
        self.get(&ANNOTATION_EXPORT_USAGE)
            .is_some_and(|value| value == "passthrough")
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

    /// Returns true if there is a turbopackConstants attribute
    pub fn turbopack_constants(&self) -> Option<bool> {
        self.turbopack_constants
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

#[derive(Clone, Debug)]
pub enum DeclUsage {
    SideEffects,
    Bindings(FxHashSet<Id>),
}
impl Default for DeclUsage {
    fn default() -> Self {
        DeclUsage::Bindings(Default::default())
    }
}
impl DeclUsage {
    fn add_usage(&mut self, user: &Id) {
        match self {
            Self::Bindings(set) => {
                set.insert(user.clone());
            }
            Self::SideEffects => {}
        }
    }
    fn make_side_effects(&mut self) {
        *self = Self::SideEffects;
    }
}

#[derive(Default, Debug)]
pub(crate) struct ProgramDeclUsage {
    // ident -> immediate usage (top level decl)
    pub(crate) decl_usages: FxHashMap<Id, DeclUsage>,
    // import -> immediate usage (top level decl)
    pub(crate) import_usages: FxHashMap<usize, DeclUsage>,
    // import reference -> names it is directly re-exported as (`export { x } from '...'`)
    pub(crate) named_reexports: FxHashMap<usize, AutoSet<RcStr>>,
    // export name -> top level decl
    pub(crate) exports: FxHashMap<RcStr, Id>,
}
impl ProgramDeclUsage {
    fn compute_import_usage(&self) -> FxHashMap<usize, ImportUsage> {
        let mut import_usage =
            FxHashMap::with_capacity_and_hasher(self.import_usages.len(), Default::default());
        for (reference, usage) in &self.import_usages {
            // TODO make this more efficient, i.e. cache the result?
            if let DeclUsage::Bindings(ids) = usage {
                // compute transitive closure of `ids` over `top_level_mappings`
                let mut visited = ids.clone();
                let mut stack = ids.iter().collect::<Vec<_>>();
                let mut has_global_usage = false;
                while let Some(id) = stack.pop() {
                    match self.decl_usages.get(id) {
                        Some(DeclUsage::SideEffects) => {
                            has_global_usage = true;
                            break;
                        }
                        Some(DeclUsage::Bindings(callers)) => {
                            for caller in callers {
                                if visited.insert(caller.clone()) {
                                    stack.push(caller);
                                }
                            }
                        }
                        _ => {}
                    }
                }

                // Collect all `visited` declarations which are exported
                import_usage.insert(
                    *reference,
                    if has_global_usage {
                        ImportUsage::TopLevel
                    } else {
                        ImportUsage::Exports(
                            self.exports
                                .iter()
                                .filter(|(_, id)| visited.contains(*id))
                                .map(|(exported, _)| exported.clone())
                                .collect(),
                        )
                    },
                );
            }
        }
        // Fold re-exports (`export { x } from "foo"`) into `import_usage` for tree-shaking.
        for (reference, names) in &self.named_reexports {
            let usage = match import_usage.get(reference) {
                Some(ImportUsage::TopLevel) => continue,
                // Used locally and re-exported, e.g.
                // `import {foo} from 'm'; export function w(){foo()} export {foo} from 'm'`
                // → union: Exports({"w"}) ∪ {"foo"}.
                Some(ImportUsage::Exports(existing)) => ImportUsage::Exports(
                    existing
                        .iter()
                        .cloned()
                        .chain(names.iter().cloned())
                        .collect(),
                ),
                None => ImportUsage::Exports(names.iter().cloned().collect()),
            };
            import_usage.insert(*reference, usage);
        }
        import_usage
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
#[derive(Default, Debug)]
pub(crate) struct ImportMap {
    /// Map from identifier to (index in references, exported symbol)
    imports: FxIndexMap<Id, (usize, Atom)>,

    /// Map from identifier to index in references
    namespace_imports: FxIndexMap<Id, usize>,

    /// Map from exported name to the export
    pub(crate) exports: BTreeMap<RcStr, Export>,

    /// List of namespace re-exports
    reexport_namespaces: Vec<usize>,

    /// Ordered list of imported symbols
    references: FxIndexSet<ImportMapReference>,

    /// Top-level module item index that first inserted each reference. Kept parallel to
    /// `references` so declaration order does not affect reference identity or deduplication.
    reference_declaration_orders: Vec<usize>,

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

    /// Map from export binding id to the scopes where it's assigned. This is used to determine
    /// whether an export is live or not.
    pub(super) assignment_scopes: FxHashMap<Id, AssignmentScopes>,

    /// Bindings whose value is a function that provably never reaches `this`.
    pub(super) fns_not_using_this: FxHashSet<Id>,

    pub(crate) import_usage: FxHashMap<usize, ImportUsage>,

    /// Map from exported name to local binding id (includes the syntax context).
    pub(crate) exports_ids: FxHashMap<RcStr, (Id, Span)>,

    /// CommonJS imports: stores the "resolved" imports (eg. `const { a } = require("m")`)
    /// and the generic whole-module imports (eg. `const x = require("m")`).
    cjs_imports: CjsImports,
}

#[derive(Default, Debug)]
pub(crate) struct CjsImports {
    /// `require("m").foo` or `const { a } = require("m")`
    pub(crate) resolved: FxHashMap<BytePos, ExportUsage>,

    /// `const x = require("m")`
    pub(crate) bindings: FxHashMap<Id, BytePos>,
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

/// Which spelling a module's export registration can use, decided during analysis so that the
/// export code generation and the import references agree without either re-deriving it.
///
/// See `references::esm::export` for the emitted forms.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, NonLocalValue, Encode, Decode, Default)]
pub enum ExportRegistrationMode {
    /// The module has local exports (or no re-exports at all): the general registration is needed.
    #[default]
    Normal,
    /// Only re-exports, but an import follows one of them. The compact registration can be used,
    /// but the imports still have to be generated in place to preserve evaluation order, so its
    /// groups reuse the namespace objects those imports already bound.
    Mixed,
    /// Only re-exports, and no import follows one of them. The compact registration subsumes the
    /// imports, so the references do not generate them at all -- this is the case that saves bytes.
    Reexport,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ImportMapReference {
    pub module_path: Wtf8Atom,
    pub imported_symbol: ImportedSymbol,
    pub annotations: Option<Arc<ImportAnnotations>>,
    pub span: Span,
}

impl ImportMap {
    fn ensure_reference(
        &mut self,
        reference: ImportMapReference,
        declaration_order: usize,
    ) -> usize {
        if let Some(i) = self.references.get_index_of(&reference) {
            i
        } else {
            let i = self.references.len();
            self.references.insert(reference);
            self.reference_declaration_orders.push(declaration_order);
            debug_assert_eq!(
                self.references.len(),
                self.reference_declaration_orders.len()
            );
            i
        }
    }

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

    pub fn is_cjs(&self, specified_type: SpecifiedModuleType) -> bool {
        !self.is_esm(specified_type)
    }

    pub fn get_import_for_idx<'a>(
        &self,
        arena: &'a Bump,
        esm_reference_idx: usize,
        export: Option<ConstantString>,
    ) -> JsValue<'a> {
        let r = &self.references[esm_reference_idx];
        if let Some(export) = export {
            JsValue::member(
                arena,
                JsValue::Module(ModuleValue {
                    module: r.module_path.clone(),
                    annotations: r.annotations.clone(),
                    reference: Some((esm_reference_idx as u32).into()),
                    analyze_for_constants: is_import_name_eligible_for_exports(export.as_str()),
                }),
                JsValue::Constant(ConstantValue::Str(export)),
            )
        } else {
            JsValue::Module(ModuleValue {
                module: r.module_path.clone(),
                annotations: r.annotations.clone(),
                reference: Some((esm_reference_idx as u32).into()),
                analyze_for_constants: false,
            })
        }
    }

    pub fn get_import<'a>(&self, arena: &'a Bump, id: &Id) -> Option<JsValue<'a>> {
        if let Some((i, i_sym)) = self.imports.get(id) {
            return Some(self.get_import_for_idx(arena, *i, Some(i_sym.clone().into())));
        }
        if let Some(i) = self.namespace_imports.get(id) {
            return Some(self.get_import_for_idx(arena, *i, None));
        }
        None
    }

    pub fn get_attributes(&self, span: Span) -> &ImportAttributes {
        self.attributes.get(&span.lo).unwrap_or_default()
    }

    pub fn get_annotations(&self, idx: usize) -> Option<&Arc<ImportAnnotations>> {
        self.references
            .get_index(idx)
            .and_then(|r| r.annotations.as_ref())
    }

    pub fn get_binding(&self, id: &Id) -> Option<(usize, Option<&Atom>)> {
        if let Some((i, i_sym)) = self.imports.get(id) {
            return Some((*i, Some(i_sym)));
        }
        if let Some(i) = self.namespace_imports.get(id) {
            return Some((*i, None));
        }
        None
    }

    pub fn references(&self) -> impl ExactSizeIterator<Item = &ImportMapReference> {
        self.references.iter()
    }

    pub fn reference_span(&self, index: usize) -> Span {
        self.references[index].span
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

    /// Indices of references that also provide a binding used by the module's own code, i.e. a
    /// named import or a namespace import. A re-export whose reference is in here cannot have its
    /// import subsumed by a compact registration: the binding would be left undefined.
    pub fn locally_bound_reference_idxs(&self) -> impl Iterator<Item = usize> {
        self.imports
            .values()
            .map(|(i, _)| *i)
            .chain(self.namespace_imports.values().copied())
    }

    /// How this module's export registration can be emitted.
    ///
    /// A declaration contributes separate evaluation and binding references, so reference indices
    /// do not preserve source order across imports. The parallel declaration-order table identifies
    /// which references came from the same top-level module item without relying on spans, which
    /// may be `DUMMY_SP` for transform-inserted imports.
    pub fn export_registration_mode(&self) -> ExportRegistrationMode {
        let has_local_exports = self
            .exports
            .values()
            .any(|export| matches!(export, Export::LocalBinding(..) | Export::Error));
        if has_local_exports {
            return ExportRegistrationMode::Normal;
        }

        let reexports: FxHashSet<usize> = self.reexports_reference_idxs().collect();
        if reexports.is_empty() {
            return ExportRegistrationMode::Normal;
        }

        // Each `export ... from` declaration contributes an evaluation reference plus one or more
        // binding references. The binding references are the ones recorded as re-exports; exclude
        // every reference from the same declaration so its evaluation edge is not mistaken for an
        // unrelated import.
        let reexport_declarations: FxHashSet<_> = reexports
            .iter()
            .map(|i| self.reference_declaration_orders[*i])
            .collect();
        let first_reexport = *reexport_declarations.iter().min().unwrap();

        // Every remaining declaration is an import this module needs in its own right -- including
        // a side-effect-only `import './x'`, which contributes no imported binding. Compare
        // explicit top-level module item order rather than reference indices: the analyser
        // groups evaluation references before binding references, so their indices do not
        // retain declaration order.
        let last_other = self
            .reference_declaration_orders
            .iter()
            .filter(|order| !reexport_declarations.contains(order))
            .copied()
            .max();
        let Some(last_other) = last_other else {
            // Nothing but re-export declarations: hoisting cannot reorder anything.
            return ExportRegistrationMode::Reexport;
        };

        // Safe to hoist only when no unrelated import follows a re-export.
        if last_other < first_reexport {
            ExportRegistrationMode::Reexport
        } else {
            ExportRegistrationMode::Mixed
        }
    }

    pub fn as_esm_exports(
        &self,
        import_references: &[ResolvedVc<EsmAssetReference>],
        eval_context: &EvalContext,
    ) -> Result<FrozenMap<RcStr, EsmExport>> {
        Ok(FrozenMap::from(
            self.exports
                .iter()
                .map(|(name, value)| {
                    let value = match value {
                        Export::LocalBinding(local, is_fake_esm) => {
                            let id = self
                                .exports_ids
                                .get(name)
                                .cloned()
                                .with_context(|| {
                                    format!("Exported binding {name} not found in exports_ids")
                                })?
                                .0;
                            EsmExport::LocalBinding(LocalBinding {
                                name: local.clone(),
                                maybe_uses_this: eval_context
                                    .imports
                                    .get_export_ident_maybe_uses_this(&id),
                                liveness: if *is_fake_esm {
                                    // it is likely that these are not always actually mutable.
                                    Liveness::Mutable
                                } else {
                                    eval_context
                                        .imports
                                        .get_export_ident_liveness(id, eval_context.unresolved_mark)
                                },
                            })
                        }
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

    /// Whether the value exported as `id` may observe `this` when called.
    ///
    /// Conservative: true unless the binding was seen to be a function that provably never
    /// reaches `this`.
    pub fn get_export_ident_maybe_uses_this(&self, id: &Id) -> bool {
        !self.fns_not_using_this.contains(id)
    }

    /// Returns the liveness of a given export identifier. An export is live if it might change
    /// values after module evaluation.
    pub fn get_export_ident_liveness(&self, id: Id, unresolved_mark: Mark) -> Liveness {
        if let Some(assignment_scopes) = self.assignment_scopes.get(&id) {
            // If all assignments are in module scope, the export is not live.
            if *assignment_scopes != AssignmentScopes::AllInModuleEvalScope {
                Liveness::Live
            } else {
                Liveness::Constant
            }
        } else {
            // If we haven't computed a value for it, that means it might be
            // - A free variable or
            // - an imported variable
            // In those cases, we just assume that the value is live since we don't know anything
            debug_assert!(
                self.imports.contains_key(&id)
                    || self.namespace_imports.contains_key(&id)
                    || !GLOBALS.is_set()
                    || is_unresolved_id(&id, unresolved_mark),
                "export ident {id:?} without an assignment scope should be a free variable or an \
                 imported variable"
            );

            Liveness::Live
        }
    }

    /// Analyze ES import
    pub(super) fn analyze(
        unresolved_mark: Mark,
        m: &Program,
        comments: Option<&dyn Comments>,
    ) -> Self {
        let mut data = ImportMap::default();
        let mut analyzer = Analyzer {
            unresolved_mark,
            data: &mut data,
            comments,
            namespace_imports_to_specifier: FxIndexMap::default(),
            state: Default::default(),
            program_decl_usage: Default::default(),
            current_module_item_order: 0,
        };

        // A prepass to detect imports to be able to rewrite import+export pairs to true reexports
        if let Program::Module(m) = m {
            for (order, stmt) in m.body.iter().enumerate() {
                analyzer.current_module_item_order = order;
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

        data.import_usage = analyzer.program_decl_usage.compute_import_usage();

        data
    }

    pub(crate) fn should_import_all(&self, esm_reference_index: usize) -> bool {
        let r = &self.references[esm_reference_index];

        self.full_star_imports.contains(&r.module_path)
    }

    pub(crate) fn cjs_imports(&self) -> &CjsImports {
        &self.cjs_imports
    }
}

mod analyzer_state {
    use swc_core::ecma::ast::{Id, Ident};

    use super::Analyzer;

    #[derive(Default)]
    pub(super) struct AnalyzerState {
        is_in_fn: bool,
        cur_top_level_decl_name: Option<Id>,
        /// How many enclosing scopes bind their own `this`. Arrows do not, so a `this` inside one
        /// belongs to the function around it.
        this_binding_depth: u32,
        /// Set while visiting a top level declaration whose body has reached `this`.
        cur_top_level_decl_uses_this: bool,
    }

    impl AnalyzerState {
        /// Returns the identifier of the current top level declaration.
        pub(super) fn cur_top_level_decl_name(&self) -> &Option<Id> {
            &self.cur_top_level_decl_name
        }

        /// Returns whether the current context is inside a function.
        pub(super) fn is_in_fn(&self) -> bool {
            self.is_in_fn
        }

        /// Returns whether `this` currently refers to a binding inside the top level declaration
        /// rather than to the declaration's own value.
        ///
        /// A `this` nested one level deep belongs to the exported function itself; deeper than
        /// that it belongs to some inner function, which receives its own receiver.
        pub(super) fn this_binds_to_top_level_decl(&self) -> bool {
            self.this_binding_depth == 1
        }

        pub(super) fn mark_top_level_decl_uses_this(&mut self) {
            self.cur_top_level_decl_uses_this = true;
        }
    }

    impl Analyzer<'_> {
        /// Runs `visitor` with the current top level declaration identifier
        pub(super) fn enter_top_level_decl<T>(
            &mut self,
            name: &Ident,
            visitor: impl FnOnce(&mut Self) -> T,
        ) -> T {
            let is_top_level_fn = self.state.cur_top_level_decl_name.is_none();
            if is_top_level_fn {
                self.state.cur_top_level_decl_name = Some(name.to_id());
                self.state.cur_top_level_decl_uses_this = false;
            }
            let result = visitor(self);
            if is_top_level_fn {
                // Record the answer only when it is a "no". Everything else stays absent, which
                // reads as "maybe".
                if !self.state.cur_top_level_decl_uses_this {
                    self.data.fns_not_using_this.insert(name.to_id());
                }
                self.state.cur_top_level_decl_name = None;
                self.state.cur_top_level_decl_uses_this = false;
            }
            result
        }

        /// Runs `visitor` with `this` bound to a new scope, without marking the body as being
        /// inside a function.
        ///
        /// A class body rebinds `this` for its field initializers and static blocks, but it is
        /// not a function scope: a declaration in it is still evaluated during module
        /// evaluation, which is what [`AnalyzerState::is_in_fn`] reports.
        pub(super) fn enter_this_binding_scope<T>(
            &mut self,
            visitor: impl FnOnce(&mut Self) -> T,
        ) -> T {
            self.state.this_binding_depth += 1;
            let result = visitor(self);
            self.state.this_binding_depth -= 1;
            result
        }

        /// Runs `visitor` with the right is_in_fn value.
        ///
        /// `binds_this` is false for arrows, which take `this` from their enclosing scope.
        pub(super) fn enter_fn<T>(
            &mut self,
            binds_this: bool,
            visitor: impl FnOnce(&mut Self) -> T,
        ) -> T {
            let old_is_in_fn = self.state.is_in_fn;
            self.state.is_in_fn = true;
            if binds_this {
                self.state.this_binding_depth += 1;
            }
            let result = visitor(self);
            if binds_this {
                self.state.this_binding_depth -= 1;
            }
            self.state.is_in_fn = old_is_in_fn;
            result
        }
    }
}

struct Analyzer<'a> {
    unresolved_mark: Mark,
    data: &'a mut ImportMap,
    comments: Option<&'a dyn Comments>,
    /// Map from local identifier of namespace imports to module path, used temporarily during
    /// analysis to detect dynamic accesses to namespace imports.
    namespace_imports_to_specifier: FxIndexMap<Id, Wtf8Atom>,

    program_decl_usage: ProgramDeclUsage,

    /// Index of the top-level module item currently being analyzed.
    current_module_item_order: usize,

    state: analyzer_state::AnalyzerState,
}

impl Analyzer<'_> {
    fn ensure_reference(
        &mut self,
        span: Span,
        module_path: Wtf8Atom,
        imported_symbol: ImportedSymbol,
        annotations: Option<ImportAnnotations>,
    ) -> usize {
        let reference = ImportMapReference {
            module_path,
            imported_symbol,
            span,
            annotations: annotations.map(Arc::new),
        };
        self.data
            .ensure_reference(reference, self.current_module_item_order)
    }

    fn register_assignment_scope(&mut self, id: Id) {
        let scope = if self.state.is_in_fn() {
            AssignmentScope::Function
        } else {
            AssignmentScope::ModuleEval
        };

        match self.data.assignment_scopes.entry(id) {
            Entry::Occupied(mut e) => {
                *e.get_mut() = e.get().merge(scope);
            }
            Entry::Vacant(e) => {
                e.insert(AssignmentScopes::new(scope));
            }
        }
    }

    /// Records how a `const … = require("…")` declarator consumes the call.
    fn record_require_usage_var(&mut self, n: &VarDeclarator) {
        let Some(init) = &n.init else {
            return;
        };
        let Some(call) = as_require_call(init, self.unresolved_mark) else {
            return;
        };
        match &n.name {
            Pat::Ident(binding) => {
                self.data
                    .cjs_imports
                    .bindings
                    .insert(binding.id.to_id(), call.span.lo);
            }
            Pat::Object(_) => {
                let usage = match extract_names_from_object_pat(&n.name) {
                    // `const {} = require(...)`: no members read → evaluation only.
                    Some(names) if names.is_empty() => ExportUsage::Evaluation,
                    Some(names) => ExportUsage::PartialNamespaceObject(names),
                    None => ExportUsage::All,
                };
                self.data.cjs_imports.resolved.insert(call.span.lo, usage);
            }
            _ => {
                self.data
                    .cjs_imports
                    .resolved
                    .insert(call.span.lo, ExportUsage::All);
            }
        }
    }
}

impl Visit for Analyzer<'_> {
    fn visit_module(&mut self, module: &Module) {
        for (order, item) in module.body.iter().enumerate() {
            self.current_module_item_order = order;
            item.visit_with(self);
        }
    }

    fn visit_import_decl(&mut self, _: &ImportDecl) {
        // We already handled import above. Skip as the Idents in here confuse the analysis
    }

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
        export.visit_children_with(self);
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

                let name = match spec {
                    ExportSpecifier::Namespace(n) => {
                        let name = RcStr::from(n.name.atom().as_str());
                        self.data
                            .exports
                            .insert(name.clone(), Export::ImportedNamespace(i));
                        name
                    }
                    ExportSpecifier::Default(d) => {
                        let name = RcStr::from(d.exported.sym.as_str());
                        self.data.exports.insert(
                            name.clone(),
                            Export::ImportedBinding(i, rcstr!("default"), false),
                        );
                        name
                    }
                    ExportSpecifier::Named(n) => {
                        let name =
                            RcStr::from(n.exported.as_ref().unwrap_or(&n.orig).atom().as_str());
                        self.data.exports.insert(
                            name.clone(),
                            Export::ImportedBinding(i, RcStr::from(n.orig.atom().as_str()), false),
                        );
                        name
                    }
                };
                self.program_decl_usage
                    .named_reexports
                    .entry(i)
                    .or_default()
                    .insert(name);
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
                                    Export::ImportedBinding(
                                        index,
                                        RcStr::from(export.as_str()),
                                        is_fake_esm,
                                    )
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
        self.data.has_exports = true;
        match &n.decl {
            Decl::Class(n) => {
                let name = RcStr::from(n.ident.sym.as_str());
                self.data
                    .exports
                    .insert(name.clone(), Export::LocalBinding(name.clone(), false));
                self.data
                    .exports_ids
                    .insert(name.clone(), (n.ident.to_id(), n.ident.span));
                self.program_decl_usage
                    .exports
                    .insert(name, n.ident.to_id());
            }
            Decl::Fn(n) => {
                let name = RcStr::from(n.ident.sym.as_str());
                self.data
                    .exports
                    .insert(name.clone(), Export::LocalBinding(name.clone(), false));
                self.data
                    .exports_ids
                    .insert(name.clone(), (n.ident.to_id(), n.ident.span));
                self.program_decl_usage
                    .exports
                    .insert(name, n.ident.to_id());
            }
            Decl::Var(..) => {
                let ids: Vec<Id> = find_pat_ids(&n.decl);
                for id in ids {
                    let name = RcStr::from(id.0.as_str());
                    self.data
                        .exports
                        .insert(name.clone(), Export::LocalBinding(name.clone(), false));
                    self.data
                        .exports_ids
                        .insert(name.clone(), (id.clone(), n.span));
                    self.program_decl_usage.exports.insert(name, id);
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

        n.visit_children_with(self);
    }

    fn visit_export_default_decl(&mut self, n: &ExportDefaultDecl) {
        self.data.has_exports = true;

        let id = match &n.decl {
            DefaultDecl::Class(ClassExpr { ident, .. }) | DefaultDecl::Fn(FnExpr { ident, .. }) => {
                // Mirror what `EsmModuleItem::code_generation` does, these are live bindings if the
                // class/function has an identifier.
                ident.as_ref().map_or_else(
                    || {
                        (
                            MAGIC_IDENTIFIER_DEFAULT_EXPORT_ATOM.clone(),
                            SyntaxContext::empty(),
                        )
                    },
                    |ident| ident.to_id(),
                )
            }
            DefaultDecl::TsInterfaceDecl(_) => {
                // not matching, might happen due to eventual consistency
                (
                    MAGIC_IDENTIFIER_DEFAULT_EXPORT_ATOM.clone(),
                    SyntaxContext::empty(),
                )
            }
        };

        self.register_assignment_scope(id.clone());
        self.data.exports.insert(
            rcstr!("default"),
            Export::LocalBinding(RcStr::from(id.0.as_str()), false),
        );
        self.data
            .exports_ids
            .insert(rcstr!("default"), (id.clone(), n.span));
        self.program_decl_usage
            .exports
            .insert(rcstr!("default"), id);
        n.visit_children_with(self);
    }

    fn visit_export_default_expr(&mut self, n: &ExportDefaultExpr) {
        self.data.has_exports = true;

        let default_id = (
            MAGIC_IDENTIFIER_DEFAULT_EXPORT_ATOM.clone(),
            SyntaxContext::empty(),
        );

        self.data.exports.insert(
            rcstr!("default"),
            Export::LocalBinding(MAGIC_IDENTIFIER_DEFAULT_EXPORT.clone(), false),
        );
        self.data.exports_ids.insert(
            rcstr!("default"),
            (
                (
                    // `EsmModuleItem::code_generation` inserts this variable.
                    MAGIC_IDENTIFIER_DEFAULT_EXPORT_ATOM.clone(),
                    SyntaxContext::empty(),
                ),
                n.span,
            ),
        );

        self.register_assignment_scope(default_id);
        n.visit_children_with(self);
    }

    fn visit_export_named_specifier(&mut self, n: &ExportNamedSpecifier) {
        self.data.has_exports = true;

        let ModuleExportName::Ident(local) = &n.orig else {
            unreachable!("exporting a string should be impossible")
        };
        let exported = RcStr::from(n.exported.as_ref().unwrap_or(&n.orig).atom().as_str());
        self.data
            .exports_ids
            .insert(exported.clone(), (local.to_id(), n.span));
        self.program_decl_usage
            .exports
            .insert(exported, local.to_id());
        n.visit_children_with(self);
    }

    fn visit_export_default_specifier(&mut self, n: &ExportDefaultSpecifier) {
        self.data.has_exports = true;

        self.data
            .exports_ids
            .insert(rcstr!("default"), (n.exported.to_id(), n.exported.span));
        n.visit_children_with(self);
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
        // A direct `eval` runs in the enclosing scope, so the evaluated code can read `this`
        // without it appearing anywhere in the source.
        if self.state.this_binds_to_top_level_decl()
            && let Callee::Expr(callee) = &n.callee
            && let Expr::Ident(ident) = unparen(callee)
            && ident.sym == atom!("eval")
            && is_unresolved_id(&ident.to_id(), self.unresolved_mark)
        {
            self.state.mark_top_level_decl_uses_this();
        }

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

    fn visit_getter_prop(&mut self, node: &GetterProp) {
        self.enter_fn(/* binds_this */ true, |this| {
            node.visit_children_with(this);
        });
    }
    fn visit_setter_prop(&mut self, node: &SetterProp) {
        self.enter_fn(/* binds_this */ true, |this| {
            node.visit_children_with(this);
        });
    }
    fn visit_function(&mut self, node: &Function) {
        self.enter_fn(/* binds_this */ true, |this| {
            node.visit_children_with(this);
        });
    }
    fn visit_constructor(&mut self, node: &Constructor) {
        self.enter_fn(/* binds_this */ true, |this| {
            node.visit_children_with(this);
        });
    }
    fn visit_arrow_expr(&mut self, node: &ArrowExpr) {
        self.enter_fn(/* binds_this */ false, |this| {
            node.visit_children_with(this);
        });
    }
    fn visit_class(&mut self, node: &Class) {
        // A class body binds `this` without being a function: field initializers and static
        // blocks each get the class as their receiver. Methods bump the depth again through
        // `visit_function`, which is harmless -- a `this` inside one is nested either way.
        self.enter_this_binding_scope(|this| {
            node.visit_children_with(this);
        });
    }

    fn visit_member_expr(&mut self, node: &MemberExpr) {
        // `require("…").foo` — the accessed member is the used export.
        if let Some(call) = as_require_call(&node.obj, self.unresolved_mark) {
            let usage = match extract_name_from_member_prop(&node.prop) {
                Some(names) => ExportUsage::PartialNamespaceObject(names),
                None => ExportUsage::All,
            };
            self.data.cjs_imports.resolved.insert(call.span.lo, usage);
        }

        if matches!(
            &node.prop,
            MemberProp::Ident(..)
                | MemberProp::PrivateName(..)
                | MemberProp::Computed(ComputedPropName {
                    expr: Expr::Lit(Lit::Str(_)),
                    ..
                })
        ) && let Expr::Ident(ident) = &*node.obj
        {
            // Intentionally skipping over visit_expr(node.obj) here so that it doesn't get added to
            // full_star_imports below in visit_expr.
            ident.visit_with(self);
        } else {
            node.visit_children_with(self);
        }
    }

    fn visit_expr(&mut self, node: &Expr) {
        // Careful about adding anything here, visit_member_expr might skip over this method for
        // some Expr::Ident-s.
        if let Expr::Ident(i) = node
            && let Some(module_path) = self.namespace_imports_to_specifier.get(&i.to_id())
        {
            self.data.full_star_imports.insert(module_path.clone());
        }
        node.visit_children_with(self);
    }

    fn visit_pat(&mut self, pat: &Pat) {
        if let Pat::Ident(i) = pat {
            self.register_assignment_scope(i.to_id());
            if let Some(module_path) = self.namespace_imports_to_specifier.get(&i.to_id()) {
                self.data.full_star_imports.insert(module_path.clone());
            }
        }
        pat.visit_children_with(self);
    }

    fn visit_simple_assign_target(&mut self, node: &SimpleAssignTarget) {
        if let SimpleAssignTarget::Ident(i) = node {
            self.register_assignment_scope(i.to_id());
            if let Some(module_path) = self.namespace_imports_to_specifier.get(&i.to_id()) {
                self.data.full_star_imports.insert(module_path.clone());
            }
        }
        node.visit_children_with(self);
    }

    fn visit_ident(&mut self, node: &Ident) {
        let id = node.to_id();
        if let Some((esm_reference_index, _)) = self.data.get_binding(&id) {
            // An import binding
            let usage = self
                .program_decl_usage
                .import_usages
                .entry(esm_reference_index)
                .or_default();
            if let Some(top_level) = self.state.cur_top_level_decl_name() {
                usage.add_usage(top_level);
            } else {
                usage.make_side_effects();
            }
        } else {
            // A regular variable
            if !is_unresolved(node, self.unresolved_mark) {
                if let Some(top_level) = self.state.cur_top_level_decl_name() {
                    if &id != top_level {
                        self.program_decl_usage
                            .decl_usages
                            .entry(id)
                            .or_default()
                            .add_usage(top_level);
                    }
                } else {
                    self.program_decl_usage
                        .decl_usages
                        .entry(id)
                        .or_default()
                        .make_side_effects();
                }
            }
        }
    }

    fn visit_fn_expr(&mut self, node: &FnExpr) {
        if let Some(ident) = &node.ident {
            self.register_assignment_scope(ident.to_id());
        }
        node.visit_children_with(self);
    }

    fn visit_this_expr(&mut self, _node: &ThisExpr) {
        // Only a `this` that binds to the declaration's own function body says anything about the
        // exported value. Deeper ones belong to an inner function with its own receiver.
        if self.state.this_binds_to_top_level_decl() {
            self.state.mark_top_level_decl_uses_this();
        }
    }

    fn visit_with_stmt(&mut self, node: &WithStmt) {
        // A `with` block can resolve a bare name against its scrutinee, so the body may read
        // `this` without naming it.
        if self.state.this_binds_to_top_level_decl() {
            self.state.mark_top_level_decl_uses_this();
        }
        node.visit_children_with(self);
    }

    fn visit_fn_decl(&mut self, node: &FnDecl) {
        self.enter_top_level_decl(&node.ident, |this| {
            node.visit_children_with(this);
        });
    }

    fn visit_decl(&mut self, node: &Decl) {
        match node {
            Decl::Class(c) => {
                self.register_assignment_scope(c.ident.to_id());
            }
            Decl::Fn(f) => {
                self.register_assignment_scope(f.ident.to_id());
            }
            Decl::Using(v) => {
                let ids: Vec<Id> = find_pat_ids(&v.decls);
                for id in ids {
                    self.register_assignment_scope(id);
                }
            }
            Decl::Var(v) => {
                let ids: Vec<Id> = find_pat_ids(&v.decls);
                for id in ids {
                    self.register_assignment_scope(id);
                }
            }
            Decl::TsInterface(_) | Decl::TsTypeAlias(_) | Decl::TsEnum(_) | Decl::TsModule(_) => {}
        }
        node.visit_children_with(self);
    }

    fn visit_var_declarator(&mut self, node: &VarDeclarator) {
        self.record_require_usage_var(node);
        // `const f = () => …` / `const f = function () {…}` binds a directly visible function to a
        // name, so it can answer the `this` question just like a function declaration. Anything
        // else (a call, a conditional, an imported value) stays unanswered and therefore "maybe".
        if let Pat::Ident(binding) = &node.name
            && let Some(init) = &node.init
            && matches!(unparen(init), Expr::Arrow(_) | Expr::Fn(_))
        {
            self.enter_top_level_decl(&binding.id, |this| {
                node.visit_children_with(this);
            });
            return;
        }
        node.visit_children_with(self);
    }

    fn visit_assign_expr(&mut self, node: &AssignExpr) {
        if node.op == AssignOp::Assign
            && let AssignTarget::Simple(SimpleAssignTarget::Member(target)) = &node.left
            && is_module_dot_exports(target, self.unresolved_mark)
            && let Some(call) = as_require_call(&node.right, self.unresolved_mark)
        {
            self.data.cjs_imports.resolved.insert(
                call.span.lo,
                ExportUsage::Passthrough {
                    namespace_object_may_escape: true,
                },
            );
        }
        node.visit_children_with(self);
    }

    fn visit_expr_stmt(&mut self, node: &ExprStmt) {
        // A bare `require("…")` statement discards its result → evaluation only.
        if let Some(call) = as_require_call(&node.expr, self.unresolved_mark) {
            self.data
                .cjs_imports
                .resolved
                .insert(call.span.lo, ExportUsage::Evaluation);
        }
        node.visit_children_with(self);
    }

    fn visit_update_expr(&mut self, node: &UpdateExpr) {
        if let Some(key) = node.arg.as_ident() {
            // node.arg can also be a member expression
            self.register_assignment_scope(key.to_id());
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

/// If `expr` is a `require("<string literal>")` call, returns it.
fn as_require_call(expr: &Expr, unresolved_mark: Mark) -> Option<&CallExpr> {
    let Expr::Call(call) = unparen(expr) else {
        return None;
    };
    let Callee::Expr(callee) = &call.callee else {
        return None;
    };
    let Expr::Ident(f) = &**callee else {
        return None;
    };
    if !is_global(f, "require", unresolved_mark) {
        return None;
    }
    let [arg] = &call.args[..] else {
        return None;
    };
    if arg.spread.is_some() || !matches!(unparen(&arg.expr), Expr::Lit(Lit::Str(_))) {
        return None;
    }
    Some(call)
}

#[cfg(test)]
mod tests {
    use swc_core::{atoms::Atom, common::DUMMY_SP};

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

    /// Helper to create a string property name
    fn str_key(s: &str) -> PropName {
        PropName::Str(Str {
            span: DUMMY_SP,
            value: Atom::from(s).into(),
            raw: None,
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
    fn test_parse_export_usage_passthrough() {
        let with = ObjectLit {
            span: DUMMY_SP,
            props: vec![kv_prop(
                str_key(crate::annotations::ANNOTATION_EXPORT_USAGE),
                str_lit("passthrough"),
            )],
        };

        let annotations = ImportAnnotations::parse(Some(&with)).unwrap();
        assert!(annotations.export_usage_passthrough());
    }

    #[test]
    fn test_parse_empty_with() {
        let annotations = ImportAnnotations::parse(None);
        assert!(annotations.is_none());
    }

    /// Builds an `ImportMap` with the given references and exports, so the mode classifier can be
    /// exercised without running the full analyser.
    fn map_with(
        n_refs: usize,
        exports: Vec<(&str, Export)>,
        reexport_namespaces: &[usize],
    ) -> ImportMap {
        let mut map = ImportMap::default();
        for i in 0..n_refs {
            map.ensure_reference(
                ImportMapReference {
                    module_path: format!("./m{i}").into(),
                    imported_symbol: ImportedSymbol::Symbol(Atom::from("x")),
                    annotations: None,
                    span: Span::new(BytePos(i as u32 + 1), BytePos(i as u32 + 2)),
                },
                i,
            );
        }
        for (name, export) in exports {
            map.exports.insert(name.into(), export);
        }
        map.reexport_namespaces = reexport_namespaces.to_vec();
        map
    }

    #[test]
    fn reference_declaration_order_does_not_affect_deduplication() {
        let mut map = ImportMap::default();
        let reference = ImportMapReference {
            module_path: "./transformed".into(),
            imported_symbol: ImportedSymbol::Symbol("value".into()),
            annotations: None,
            span: DUMMY_SP,
        };

        let first = map.ensure_reference(reference.clone(), 2);
        let duplicate = map.ensure_reference(reference, 7);

        assert_eq!(first, duplicate);
        assert_eq!(map.references.len(), 1);
        assert_eq!(map.reference_declaration_orders, vec![2]);
    }

    #[test]
    fn export_registration_mode_normal_without_reexports() {
        // No exports at all, and a plain import.
        let map = map_with(1, vec![], &[]);
        assert_eq!(
            map.export_registration_mode(),
            ExportRegistrationMode::Normal
        );
    }

    #[test]
    fn export_registration_mode_normal_with_a_local_export() {
        // A local export forces the general registration even alongside a re-export.
        let map = map_with(
            1,
            vec![
                ("local", Export::LocalBinding("local".into(), false)),
                ("a", Export::ImportedBinding(0, "a".into(), false)),
            ],
            &[],
        );
        assert_eq!(
            map.export_registration_mode(),
            ExportRegistrationMode::Normal
        );
    }

    #[test]
    fn export_registration_mode_reexport_when_only_reexports() {
        // `export { a } from './a'; export { b } from './b'`
        let map = map_with(
            2,
            vec![
                ("a", Export::ImportedBinding(0, "a".into(), false)),
                ("b", Export::ImportedBinding(1, "b".into(), false)),
            ],
            &[],
        );
        assert_eq!(
            map.export_registration_mode(),
            ExportRegistrationMode::Reexport
        );
    }

    #[test]
    fn export_registration_mode_reexport_when_imports_precede() {
        // `import { first } from './first'; export { a } from './a'; export { b } from './b'`
        // Reference 0 is the plain import, so nothing that must run earlier follows a re-export.
        let map = map_with(
            3,
            vec![
                ("a", Export::ImportedBinding(1, "a".into(), false)),
                ("b", Export::ImportedBinding(2, "b".into(), false)),
            ],
            &[],
        );
        assert_eq!(
            map.export_registration_mode(),
            ExportRegistrationMode::Reexport
        );
    }

    #[test]
    fn export_registration_mode_mixed_when_an_import_follows_a_reexport() {
        // The operator's case: `export { a } from './a'; import { b } from './b';
        // export { c } from './c'`. Reference 1 is the plain import and it follows a re-export, so
        // hoisting would evaluate './c' before './b'.
        let map = map_with(
            3,
            vec![
                ("a", Export::ImportedBinding(0, "a".into(), false)),
                ("c", Export::ImportedBinding(2, "c".into(), false)),
            ],
            &[],
        );
        assert_eq!(
            map.export_registration_mode(),
            ExportRegistrationMode::Mixed
        );
    }

    #[test]
    fn export_registration_mode_mixed_for_a_trailing_side_effect_import() {
        // `export { a } from './a'; import './effect'` -- the side-effect-only import carries a
        // reference but no imported symbol, so it is not a re-export source and must not be hoisted
        // away.
        let mut map = map_with(
            1,
            vec![("a", Export::ImportedBinding(0, "a".into(), false))],
            &[],
        );
        map.ensure_reference(
            ImportMapReference {
                module_path: "./effect".into(),
                imported_symbol: ImportedSymbol::ModuleEvaluation,
                annotations: None,
                span: DUMMY_SP,
            },
            1,
        );
        assert_eq!(
            map.export_registration_mode(),
            ExportRegistrationMode::Mixed
        );
    }

    #[test]
    fn analyzer_tracks_order_for_dummy_span_declarations() {
        fn reexport(path: &str, name: &str) -> ModuleItem {
            ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(NamedExport {
                span: DUMMY_SP,
                specifiers: vec![ExportSpecifier::Named(ExportNamedSpecifier {
                    span: DUMMY_SP,
                    orig: ModuleExportName::Ident(Ident::new(
                        name.into(),
                        DUMMY_SP,
                        Default::default(),
                    )),
                    exported: None,
                    is_type_only: false,
                })],
                src: Some(Box::new(Str {
                    span: DUMMY_SP,
                    value: path.into(),
                    raw: None,
                })),
                type_only: false,
                with: None,
            }))
        }

        let program = Program::Module(Module {
            span: DUMMY_SP,
            body: vec![
                reexport("./a", "a"),
                ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                    span: DUMMY_SP,
                    specifiers: vec![],
                    src: Box::new(Str {
                        span: DUMMY_SP,
                        value: "./b".into(),
                        raw: None,
                    }),
                    type_only: false,
                    with: None,
                    phase: Default::default(),
                })),
                reexport("./b", "b"),
            ],
            shebang: None,
        });
        let globals = Default::default();
        let map = GLOBALS.set(&globals, || ImportMap::analyze(Mark::new(), &program, None));

        assert_eq!(map.reference_declaration_orders, vec![0, 1, 0, 2]);
        assert_eq!(
            map.export_registration_mode(),
            ExportRegistrationMode::Mixed
        );
    }

    #[test]
    fn export_registration_mode_does_not_use_spans_or_reference_indices_for_order() {
        // The references are grouped evaluation-first rather than by declaration, and every
        // declaration has DUMMY_SP, as can happen for transform-inserted imports:
        // `export { a } from './a'; import './b'; export { b } from './b'`.
        // The plain './b' import follows a re-export, so this must be Mixed. Span-based grouping
        // incorrectly treats it as part of the later re-export declaration.
        let mut map = ImportMap::default();
        for (path, symbol, declaration_order) in [
            ("./a", ImportedSymbol::ModuleEvaluation, 0),
            ("./b", ImportedSymbol::ModuleEvaluation, 1),
            ("./a", ImportedSymbol::Symbol("a".into()), 0),
            ("./b", ImportedSymbol::Symbol("b".into()), 2),
        ] {
            map.ensure_reference(
                ImportMapReference {
                    module_path: path.into(),
                    imported_symbol: symbol,
                    annotations: None,
                    span: DUMMY_SP,
                },
                declaration_order,
            );
        }
        map.exports
            .insert("a".into(), Export::ImportedBinding(2, "a".into(), false));
        map.exports
            .insert("b".into(), Export::ImportedBinding(3, "b".into(), false));

        assert_eq!(
            map.export_registration_mode(),
            ExportRegistrationMode::Mixed
        );
    }

    #[test]
    fn export_registration_mode_reexport_for_a_star_reexport() {
        // `export * from './a'` is tracked in `reexport_namespaces`, not `exports`.
        let map = map_with(1, vec![], &[0]);
        assert_eq!(
            map.export_registration_mode(),
            ExportRegistrationMode::Reexport
        );
    }
}
